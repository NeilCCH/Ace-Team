export const SESSION_COOKIE = 'sc_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSubtle(): SubtleCrypto {
  return globalThis.crypto.subtle;
}

function getSecretKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  const keyData = new TextEncoder().encode(secret);
  return getSubtle().importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Signed, expiring session token — a plain HMAC'd payload rather than a full JWT library,
// since the only claim we need is "which allow-listed email is this". Uses Web Crypto so
// the same code works in both the Edge middleware and the Node route handlers.
export async function signSession(email: string): Promise<string> {
  const payload = JSON.stringify({ email, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 });
  const payloadB64 = base64urlEncode(new TextEncoder().encode(payload));
  const key = await getSecretKey();
  const sig = await getSubtle().sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = base64urlEncode(new Uint8Array(sig));
  return payloadB64 + '.' + sigB64;
}

export async function verifySession(token: string): Promise<string | null> {
  try {
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return null;
    const key = await getSecretKey();
    const valid = await getSubtle().verify(
      'HMAC',
      key,
      base64urlDecode(sigB64) as BufferSource,
      new TextEncoder().encode(payloadB64),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64))) as {
      email?: unknown;
      exp?: unknown;
    };
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    if (typeof payload.email !== 'string' || !payload.email) return null;
    return payload.email;
  } catch {
    return null;
  }
}

export function isAllowedEmail(email: string): boolean {
  const list = (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
