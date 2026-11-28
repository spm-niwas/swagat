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
