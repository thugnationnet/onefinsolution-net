import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from 'express';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { softwareCatalog } from './src/data/catalog';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = 'ofs-software-session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const dummySalt = randomBytes(16).toString('hex');
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

class RequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function databasePool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required for the One Fin Software service.');
  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
}

function softwareStripe() {
  const key = process.env.SOFTWARE_STRIPE_SECRET_KEY?.trim();
  if (!key || !key.startsWith('sk_test_')) {
    throw new RequestError(503, 'The One Fin Software Stripe sandbox is not configured.');
  }
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
}

function softwareAppUrl() {
  const value = process.env.SOFTWARE_APP_URL?.trim();
  if (!value) throw new RequestError(503, 'The storefront URL is not configured.');
  const url = new URL(value);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new RequestError(503, 'The storefront URL must use HTTPS.');
  }
  return url.origin;
}

const pool = databasePool();
pool.on('error', (error) => console.error('Idle software database connection failed.', error));

function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function derivePassword(password: string, salt: string, legacy = false) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, legacy ? {} : PASSWORD_SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128) {
    throw new RequestError(400, 'Use a password between 12 and 128 characters.');
  }
  const salt = randomBytes(16).toString('hex');
  const derived = await derivePassword(password, salt);
  return `scrypt-v1:${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, encoded] = stored.split(':');
  if (!['scrypt-v1', 'scrypt'].includes(algorithm) || !salt || !encoded || password.length > 128) return false;
  const actual = await derivePassword(password, salt, algorithm === 'scrypt');
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function setSessionCookie(response: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production';
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

function clearSessionCookie(response: Response) {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') throw new RequestError(400, 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RequestError(400, 'Enter a valid email address.');
  }
  return email;
}

function readText(value: unknown, field: string) {
  if (typeof value !== 'string') throw new RequestError(400, `Enter a valid ${field}.`);
  return value;
}

function requireSameOrigin(request: Request) {
  const origin = request.get('origin');
  const host = request.get('host');
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) throw new RequestError(403, 'This request is not allowed.');
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError(403, 'This request is not allowed.');
    }
  }
  if (request.get('sec-fetch-site') === 'cross-site') {
    throw new RequestError(403, 'This request is not allowed.');
  }
}

async function limitAttempts(scope: string, email: string, address: string, limit: number) {
  await pool.query('delete from ofs_store.auth_rate_limits where expires_at <= now()');
  const keyHash = hashToken(`${scope}:${email}:${address}`);
  const result = await pool.query<{ attempts: number }>(
    `insert into ofs_store.auth_rate_limits (key_hash, attempts, expires_at)
     values ($1, 1, now() + interval '15 minutes')
     on conflict (key_hash) do update
     set attempts = case when ofs_store.auth_rate_limits.expires_at < now() then 1 else ofs_store.auth_rate_limits.attempts + 1 end,
         expires_at = case when ofs_store.auth_rate_limits.expires_at < now() then now() + interval '15 minutes' else ofs_store.auth_rate_limits.expires_at end
     returning attempts`,
    [keyHash],
  );
  if (result.rows[0].attempts > limit) {
    throw new RequestError(429, 'Too many attempts. Please try again in 15 minutes.');
  }
}

async function createSession(userId: string, response: Response) {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `insert into ofs_store.sessions (token_hash, user_id, expires_at)
     values ($1, $2, now() + interval '30 days')`,
    [hashToken(token), userId],
  );
  setSessionCookie(response, token);
}

async function currentUser(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await pool.query<{ id: string; email: string }>(
    `select users.id, users.email
     from ofs_store.sessions sessions
     join ofs_store.users users on users.id = sessions.user_id
     where sessions.token_hash = $1 and sessions.expires_at > now()
     limit 1`,
    [hashToken(token)],
  );
  return result.rows[0] || null;
}

function asyncRoute(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => { void handler(request, response).catch(next); };
}

async function sendResetEmail(email: string, token: string) {
  const apiKey = process.env.SOFTWARE_RESEND_API_KEY?.trim();
  const from = process.env.SOFTWARE_EMAIL_FROM?.trim();
  const appUrl = process.env.SOFTWARE_APP_URL?.trim();
  if (!apiKey || !from || !appUrl) {
    throw new RequestError(503, 'Password reset email is not configured yet. Please try again later.');
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(appUrl);
  } catch {
    throw new Error('SOFTWARE_APP_URL must be an absolute URL.');
  }
  if (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:') {
    throw new Error('SOFTWARE_APP_URL must use HTTPS in production.');
  }
  const resetUrl = new URL('/', baseUrl);
  resetUrl.searchParams.set('reset', token);
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Reset your One Fin Software password',
      text: `Use this link within 30 minutes to reset your password: ${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use the link below within 30 minutes to reset your password.</p><p><a href="${resetUrl.toString()}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    }),
  });
  if (!result.ok) {
    const responseText = await result.text();
    console.error('Password reset email was rejected by the delivery provider.', responseText.slice(0, 500));
    throw new RequestError(502, 'We could not send the reset email. Please try again later.');
  }
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), asyncRoute(async (request, response) => {
  const secret = process.env.SOFTWARE_STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new RequestError(503, 'The One Fin Software Stripe webhook is not configured.');
  const stripe = softwareStripe();
  const signature = request.get('stripe-signature');
  if (!signature || !Buffer.isBuffer(request.body)) {
    throw new RequestError(400, 'A valid Stripe signature is required.');
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(request.body, signature, secret);
  } catch {
    throw new RequestError(400, 'The Stripe signature is invalid.');
  }
  if (event.livemode) throw new RequestError(400, 'Live Stripe events are not accepted by the sandbox storefront.');

  const handledEvents = new Set([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'checkout.session.expired',
  ]);
  if (!handledEvents.has(event.type)) {
    response.json({ received: true });
    return;
  }

  const checkout = event.data.object as Stripe.Checkout.Session;
  if (!checkout.id.startsWith('cs_test_')) {
    throw new RequestError(400, 'Only Stripe test-mode checkout sessions are accepted.');
  }
  const orderId = checkout.metadata?.orderId;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    throw new RequestError(400, 'The checkout session does not contain a valid order reference.');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const eventInsert = await client.query(
      `insert into ofs_store.stripe_events (event_id, event_type)
       values ($1, $2) on conflict (event_id) do nothing returning event_id`,
      [event.id, event.type],
    );
    if (eventInsert.rowCount === 0) {
      await client.query('commit');
      response.json({ received: true });
      return;
    }

    const orderResult = await client.query<{
      id: string;
      amount_satang: number;
      currency: string;
      stripe_checkout_session_id: string | null;
    }>(
      `select id, amount_satang, currency, stripe_checkout_session_id
       from ofs_store.orders where id = $1 for update`,
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order ||
      (order.stripe_checkout_session_id && order.stripe_checkout_session_id !== checkout.id) ||
      checkout.amount_total !== order.amount_satang ||
      checkout.currency !== order.currency) {
      throw new Error(`Stripe checkout event ${event.id} did not match its order.`);
    }

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (checkout.payment_status === 'paid') {
        const paymentIntentId = typeof checkout.payment_intent === 'string' ? checkout.payment_intent : checkout.payment_intent?.id ?? null;
        await client.query(
          `update ofs_store.orders
           set status = 'paid', stripe_checkout_session_id = $2, stripe_payment_intent_id = $3, updated_at = now()
           where id = $1`,
          [order.id, checkout.id, paymentIntentId],
        );
      } else if (!order.stripe_checkout_session_id) {
        await client.query(
          `update ofs_store.orders set stripe_checkout_session_id = $2, updated_at = now() where id = $1`,
          [order.id, checkout.id],
        );
      }
    } else if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
      await client.query(
        `update ofs_store.orders set status = $2, stripe_checkout_session_id = $3, updated_at = now()
         where id = $1 and status = 'pending'`,
        [order.id, event.type.endsWith('.expired') ? 'canceled' : 'failed', checkout.id],
      );
    }
    await client.query('commit');
    response.json({ received: true });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}));
