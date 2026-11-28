import type { AccessZone, DirectoryEntry, VisitorRecord, UserSession } from '../types/swagat';

export const SUPERADMIN_EMAIL = 'director@spmniwas.in';

const NON_GOOGLE_CONSUMER_DOMAINS = new Set([
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.in',
  'ymail.com',
  'rocketmail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.in',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'rediffmail.com',
  'zoho.com',
  'zohomail.in',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'yandex.com',
  'mail.com',
]);

export function validateGoogleAdminEmail(raw: string): {
  valid: boolean;
  email: string;
  error: string;
} {
  const email = String(raw || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { valid: false, email, error: 'Enter a valid Google ID email address.' };
  }
  const domain = email.split('@')[1] || '';
  if (NON_GOOGLE_CONSUMER_DOMAINS.has(domain)) {
    return {
      valid: false,
      email,
      error: `"${domain}" is not supported. Use Gmail, Googlemail, or a Google custom domain.`,
    };
  }
  if (email === SUPERADMIN_EMAIL) {
    return {
      valid: false,
      email,
      error: `${SUPERADMIN_EMAIL} is already the Super Admin account.`,
    };
  }
  return { valid: true, email, error: '' };
}

export const BASE_VISITOR_CATEGORIES = [
  { value: 'Personal Guest', label: 'Personal Guest' },
  { value: 'Official Visitor', label: 'Official Visitor' },
  { value: 'Delivery', label: 'Delivery' },
  { value: 'Cab / Taxi', label: 'Cab / Taxi' },
];

export const HOUSE_ONLY_CATEGORIES = [
  { value: 'Domestic Help', label: 'Domestic Help' },
  { value: 'Service / Vendor', label: 'Service / Vendor' },
];

export function buildCategoryOptions(includeHouseCategories: boolean) {
  if (!includeHouseCategories) return BASE_VISITOR_CATEGORIES;
  return [
    BASE_VISITOR_CATEGORIES[0],
    BASE_VISITOR_CATEGORIES[1],
    HOUSE_ONLY_CATEGORIES[0],
    BASE_VISITOR_CATEGORIES[2],
    BASE_VISITOR_CATEGORIES[3],
    HOUSE_ONLY_CATEGORIES[1],
  ];
}

export function normalizeIndianMobile(raw: string | undefined | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  const hasPlus91 = /^\+91[\s\-]*/.test(trimmed);
  let digits = trimmed.replace(/\D/g, '');

  if (hasPlus91 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }

  // Strip forward 0 trunk prefixes (e.g., 0, 09876543210, 00919876543210)
  digits = digits.replace(/^0+/, '');

  // Strip forward 91 country code when extra digits follow (e.g., 919876543210)
  // while preserving genuine 10-digit Indian numbers starting with 91 (e.g., 91234 56789)
  if (digits.length > 10 && digits.startsWith('91')) {
    const without91 = digits.slice(2).replace(/^0+/, '');
    if (/^[6-9]/.test(without91) || without91.length === 10) {
      digits = without91;
    }
  }

  return digits.slice(0, 10);
}

export function displayIndianMobile(raw: string | undefined | null): string {
  if (!raw) return '';
  const cleaned = normalizeIndianMobile(raw);
  if (!cleaned) return String(raw);
  return cleaned.length > 5 ? `${cleaned.slice(0, 5)} ${cleaned.slice(5)}` : cleaned;
}

export function isValidIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizeIndianMobile(phone));
}

export interface MobileInputResult {
  formatted: string;
  digits: string;
  error: string;
}

export function processMobileInput(raw: string): MobileInputResult {
  const digits = normalizeIndianMobile(raw);
  if (digits.length > 0 && !/^[6-9]/.test(digits)) {
    return {
      formatted: '',
      digits: '',
      error: 'Mobile must start with 6, 7, 8, or 9.',
    };
  }
  return {
    formatted: digits ? displayIndianMobile(digits) : '',
    digits,
    error: '',
  };
}

