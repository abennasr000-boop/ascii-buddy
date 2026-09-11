// Short random ids (crypto-backed, no dependency). See ID in ../types/model.ts.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function makeId(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