app.use('/api', express.json({ limit: '24kb', type: 'application/json' }));

app.get('/api/health', asyncRoute(async (_request, response) => {
  await pool.query('select 1');
  response.json({ status: 'ok' });
}));

app.get('/api/checkout/status', (_request, response) => {
  const secretKey = process.env.SOFTWARE_STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.SOFTWARE_STRIPE_WEBHOOK_SECRET?.trim();
  response.json({ available: Boolean(secretKey?.startsWith('sk_test_') && webhookSecret && process.env.SOFTWARE_APP_URL?.trim()) });
});

app.get('/api/auth/session', asyncRoute(async (request, response) => {
  response.json({ user: await currentUser(request) });
}));

app.post('/api/checkout/session', asyncRoute(async (request, response) => {
  requireSameOrigin(request);
  const user = await currentUser(request);
  if (!user) throw new RequestError(401, 'Sign in to purchase a template.');

  const productId = request.body?.productId;
  if (typeof productId !== 'string') throw new RequestError(400, 'Choose a valid template.');
  const product = softwareCatalog.find((candidate) => candidate.id === productId);
  if (!product) throw new RequestError(400, 'Choose a valid template.');

  const stripe = softwareStripe();
  const baseUrl = softwareAppUrl();
  const address = request.ip || 'unknown';
  await limitAttempts('checkout', user.email, address, 8);
  const orderResult = await pool.query<{ id: string }>(
    `insert into ofs_store.orders (user_id, product_id, product_name, amount_satang)
     values ($1, $2, $3, $4) returning id`,
    [user.id, product.id, product.name, product.amountSatang],
  );
  const orderId = orderResult.rows[0].id;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      client_reference_id: orderId,
      metadata: { orderId, userId: user.id, productId: product.id },
      payment_intent_data: { metadata: { orderId, userId: user.id, productId: product.id } },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'thb',
          unit_amount: product.amountSatang,
          product_data: { name: product.name, description: product.description },
        },
      }],
      success_url: `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?checkout=cancel`,
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    await pool.query(
      `update ofs_store.orders set stripe_checkout_session_id = $2, updated_at = now() where id = $1`,
      [orderId, session.id],
    );
    response.status(201).json({ url: session.url });
  } catch (error) {
    await pool.query(
      `update ofs_store.orders set status = 'failed', updated_at = now() where id = $1 and status = 'pending'`,
      [orderId],
    );
    throw error;
  }
}));