export function formatTitleCaseValue(val: string): string {
  return val.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function formatDirectoryLabel(d: DirectoryEntry): string {
  return `${d.unit} - ${d.name}`;
}

export function extractUnitName(labelOrUnit: string): string {
  if (!labelOrUnit) return '';
  const idx = labelOrUnit.indexOf(' - ');
  return idx !== -1 ? labelOrUnit.slice(0, idx).trim() : labelOrUnit.trim();
}

export function isSameUnit(destA: string, destB: string): boolean {
  if (!destA || !destB) return false;
  return extractUnitName(destA).toLowerCase() === extractUnitName(destB).toLowerCase();
}

export function getZoneDirectoryLabels(directory: DirectoryEntry[], zone: AccessZone): string[] {
  const entries = directory.filter((d) => d.zone === zone);
  if (zone === 'RESIDENTIAL') {
    const seenUnits = new Set<string>();
    const labels: string[] = [];
    entries.forEach((d) => {
      const key = d.unit.trim().toLowerCase();
      if (!seenUnits.has(key)) {
        seenUnits.add(key);
        labels.push(formatDirectoryLabel(d));
      }
    });
    return labels;
  }
  return entries.map(formatDirectoryLabel);
}

export function canHostViewVisitor(
  visitor: VisitorRecord,
  session: UserSession | null,
  directory: DirectoryEntry[]
): boolean {
  if (!session || !session.allowedUnits || session.allowedUnits.length === 0) {
    return false;
  }
  return session.allowedUnits.some((targetUnit) => {
    const isResidential =
      targetUnit.toLowerCase().startsWith('flat') ||
      directory.some((d) => d.zone === 'RESIDENTIAL' && isSameUnit(d.unit, targetUnit));
    if (isResidential) {
      return isSameUnit(visitor.destination, targetUnit);
    }
    return (
      visitor.destination === targetUnit ||
      (visitor.hostPhone &&
        visitor.hostPhone === session.phone &&
        isSameUnit(visitor.destination, targetUnit))
    );
  });
}

export function isPrimaryHostOfFlat(
  member: DirectoryEntry | undefined,
  allFlatMembers: DirectoryEntry[],
  directory: DirectoryEntry[]
): boolean {
  if (!member) return false;
  if (member.isPrimaryHost === true) return true;
  if (member.isFamilyMember === true) return false;
  const memberPhone = normalizeIndianMobile(member.phone);
  const hasOfficeAllotment = directory.some(
    (d) => d.zone === 'OFFICE' && normalizeIndianMobile(d.phone) === memberPhone
  );
  if (hasOfficeAllotment) return true;
  return allFlatMembers.length > 0 && allFlatMembers[0].id === member.id;
}

export function resolveHostDestinationForCategory(
  guestType: string,
  session: UserSession | null,
  directory: DirectoryEntry[]
): string {
  const units = session?.allowedUnits ?? [];
  if (units.length === 0) return 'SPM NIWAS';
  if (units.length === 1) return units[0];

  const resUnit = units.find(
    (u) =>
      u.toLowerCase().startsWith('flat') ||
      directory.some((d) => d.zone === 'RESIDENTIAL' && isSameUnit(d.unit, u))
  );
  const officeUnit = units.find((u) => u !== resUnit);

  if (guestType === 'Official Visitor') {
    return officeUnit || units[0];
  }
  return resUnit || units[0];
}

let sharedAudioCtx: AudioContext | null = null;

export function unlockSharedAudioContext(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function playGateDoorbellChime(): void {
  try {
    const ctx = unlockSharedAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      { freq: 659.25, delay: 0.0, dur: 0.45 },
      { freq: 523.25, delay: 0.22, dur: 0.5 },
      { freq: 783.99, delay: 0.48, dur: 0.65 },
    ];
    notes.forEach(({ freq, delay, dur }) => {
      const osc = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      harmonic.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + delay);
      harmonic.frequency.setValueAtTime(freq * 2, now + delay);
      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.32, now + delay + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.connect(gain);
      harmonic.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      harmonic.start(now + delay);
      osc.stop(now + delay + dur + 0.03);
      harmonic.stop(now + delay + dur + 0.03);
    });
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 150, 300, 150, 450]);
    }
  } catch {
    // Ignore WebAudio errors on restricted devices
  }
}

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData?.mobile === true) return true;
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Windows Phone/i.test(ua)) {
    return true;
  }
  const hasCoarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const isNarrowScreen = window.innerWidth <= 768;
  return hasCoarsePointer && navigator.maxTouchPoints > 0 && isNarrowScreen;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Compact RFC 6234 fallback for non-HTTPS local testing
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(paddedLen - 4, bitLen >>> 0, false);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H)
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('');
}

export async function computePhoneHash(phone: string): Promise<string> {
  const clean = normalizeIndianMobile(phone);
  return sha256Hex(`spmniwas:${clean}`);
}

export async function computePinCredentialHash(phone: string, pin: string): Promise<string> {
  const clean = normalizeIndianMobile(phone);
  return sha256Hex(`spmniwas:${clean}:${String(pin || '').trim()}`);
}
