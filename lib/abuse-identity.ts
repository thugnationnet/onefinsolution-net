import 'server-only';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
export function privateHash(value: string) {
  const key = process.env.WORKSPACE_SIGNING_KEY;
  if (!key || key.length < 32) throw new Error('Workspace security is not configured.');
  return createHmac('sha256', key).update(value).digest('hex');
}
export function visitorIdentities(headers: Headers, cookie: string, fingerprint: string) {
  // Railway overwrites X-Real-IP at its public edge. Do not trust X-Forwarded-For.
  const ip = headers.get('x-real-ip') || (process.env.NODE_ENV !== 'production' ? '127.0.0.1' : '');
  if (!isIP(ip)) throw new Error('Unable to verify the visitor network. Please sign in.');
  // Normalize IPv6 privacy addresses to their /64 network.
  const address = isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1,-1) : ip;
  const network = isIP(ip) === 6 ? expandIPv6(address).slice(0,4).join(':') : address;
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Browser identification is required.');
  return [...new Set([privateHash(`network:${network}`),privateHash(`browser:${fingerprint}`),privateHash(`cookie:${cookie}`)])].sort();
}
function expandIPv6(value:string) {
  const [left,right] = value.split('::');
  const head=left?left.split(':'):[],tail=right?right.split(':'):[];
  return [...head,...Array(Math.max(0,8-head.length-tail.length)).fill('0'),...tail].map(part=>part.padStart(4,'0'));
}