app.get('/api/checkout/confirm', asyncRoute(async (request, response) => {
  const user = await currentUser(request);
  if (!user) throw new RequestError(401, 'Sign in to view this purchase.');
  const sessionId = request.query.session_id;
  if (typeof sessionId !== 'string' || !/^cs_test_[A-Za-z0-9_]{8,240}$/.test(sessionId)) {
    throw new RequestError(400, 'The checkout reference is invalid.');
  }

  const stripe = softwareStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const orderId = session.metadata?.orderId;
  if (!orderId || session.metadata?.userId !== user.id) {
    throw new RequestError(404, 'This purchase could not be found for your account.');
  }

  const client = await pool.connect();
  let status: 'paid' | 'pending' | 'failed' | 'canceled' = 'pending';
  try {
    await client.query('begin');
    const orderResult = await client.query<{
      id: string;
      user_id: string;
      amount_satang: number;
      currency: string;
      status: 'paid' | 'pending' | 'failed' | 'canceled';
      stripe_checkout_session_id: string | null;
    }>(
      `select id, user_id, amount_satang, currency, status, stripe_checkout_session_id
       from ofs_store.orders where id = $1 for update`,
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order ||
      order.user_id !== user.id ||
      (order.stripe_checkout_session_id && order.stripe_checkout_session_id !== session.id) ||
      session.amount_total !== order.amount_satang ||
      session.currency !== order.currency ||
      session.mode !== 'payment' ||
      session.livemode) {
      throw new RequestError(404, 'This purchase could not be verified.');
    }

    if (session.payment_status === 'paid') {
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
      await client.query(
        `update ofs_store.orders
         set status = 'paid', stripe_checkout_session_id = $2, stripe_payment_intent_id = $3, updated_at = now()
         where id = $1`,
        [order.id, session.id, paymentIntentId],
      );
      status = 'paid';
    } else if (session.status === 'expired') {
      await client.query(
        `update ofs_store.orders set status = 'canceled', stripe_checkout_session_id = $2, updated_at = now()
         where id = $1 and status = 'pending'`,
        [order.id, session.id],
      );
      status = 'canceled';
    } else if (order.status === 'failed' || order.status === 'canceled') {
      status = order.status;
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  response.json({ status });
}));

app.get('/api/orders', asyncRoute(async (request, response) => {
  const user = await currentUser(request);
  if (!user) throw new RequestError(401, 'Sign in to view your purchases.');
  const orders = await pool.query<{
    id: string;
    product_name: string;
    amount_satang: number;
    currency: string;
    status: string;
    created_at: Date;
  }>(
    `select id, product_name, amount_satang, currency, status, created_at
     from ofs_store.orders where user_id = $1 order by created_at desc limit 50`,
    [user.id],
  );
  response.json({ orders: orders.rows });
}));

app.post('/api/auth/sign-up', asyncRoute(async (request, response) => {
  requireSameOrigin(request);
  const email = normalizeEmail(request.body?.email);
  const password = readText(request.body?.password, 'password');
  if (request.body?.acceptTerms !== true) {
    throw new RequestError(400, 'Agree to the Terms & Conditions and Privacy Policy to create an account.');
  }
  await limitAttempts('sign-up', email, request.ip || 'unknown', 5);
  const passwordHash = await hashPassword(password);
  let user: { id: string; email: string };
  try {
    const result = await pool.query<{ id: string; email: string }>(
      `insert into ofs_store.users (email, password_hash, accepted_terms_at, terms_version)
       values ($1, $2, now(), $3) returning id, email`,
      [email, passwordHash, process.env.SOFTWARE_TERMS_VERSION?.trim() || '2026-10'],
    );
    user = result.rows[0];
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new RequestError(409, 'An account with this email already exists. Please sign in.');
    }
    throw error;
  }
  await createSession(user.id, response);
  response.status(201).json({ user });
}));

app.post('/api/auth/sign-in', asyncRoute(async (request, response) => {
  requireSameOrigin(request);
  const email = normalizeEmail(request.body?.email);
  const password = readText(request.body?.password, 'password');
  await limitAttempts('sign-in', email, request.ip || 'unknown', 10);
  const result = await pool.query<{ id: string; email: string; password_hash: string }>(
    'select id, email, password_hash from ofs_store.users where email = $1 limit 1',
    [email],
  );
  const storedHash = result.rows[0]?.password_hash || `scrypt-v1:${dummySalt}:${'00'.repeat(64)}`;
  const passwordMatches = await verifyPassword(password, storedHash);
  if (!result.rows[0] || !passwordMatches) {
    throw new RequestError(401, 'Email or password is incorrect.');
  }
  await createSession(result.rows[0].id, response);
  response.json({ user: { id: result.rows[0].id, email: result.rows[0].email } });
}));

app.post('/api/auth/logout', asyncRoute(async (request, response) => {
  requireSameOrigin(request);
  const token = readCookie(request, SESSION_COOKIE);
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    await pool.query('delete from ofs_store.sessions where token_hash = $1', [hashToken(token)]);
  }
  clearSessionCookie(response);
  response.json({ ok: true });
}));

