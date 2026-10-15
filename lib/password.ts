import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
const options = {N:32768,r:8,p:3,maxmem:64*1024*1024};
function derive(password:string,salt:string,modern=true) {
  return new Promise<Buffer>((resolve,reject)=>scryptCallback(password,salt,64,modern?options:{},(error,key)=>error?reject(error):resolve(key)));
}
export function tokenHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function randomToken() { return randomBytes(32).toString('base64url'); }
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128) throw new Error('Use a password between 12 and 128 characters.');
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password,salt);
  return `scrypt-v1:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm,salt,hex] = stored.split(':');
  if (!['scrypt','scrypt-v1'].includes(algorithm) || !salt || !hex || password.length > 128) return false;
  const hash = await derive(password,salt,algorithm==='scrypt-v1');
  const expected = Buffer.from(hex,'hex');
  return expected.length === hash.length && timingSafeEqual(hash,expected);
}
