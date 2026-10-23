import crypto from 'node:crypto';

export type IdPrefix = 'REQ' | 'DEC' | 'CST' | 'PRF' | 'CHG' | 'VER' | 'TKT' | 'AC';

let lastTimestamp = 0;
let sequenceCounter = 0;

export function generateId(prefix: IdPrefix): string {
  const now = Date.now();
  if (now === lastTimestamp) {
    sequenceCounter = (sequenceCounter + 1) & 0xffff;
  } else {
    lastTimestamp = now;
    // Initialize sequence counter with 12-bit random offset
    sequenceCounter = crypto.randomInt(0, 0x1000);
  }

  const epochHex = now.toString(16);
  const seqHex = sequenceCounter.toString(16).padStart(4, '0');
  return `${prefix}-${epochHex}-${seqHex}`;
}

export function isValidId(id: string, prefix?: IdPrefix): boolean {
  if (typeof id !== 'string') return false;
  const parts = id.split('-');
  if (parts.length !== 3) return false;
  if (prefix && parts[0] !== prefix) return false;
  const validPrefixes = ['REQ', 'DEC', 'CST', 'PRF', 'CHG', 'VER', 'TKT', 'AC'];
  if (!validPrefixes.includes(parts[0])) return false;
  if (!/^[0-9a-f]+$/i.test(parts[1])) return false;
  if (!/^[0-9a-f]{4}$/i.test(parts[2])) return false;
  return true;
}