app.post('/api/auth/forgot-password', asyncRoute(async (request, response) => {
  requireSameOrigin(request);
  const email = normalizeEmail(request.body?.email);
  await limitAttempts('forgot-password', email, request.ip || 'unknown', 5);
  if (!process.env.SOFTWARE_RESEND_API_KEY?.trim() || !process.env.SOFTWARE_EMAIL_FROM?.trim() || !process.env.SOFTWARE_APP_URL?.trim()) {
    throw new RequestError(503, 'Password reset email is not configured yet. Please try again later.');
  }
  const userResult = await pool.query<{ id: string }>(
    'select id from ofs_store.users where email = $1 limit 1',
    [email],
  );
  if (userResult.rows[0]) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    await pool.query(
      `insert into ofs_store.password_reset_tokens (token_hash, user_id, expires_at)
       values ($1, $2, now() + interval '30 minutes')`,
      [tokenHash, userResult.rows[0].id],
    );
    try {
      await sendResetEmail(email, token);
    } catch (error) {
      await pool.query('delete from ofs_store.password_reset_tokens where token_hash = $1', [tokenHash]);
      throw error;
    }
  }
  response.json({ message: 'If an account exists for this address, password reset instructions have been sent.' });
}));

app.post('/api/auth/reset-password', asyncRoute(async (request, response) => {
  requireSameOrigin(request);
  const token = readText(request.body?.token, 'reset token');
  const password = readText(request.body?.password, 'password');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new RequestError(400, 'This reset link is invalid or expired. Request a new one.');
  }
  const passwordHash = await hashPassword(password);
  const client: PoolClient = await pool.connect();
  try {
    await client.query('begin');
    const deleted = await client.query<{ user_id: string }>(
      `delete from ofs_store.password_reset_tokens
       where token_hash = $1 and expires_at > now()
       returning user_id`,
      [hashToken(token)],
    );
    if (!deleted.rows[0]) throw new RequestError(400, 'This reset link is invalid or expired. Request a new one.');
    const userId = deleted.rows[0].user_id;
    await client.query('update ofs_store.users set password_hash = $1, updated_at = now() where id = $2', [passwordHash, userId]);
    await client.query('delete from ofs_store.sessions where user_id = $1', [userId]);
    await client.query('delete from ofs_store.password_reset_tokens where user_id = $1', [userId]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  response.json({ ok: true });
}));

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API endpoint not found.' });
});

const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  if (response.headersSent) return;
  if (error instanceof RequestError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  console.error(`Software service request failed at ${request.method} ${request.path}.`, error);
  response.status(500).json({ error: 'The request could not be completed. Please try again later.' });
};
app.use('/api', errorHandler);

async function startServer() {
  const schema = await readFile(path.join(moduleDirectory, 'schema.sql'), 'utf8');
  await pool.query(schema);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(moduleDirectory, 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (_request, response) => response.sendFile(path.join(distPath, 'index.html')));
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`One Fin Software listening on port ${PORT}.`);
  });
}

startServer().catch((error: unknown) => {
  console.error('One Fin Software could not start.', error);
  process.exitCode = 1;
});
