import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import type {
  AccessZone,
  AppStatePayload,
  DirectoryEntry,
  GeofenceConfig,
  RoleType,
  VisitorRecord,
  VisitorStatus,
} from '../types/swagat';
import {
  computePhoneHash,
  computePinCredentialHash,
  formatDirectoryLabel,
  formatTime,
  normalizeIndianMobile,
  SUPERADMIN_EMAIL,
} from '../utils/formatters';

function sanitizeIdPart(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

function hashString(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function makeHousingUnitDocId(unitName: string): string {
  const normalized = unitName.trim().toLowerCase();
  const slug = sanitizeIdPart(normalized).slice(0, 60) || 'unit';
  return `unit_${slug}_${hashString(normalized)}`;
}

function makeRecordId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
}

function clampRadius(r: unknown): number {
  const num = typeof r === 'number' && Number.isFinite(r) ? r : 100;
  return Math.max(10, Math.min(5000, Math.round(num)));
}

export function makeEmailKey(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export function formatFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const rawMessage = err instanceof Error ? err.message : String(err || '');
  const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';

  if (code === 'auth/unauthorized-domain' || rawMessage.includes('auth/unauthorized-domain')) {
    return `Domain "${host}" is not authorized in Firebase Authentication. Add "${host}" under Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  if (code === 'auth/popup-blocked' || rawMessage.includes('auth/popup-blocked')) {
    return 'Google Sign-In popup was blocked by your browser. Allow popups or wait for redirect sign-in.';
  }
  if (code === 'auth/popup-closed-by-user' || rawMessage.includes('auth/popup-closed-by-user')) {
    return 'Google Sign-In popup was closed before completing login. Please try again.';
  }
  if (code === 'auth/cancelled-popup-request' || rawMessage.includes('auth/cancelled-popup-request')) {
    return 'Sign-in request was interrupted. Please tap Continue with Google again.';
  }
  if (code === 'auth/network-request-failed' || rawMessage.includes('auth/network-request-failed')) {
    return 'Network error contacting Google Sign-In. Check your internet connection and retry.';
  }
  if (code === 'auth/operation-not-allowed' || rawMessage.includes('auth/operation-not-allowed')) {
    return 'Google Sign-In provider is disabled in Firebase Console → Authentication → Sign-in method.';
  }
  if (rawMessage.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawMessage) as { error?: string; path?: string };
      if (parsed?.error) {
        return parsed.path ? `${parsed.error} (${parsed.path})` : parsed.error;
      }
    } catch {
      // ignore non-JSON
    }
  }
  return rawMessage || 'Google Sign-In failed. Please try again.';
}

export async function signInWithGoogleFirebase(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

export async function checkGoogleRedirectResult(): Promise<User | null> {
  const result = await getRedirectResult(auth);
  return result ? result.user : null;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export interface ResolvedFirebaseUser {
  authorized: boolean;
  role: RoleType;
  isAdmin: boolean;
  isGuard: boolean;
  name: string;
  email: string;
  phone: string;
  allowedUnits: string[];
}

export async function ensureAndResolveFirebaseUser(user: User): Promise<ResolvedFirebaseUser> {
  const email = (user.email || '').trim().toLowerCase();
  const displayName = (user.displayName || email.split('@')[0] || 'Campus Admin').trim().slice(0, 100);
  const emailVerified = user.emailVerified !== false;
  const isSuperAdmin = emailVerified && email === SUPERADMIN_EMAIL;

  let isApprovedAdmin = false;
  let approvedAdminName = '';
  if (!isSuperAdmin && emailVerified && email) {
    try {
      const approvedSnap = await getDoc(doc(db, 'approvedAdmins', makeEmailKey(email)));
      if (approvedSnap.exists()) {
        isApprovedAdmin = true;
        approvedAdminName = String(approvedSnap.data()?.name || '').trim();
      }
    } catch {
      isApprovedAdmin = false;
    }
  }

  if (!isSuperAdmin && !isApprovedAdmin) {
    return {
      authorized: false,
      role: 'host',
      isAdmin: false,
      isGuard: false,
      name: displayName,
      email,
      phone: '',
      allowedUnits: [],
    };
  }

  const role: RoleType = isSuperAdmin ? 'superadmin' : 'admin';
  const resolvedName = (isSuperAdmin ? 'Director SPM NIWAS' : approvedAdminName || displayName).slice(0, 100);

  const userRef = doc(db, 'users', user.uid);
  let profileData: Record<string, unknown> | null = null;
  try {
    const snap = await getDoc(userRef);
    profileData = snap.exists() ? snap.data() : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
  }

  if (!profileData) {
    try {
      await setDoc(userRef, {
        uid: user.uid,
        email: email || `${user.uid}@spmniwas.local`,
        displayName: resolvedName,
        role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
    }
  }

  return {
    authorized: true,
    role,
    isAdmin: true,
    isGuard: false,
    name: resolvedName,
    email,
    phone: '',
    allowedUnits: [],
  };
}

async function upsertPinCredentialDoc(params: {
  credHash: string;
  phone: string;
  phoneHash: string;
  role: 'guard' | 'host';
  name: string;
  directoryIds: string[];
  pinMustChange: boolean;
}): Promise<void> {
  const ref = doc(db, 'pinCredentials', params.credHash);
  let mergedIds = Array.from(new Set(params.directoryIds)).slice(0, 20);
  let resolvedRole = params.role;
  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      const prevIds = Array.isArray(existingData.directoryIds)
        ? existingData.directoryIds.map(String)
        : [];
      mergedIds = Array.from(new Set([...prevIds, ...mergedIds])).slice(0, 20);
      if (existingData.role === 'guard') resolvedRole = 'guard';
      await updateDoc(ref, {
        phone: params.phone,
        phoneHash: params.phoneHash,
        role: resolvedRole,
        name: params.name,
        directoryIds: mergedIds,
        pinMustChange: params.pinMustChange,
        updatedAt: serverTimestamp(),
      });
      return;
    }
  } catch {
    // Fall through to setDoc
  }
  await setDoc(ref, {
    credHash: params.credHash,
    phone: params.phone,
    phoneHash: params.phoneHash,
    role: resolvedRole,
    name: params.name,
    directoryIds: mergedIds,
    pinMustChange: params.pinMustChange,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function syncMissingPinCredentialsIfNeeded(): Promise<void> {
  try {
    const dirSnap = await getDocs(collection(db, 'directory'));
    const credBuckets = new Map<
      string,
      {
        credHash: string;
        phone: string;
        phoneHash: string;
        role: 'guard' | 'host';
        name: string;
        directoryIds: string[];
        pinMustChange: boolean;
      }
    >();
    const batch = writeBatch(db);
    let dirUpdates = 0;

    for (const d of dirSnap.docs) {
      const data = d.data();
      if (data.zone === 'SUPERADMIN' || data.zone === 'ADMIN') continue;
      const cleanPhone = normalizeIndianMobile(String(data.phone || ''));
      const pin = String(data.pin || '').trim();
      if (cleanPhone.length !== 10 || !/^\d{4}$/.test(pin)) continue;

      const phoneHash = await computePhoneHash(cleanPhone);
      const claimHash = await computePinCredentialHash(cleanPhone, pin);
      if (data.claimHash !== claimHash || data.phoneHash !== phoneHash) {
        batch.update(d.ref, {
          claimHash,
          phoneHash,
          updatedAt: serverTimestamp(),
        });
        dirUpdates++;
      }

      const existing = credBuckets.get(claimHash);
      const entryRole: 'guard' | 'host' = data.zone === 'GUARD' ? 'guard' : 'host';
      if (existing) {
        existing.directoryIds.push(d.id);
        if (entryRole === 'guard') existing.role = 'guard';
        if (data.pinMustChange) existing.pinMustChange = true;
      } else {
        credBuckets.set(claimHash, {
          credHash: claimHash,
          phone: cleanPhone,
          phoneHash,
          role: entryRole,
          name: String(data.name || 'SPM NIWAS Member').slice(0, 100),
          directoryIds: [d.id],
          pinMustChange: Boolean(data.pinMustChange),
        });
      }
    }

    if (dirUpdates > 0) {
      await batch.commit();
    }

    for (const bucket of credBuckets.values()) {
      const credRef = doc(db, 'pinCredentials', bucket.credHash);
      const snap = await getDoc(credRef);
      const prevIds = snap.exists() && Array.isArray(snap.data().directoryIds)
        ? snap.data().directoryIds.map(String)
        : [];
      const sameLength =
        prevIds.length === bucket.directoryIds.length &&
        bucket.directoryIds.every((id) => prevIds.includes(id));
      if (!snap.exists() || !sameLength) {
        await upsertPinCredentialDoc(bucket);
      }
    }
  } catch (err) {
    console.warn('Pin credential sync skipped:', err);
  }
}

export interface ClaimedPinLoginResult {
  role: 'guard' | 'host';
  name: string;
  phone: string;
  pinMustChange: boolean;
  directoryEntries: DirectoryEntry[];
}

export async function fsVerifyAndClaimPinLogin(
  user: User,
  phone: string,
  pin: string
): Promise<ClaimedPinLoginResult | null> {
  const cleanPhone = normalizeIndianMobile(phone);
  const cleanPin = String(pin || '').trim();
  if (cleanPhone.length !== 10 || !/^\d{4}$/.test(cleanPin)) return null;

  const credHash = await computePinCredentialHash(cleanPhone, cleanPin);
  let credSnap;
  try {
    credSnap = await getDoc(doc(db, 'pinCredentials', credHash));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `pinCredentials/${credHash}`);
  }
  if (!credSnap.exists()) return null;

  const credData = credSnap.data();
  const role: 'guard' | 'host' = credData.role === 'guard' ? 'guard' : 'host';
  const name = String(credData.name || 'SPM NIWAS Member').slice(0, 100);
  const directoryIds = Array.isArray(credData.directoryIds)
    ? credData.directoryIds.map(String).filter(Boolean)
    : [];

  if (role === 'guard') {
    const guardRef = doc(db, 'guards', user.uid);
    const guardSnap = await getDoc(guardRef).catch(() => null);
    if (!guardSnap || !guardSnap.exists()) {
      try {
        await setDoc(guardRef, {
          uid: user.uid,
          email: (user.email || `${user.uid}@spmniwas.local`).trim().toLowerCase().slice(0, 120),
          name,
          gateUnit: 'Main Gate',
          claimProof: credHash,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `guards/${user.uid}`);
      }
    }
  }

  const claimedEntries: DirectoryEntry[] = [];
  for (const dirId of directoryIds) {
    try {
      await updateDoc(doc(db, 'directory', dirId), {
        uid: user.uid,
        claimProof: `${credHash}_${user.uid}`,
        updatedAt: serverTimestamp(),
      });
      const dSnap = await getDoc(doc(db, 'directory', dirId));
      if (dSnap.exists()) {
        const entry = { id: dSnap.id, ...(dSnap.data() as Omit<DirectoryEntry, 'id'>) };
        claimedEntries.push(entry);
        if (entry.zone === 'OFFICE' || entry.zone === 'RESIDENTIAL') {
          await updateDoc(doc(db, 'destinations', `dest_${dirId}`), {
            hostUid: user.uid,
          }).catch(() => {});
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `directory/${dirId}`);
    }
  }

  return {
    role,
    name: claimedEntries[0]?.name || name,
    phone: cleanPhone,
    pinMustChange: Boolean(credData.pinMustChange) || claimedEntries.some((e) => e.pinMustChange),
    directoryEntries: claimedEntries,
  };
}

export async function fsSubmitPinResetRequest(user: User, phone: string): Promise<void> {
  const cleanPhone = normalizeIndianMobile(phone);
  if (cleanPhone.length !== 10) {
    throw new Error('Enter a valid 10-digit Mobile starting with 6, 7, 8, or 9.');
  }
  const phoneHash = await computePhoneHash(cleanPhone);
  try {
    await setDoc(doc(db, 'pinResetRequests', phoneHash), {
      phoneHash,
      requestedByUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `pinResetRequests/${phoneHash}`);
  }
}

export async function seedInitialFirestoreIfNeeded(user: User): Promise<void> {
  const dirSnap = await getDocs(collection(db, 'directory')).catch((err) =>
    handleFirestoreError(err, OperationType.LIST, 'directory')
  );
  if (!dirSnap.empty) return;

  const batch = writeBatch(db);
  const seedDirectory: Array<{ id: string } & Omit<DirectoryEntry, 'id'>> = [
    {
      id: 'dir_guard_1',
      zone: 'GUARD',
      unit: 'Main Gate',
      name: 'Ramesh Singh',
      phone: '9000000001',
      pin: '1111',
      pinMustChange: false,
      pinResetRequested: false,
    },
    {
      id: 'dir_1',
      zone: 'OFFICE',
      unit: 'IT Dept (Floor 2)',
      name: 'Rahul Sharma',
      phone: '9876543210',
      pin: '2222',
      pinMustChange: false,
      pinResetRequested: false,
    },
    {
      id: 'dir_5',
      zone: 'RESIDENTIAL',
      unit: 'Flat A-402',
      name: 'Rahul Sharma',
      phone: '9876543210',
      pin: '2222',
      pinMustChange: false,
      pinResetRequested: false,
    },
    {
      id: 'dir_2',
      zone: 'OFFICE',
      unit: 'HR & Admin (Floor 1)',
      name: 'Priya Nair',
      phone: '9822233344',
      pin: '4444',
      pinMustChange: false,
      pinResetRequested: false,
    },
    {
      id: 'dir_3',
      zone: 'OFFICE',
      unit: 'Finance Wing (Floor 3)',
      name: 'Amitabh Roy',
      phone: '9833344455',
      pin: '5555',
      pinMustChange: false,
      pinResetRequested: false,
    },
    {
      id: 'dir_4',
      zone: 'OFFICE',
      unit: 'Executive Lounge',
      name: 'Reception',
      phone: '9844455566',
      pin: '6666',
      pinMustChange: false,
      pinResetRequested: false,
    },
    {
      id: 'dir_6',
      zone: 'RESIDENTIAL',
      unit: 'Flat B-105',
      name: 'Dr. Anita Sen',
      phone: '9811122233',
      pin: '3333',
      pinMustChange: false,
      pinResetRequested: false,
    },
    {
      id: 'dir_7',
      zone: 'RESIDENTIAL',
      unit: 'Flat A-201',
      name: 'K. Subramanian',
      phone: '9855566677',
      pin: '7777',
      pinMustChange: false,
      pinResetRequested: false,
    },
    {
      id: 'dir_8',
      zone: 'RESIDENTIAL',
      unit: 'Flat B-304',
      name: 'Neha Kapoor',
      phone: '9866677788',
      pin: '8888',
      pinMustChange: false,
      pinResetRequested: false,
    },
  ];

  const credBuckets = new Map<
    string,
    {
      credHash: string;
      phone: string;
      phoneHash: string;
      role: 'guard' | 'host';
      name: string;
      directoryIds: string[];
      pinMustChange: boolean;
    }
  >();

  for (const entry of seedDirectory) {
    const { id, ...rest } = entry;
    const phoneHash = await computePhoneHash(entry.phone);
    const claimHash = await computePinCredentialHash(entry.phone, entry.pin);
    batch.set(doc(db, 'directory', id), {
      ...rest,
      phoneHash,
      claimHash,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (entry.zone === 'OFFICE' || entry.zone === 'RESIDENTIAL') {
      batch.set(doc(db, 'destinations', `dest_${id}`), {
        zone: entry.zone,
        unit: entry.unit,
        hostName: entry.name,
        label: formatDirectoryLabel(entry),
        createdAt: serverTimestamp(),
      });
    }
    const existingCred = credBuckets.get(claimHash);
    if (existingCred) {
      existingCred.directoryIds.push(id);
    } else {
      credBuckets.set(claimHash, {
        credHash: claimHash,
        phone: entry.phone,
        phoneHash,
        role: entry.zone === 'GUARD' ? 'guard' : 'host',
        name: entry.name,
        directoryIds: [id],
        pinMustChange: entry.pinMustChange,
      });
    }
  }

  for (const bucket of credBuckets.values()) {
    batch.set(doc(db, 'pinCredentials', bucket.credHash), {
      credHash: bucket.credHash,
      phone: bucket.phone,
      phoneHash: bucket.phoneHash,
      role: bucket.role,
      name: bucket.name,
      directoryIds: bucket.directoryIds,
      pinMustChange: bucket.pinMustChange,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  for (const unit of ['Flat A-201', 'Flat A-402', 'Flat B-105', 'Flat B-304']) {
    batch.set(doc(db, 'housingUnits', makeHousingUnitDocId(unit)), {
      name: unit,
      createdAt: serverTimestamp(),
    });
  }

  const now = Date.now();
  const seedVisitors = [
    {
      id: 'vis_1',
      visitorName: 'Arjun Malhotra',
      visitorPhone: '98765 43210',
      visitorType: 'Official Visitor',
      zone: 'OFFICE',
      destination: 'IT Dept (Floor 2) - Rahul Sharma',
      hostPhone: '9876543210',
      createdByUid: user.uid,
      vehicleNumber: 'WB 02 AN 4512',
      passCode: '7391',
      status: 'PENDING',
      timeLabel: formatTime(now - 120000),
    },
    {
      id: 'vis_2',
      visitorName: 'Zomato Delivery',
      visitorPhone: '91234 56789',
      visitorType: 'Delivery',
      zone: 'RESIDENTIAL',
      destination: 'Flat A-402 - Rahul Sharma',
      hostPhone: '9876543210',
      createdByUid: user.uid,
      vehicleNumber: 'WB 06 K 8821',
      passCode: '2050',
      status: 'PRE_APPROVED',
      timeLabel: formatTime(now - 300000),
    },
    {
      id: 'vis_3',
      visitorName: 'Meera Krishnan',
      visitorPhone: '99887 76655',
      visitorType: 'Personal Guest',
      zone: 'RESIDENTIAL',
      destination: 'Flat B-105 - Dr. Anita Sen',
      hostPhone: '9811122233',
      createdByUid: user.uid,
      vehicleNumber: '',
      passCode: '5140',
      status: 'APPROVED',
      timeLabel: formatTime(now - 900000),
    },
  ];

  for (const v of seedVisitors) {
    const { id, ...rest } = v;
    batch.set(doc(db, 'visitors', id), {
      ...rest,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  batch.set(doc(db, 'settings', 'campus'), {
    enabled: false,
    lat: null,
    lng: null,
    radiusMeters: 100,
    logoDataUrl: '',
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'seedInitialFirestore');
  }
}

export function subscribeFirestoreCampusState(
  user: User,
  resolved: ResolvedFirebaseUser,
  onState: (partial: Partial<AppStatePayload>) => void
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];

  // 1. Settings
  unsubs.push(
    onSnapshot(
      doc(db, 'settings', 'campus'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          onState({
            geofence: {
              enabled: Boolean(data.enabled),
              lat: typeof data.lat === 'number' ? data.lat : null,
              lng: typeof data.lng === 'number' ? data.lng : null,
              radiusMeters: typeof data.radiusMeters === 'number' ? data.radiusMeters : 100,
            },
            branding: {
              logoDataUrl: String(data.logoDataUrl || ''),
            },
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/campus')
    )
  );

  // 2. Housing Units
  unsubs.push(
    onSnapshot(
      collection(db, 'housingUnits'),
      (snap) => {
        const units = snap.docs
          .map((d) => String(d.data().name || '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        onState({ housingUnits: units });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'housingUnits')
    )
  );

  // 3. Directory (or Destinations for Guard)
  if (resolved.isAdmin) {
    unsubs.push(
      onSnapshot(
        collection(db, 'directory'),
        (snap) => {
          const entries: DirectoryEntry[] = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<DirectoryEntry, 'id'>) }))
            .filter((d) => !(d.zone === 'ADMIN' && !d.email))
            .sort((a, b) => a.unit.localeCompare(b.unit));
          onState({ directory: entries });
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'directory')
      )
    );
    unsubs.push(
      onSnapshot(
        collection(db, 'pinResetRequests'),
        (snap) => {
          const hashes = snap.docs
            .map((d) => String(d.data().phoneHash || d.id || ''))
            .filter(Boolean);
          onState({ pinResetPhoneHashes: hashes });
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'pinResetRequests')
      )
    );
  } else if (resolved.isGuard) {
    unsubs.push(
      onSnapshot(
        collection(db, 'destinations'),
        (snap) => {
          const entries: DirectoryEntry[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              zone: data.zone === 'RESIDENTIAL' ? 'RESIDENTIAL' : 'OFFICE',
              unit: String(data.unit || ''),
              name: String(data.hostName || ''),
              uid: data.hostUid ? String(data.hostUid) : '',
              primaryHostUid: data.primaryHostUid ? String(data.primaryHostUid) : '',
              phone: '',
              pin: '',
              pinMustChange: false,
              pinResetRequested: false,
            };
          });
          onState({ directory: entries });
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'destinations')
      )
    );
  } else {
    let ownDocs: DirectoryEntry[] = [];
    let familyDocs: DirectoryEntry[] = [];
    const emitDirMerged = () => {
      const merged = new Map<string, DirectoryEntry>();
      for (const d of [...ownDocs, ...familyDocs]) merged.set(d.id, d);
      onState({ directory: Array.from(merged.values()) });
    };

    unsubs.push(
      onSnapshot(
        query(collection(db, 'directory'), where('uid', '==', user.uid)),
        (snap) => {
          ownDocs = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<DirectoryEntry, 'id'>),
          }));
          emitDirMerged();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'directory')
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'directory'), where('primaryHostUid', '==', user.uid)),
        (snap) => {
          familyDocs = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<DirectoryEntry, 'id'>),
          }));
          emitDirMerged();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'directory')
      )
    );
  }

  // 4. Visitors
  if (resolved.isAdmin || resolved.isGuard) {
    unsubs.push(
      onSnapshot(
        collection(db, 'visitors'),
        (snap) => {
          const list: VisitorRecord[] = snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                visitorName: String(data.visitorName || ''),
                visitorPhone: String(data.visitorPhone || ''),
                visitorType: String(data.visitorType || 'Personal Guest'),
                zone: (data.zone === 'RESIDENTIAL' ? 'RESIDENTIAL' : 'OFFICE') as AccessZone,
                destination: String(data.destination || ''),
                hostPhone: data.hostPhone ? String(data.hostPhone) : '',
                hostUid: data.hostUid ? String(data.hostUid) : '',
                hostUids: Array.isArray(data.hostUids) ? data.hostUids.map(String) : undefined,
                createdByUid: data.createdByUid ? String(data.createdByUid) : '',
                vehicleNumber: String(data.vehicleNumber || ''),
                passCode: String(data.passCode || ''),
                status: (data.status || 'PENDING') as VisitorStatus,
                createdAt: toMillis(data.createdAt),
                timeLabel: String(data.timeLabel || ''),
              };
            })
            .sort((a, b) => b.createdAt - a.createdAt);
          onState({ visitors: list });
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'visitors')
      )
    );
  } else {
    const mapVisitorDocs = (docs: Array<{ id: string; data: () => Record<string, unknown> }>) =>
      docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          visitorName: String(data.visitorName || ''),
          visitorPhone: String(data.visitorPhone || ''),
          visitorType: String(data.visitorType || 'Personal Guest'),
          zone: (data.zone === 'RESIDENTIAL' ? 'RESIDENTIAL' : 'OFFICE') as 'OFFICE' | 'RESIDENTIAL',
          destination: String(data.destination || ''),
          hostPhone: data.hostPhone ? String(data.hostPhone) : '',
          hostUid: data.hostUid ? String(data.hostUid) : '',
          hostUids: Array.isArray(data.hostUids) ? data.hostUids.map(String) : undefined,
          createdByUid: data.createdByUid ? String(data.createdByUid) : '',
          vehicleNumber: String(data.vehicleNumber || ''),
          passCode: String(data.passCode || ''),
          status: (data.status || 'PENDING') as VisitorStatus,
          createdAt: toMillis(data.createdAt),
          timeLabel: String(data.timeLabel || ''),
        };
      });

    let hosted: VisitorRecord[] = [];
    let created: VisitorRecord[] = [];
    let unitHosted: VisitorRecord[] = [];
    const emitMerged = () => {
      const merged = new Map<string, VisitorRecord>();
      for (const v of [...hosted, ...created, ...unitHosted]) merged.set(v.id, v);
      onState({
        visitors: Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt),
      });
    };

    unsubs.push(
      onSnapshot(
        query(collection(db, 'visitors'), where('hostUid', '==', user.uid)),
        (snap) => {
          hosted = mapVisitorDocs(snap.docs);
          emitMerged();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'visitors')
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'visitors'), where('createdByUid', '==', user.uid)),
        (snap) => {
          created = mapVisitorDocs(snap.docs);
          emitMerged();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'visitors')
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'visitors'), where('hostUids', 'array-contains', user.uid)),
        (snap) => {
          unitHosted = mapVisitorDocs(snap.docs);
          emitMerged();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'visitors')
      )
    );
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function fsCreateVisitor(record: Omit<VisitorRecord, 'id'>): Promise<VisitorRecord> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please verify your device with Google first.');
  const id = makeRecordId('vis');
  const now = Date.now();
  const hostUidsList = Array.isArray(record.hostUids)
    ? Array.from(new Set(record.hostUids.filter(Boolean))).slice(0, 20)
    : undefined;

  const payload: Record<string, unknown> = {
    visitorName: String(record.visitorName).trim().slice(0, 100),
    visitorPhone: String(record.visitorPhone || 'Pre-Approved').trim().slice(0, 30),
    visitorType: String(record.visitorType || 'Personal Guest').trim().slice(0, 60),
    zone: (record.zone === 'RESIDENTIAL' ? 'RESIDENTIAL' : 'OFFICE') as AccessZone,
    destination: String(record.destination).trim().slice(0, 200),
    hostPhone: String(record.hostPhone || '').slice(0, 30),
    hostUid: String(record.hostUid || uid).slice(0, 128),
    createdByUid: uid,
    vehicleNumber: String(record.vehicleNumber || '').trim().toUpperCase().slice(0, 30),
    passCode: String(record.passCode || Math.floor(1000 + Math.random() * 9000)).slice(0, 8),
    status: record.status || 'PENDING',
    timeLabel: String(record.timeLabel || formatTime(now)).slice(0, 30),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (hostUidsList && hostUidsList.length > 0) {
    payload.hostUids = hostUidsList;
  }

  try {
    await setDoc(doc(db, 'visitors', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `visitors/${id}`);
  }
  return {
    id,
    visitorName: String(payload.visitorName),
    visitorPhone: String(payload.visitorPhone),
    visitorType: String(payload.visitorType),
    zone: payload.zone as AccessZone,
    destination: String(payload.destination),
    hostPhone: String(payload.hostPhone),
    hostUid: String(payload.hostUid),
    hostUids: hostUidsList,
    createdByUid: uid,
    vehicleNumber: String(payload.vehicleNumber),
    passCode: String(payload.passCode),
    status: payload.status as VisitorStatus,
    createdAt: now,
    timeLabel: String(payload.timeLabel),
  };
}

export async function fsUpdateVisitorStatus(id: string, status: VisitorStatus): Promise<void> {
  try {
    await updateDoc(doc(db, 'visitors', id), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `visitors/${id}`);
  }
}

export async function fsCreateDirectoryEntries(
  entries: Array<Omit<DirectoryEntry, 'id'>>
): Promise<{ created: DirectoryEntry[] }> {
  const batch = writeBatch(db);
  const created: DirectoryEntry[] = [];
  const credBuckets = new Map<
    string,
    {
      credHash: string;
      phone: string;
      phoneHash: string;
      role: 'guard' | 'host';
      name: string;
      directoryIds: string[];
      pinMustChange: boolean;
    }
  >();

  for (const item of entries) {
    if (item.zone === 'SUPERADMIN') continue;
    const id = makeRecordId('dir');
    const isAdminEntry = item.zone === 'ADMIN';
    const cleanPhone = isAdminEntry
      ? ''
      : (normalizeIndianMobile(item.phone) || String(item.phone || '')).slice(0, 120);
    const cleanPin = isAdminEntry
      ? ''
      : /^\d{4}$/.test(String(item.pin))
        ? String(item.pin)
        : String(Math.floor(1000 + Math.random() * 9000));
    const cleanEmail = item.email ? item.email.trim().toLowerCase().slice(0, 120) : '';
    const phoneHash = !isAdminEntry && cleanPhone.length === 10 ? await computePhoneHash(cleanPhone) : '';
    const claimHash =
      !isAdminEntry && cleanPhone.length === 10 && /^\d{4}$/.test(cleanPin)
        ? await computePinCredentialHash(cleanPhone, cleanPin)
        : '';

    const docData: Record<string, unknown> = {
      zone: item.zone,
      unit: String(item.unit || '').trim().slice(0, 100),
      name: String(item.name).trim().slice(0, 100),
      phone: cleanPhone,
      pin: cleanPin,
      pinMustChange: isAdminEntry ? false : Boolean(item.pinMustChange),
      pinResetRequested: isAdminEntry ? false : Boolean(item.pinResetRequested),
      isFamilyMember: Boolean(item.isFamilyMember),
      isPrimaryHost: Boolean(item.isPrimaryHost),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (phoneHash) docData.phoneHash = phoneHash;
    if (claimHash) docData.claimHash = claimHash;
    if (item.primaryHostUid) docData.primaryHostUid = String(item.primaryHostUid).slice(0, 128);
    if (item.primaryHostDirectoryId) {
      docData.primaryHostDirectoryId = String(item.primaryHostDirectoryId).slice(0, 128);
    }
    if (cleanEmail) {
      docData.email = cleanEmail;
      if (isAdminEntry) {
        batch.set(doc(db, 'approvedAdmins', makeEmailKey(cleanEmail)), {
          email: cleanEmail,
          name: String(docData.name),
          directoryId: id,
          createdAt: serverTimestamp(),
        });
      }
    }
    if (item.uid) docData.uid = item.uid.slice(0, 128);

    batch.set(doc(db, 'directory', id), docData);

    if ((item.zone === 'OFFICE' || item.zone === 'RESIDENTIAL') && String(docData.unit)) {
      const destData: Record<string, unknown> = {
        zone: item.zone,
        unit: docData.unit,
        hostName: docData.name,
        label: `${docData.unit} - ${docData.name}`,
        createdAt: serverTimestamp(),
      };
      if (item.uid) destData.hostUid = item.uid.slice(0, 128);
      if (item.primaryHostUid) destData.primaryHostUid = String(item.primaryHostUid).slice(0, 128);
      batch.set(doc(db, 'destinations', `dest_${id}`), destData);
    }

    if (claimHash && phoneHash) {
      const existingCred = credBuckets.get(claimHash);
      const role: 'guard' | 'host' = item.zone === 'GUARD' ? 'guard' : 'host';
      if (existingCred) {
        existingCred.directoryIds.push(id);
        if (role === 'guard') existingCred.role = 'guard';
      } else {
        credBuckets.set(claimHash, {
          credHash: claimHash,
          phone: cleanPhone,
          phoneHash,
          role,
          name: String(docData.name),
          directoryIds: [id],
          pinMustChange: Boolean(docData.pinMustChange),
        });
      }
    }

    created.push({
      id,
      zone: item.zone,
      unit: String(docData.unit),
      name: String(docData.name),
      email: cleanEmail || undefined,
      uid: item.uid,
      phone: cleanPhone,
      pin: cleanPin,
      claimHash: claimHash || undefined,
      phoneHash: phoneHash || undefined,
      primaryHostUid: item.primaryHostUid,
      primaryHostDirectoryId: item.primaryHostDirectoryId,
      pinMustChange: Boolean(docData.pinMustChange),
      pinResetRequested: Boolean(docData.pinResetRequested),
      isFamilyMember: Boolean(item.isFamilyMember),
      isPrimaryHost: Boolean(item.isPrimaryHost),
    });
  }

  try {
    await batch.commit();
    for (const bucket of credBuckets.values()) {
      await upsertPinCredentialDoc(bucket);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'directory');
  }
  return { created };
}

export async function fsUpdateDirectoryEntry(
  id: string,
  patch: Partial<DirectoryEntry>
): Promise<void> {
  const safePatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) safePatch.name = String(patch.name).trim().slice(0, 100);
  if (patch.phone !== undefined) safePatch.phone = (normalizeIndianMobile(patch.phone) || patch.phone).slice(0, 120);
  if (patch.unit !== undefined) safePatch.unit = String(patch.unit).trim().slice(0, 100);
  if (patch.email !== undefined) safePatch.email = String(patch.email).trim().toLowerCase().slice(0, 120);
  if (patch.pin !== undefined && /^\d{4}$/.test(patch.pin)) safePatch.pin = patch.pin;
  if (patch.pinMustChange !== undefined) safePatch.pinMustChange = Boolean(patch.pinMustChange);
  if (patch.pinResetRequested !== undefined) safePatch.pinResetRequested = Boolean(patch.pinResetRequested);

  try {
    const dirRef = doc(db, 'directory', id);
    if (patch.email !== undefined || patch.name !== undefined) {
      const existingSnap = await getDoc(dirRef);
      const existingData = existingSnap.exists() ? existingSnap.data() : null;
      if (existingData && existingData.zone === 'ADMIN') {
        const oldEmail = String(existingData.email || '').trim().toLowerCase();
        const nextEmail =
          patch.email !== undefined
            ? String(patch.email).trim().toLowerCase().slice(0, 120)
            : oldEmail;
        const nextName =
          patch.name !== undefined
            ? String(patch.name).trim().slice(0, 100)
            : String(existingData.name || 'Campus Admin').slice(0, 100);

        const batch = writeBatch(db);
        batch.update(dirRef, safePatch);
        if (oldEmail && oldEmail !== nextEmail) {
          batch.delete(doc(db, 'approvedAdmins', makeEmailKey(oldEmail)));
        }
        if (nextEmail) {
          const nextRef = doc(db, 'approvedAdmins', makeEmailKey(nextEmail));
          const nextSnap = await getDoc(nextRef);
          if (nextSnap.exists()) {
            batch.update(nextRef, {
              name: nextName,
              directoryId: id,
            });
          } else {
            batch.set(nextRef, {
              email: nextEmail,
              name: nextName,
              directoryId: id,
              createdAt: serverTimestamp(),
            });
          }
        }
        await batch.commit();
        return;
      }
    }
    await updateDoc(dirRef, safePatch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `directory/${id}`);
  }
}

export async function fsUpdateUserPinByPhone(
  phone: string,
  pin: string,
  extra: { pinMustChange?: boolean; pinResetRequested?: boolean } = {},
  options: { isAdmin?: boolean } = {}
): Promise<number> {
  const cleanPhone = normalizeIndianMobile(phone);
  const cleanPin = String(pin || '').trim();
  if (!cleanPhone || !/^\d{4}$/.test(cleanPin)) return 0;

  try {
    const uid = auth.currentUser?.uid;
    const snap = options.isAdmin || !uid
      ? await getDocs(collection(db, 'directory'))
      : await getDocs(query(collection(db, 'directory'), where('uid', '==', uid)));

    const newPhoneHash = await computePhoneHash(cleanPhone);
    const newCredHash = await computePinCredentialHash(cleanPhone, cleanPin);
    const oldCredHashes = new Set<string>();
    const matchedIds: string[] = [];
    let matchedName = 'SPM NIWAS Member';
    let matchedRole: 'guard' | 'host' = 'host';

    const batch = writeBatch(db);
    let updated = 0;
    for (const d of snap.docs) {
      const data = d.data();
      if (data.zone === 'SUPERADMIN' || data.zone === 'ADMIN') continue;
      const docPhone = normalizeIndianMobile(String(data.phone || ''));
      if (docPhone === cleanPhone) {
        updated++;
        matchedIds.push(d.id);
        if (data.name) matchedName = String(data.name).slice(0, 100);
        if (data.zone === 'GUARD') matchedRole = 'guard';

        const prevPin = String(data.pin || '').trim();
        if (typeof data.claimHash === 'string' && data.claimHash) {
          oldCredHashes.add(data.claimHash);
        } else if (/^\d{4}$/.test(prevPin)) {
          oldCredHashes.add(await computePinCredentialHash(cleanPhone, prevPin));
        }

        batch.update(d.ref, {
          pin: cleanPin,
          claimHash: newCredHash,
          phoneHash: newPhoneHash,
          ...(extra.pinMustChange !== undefined ? { pinMustChange: extra.pinMustChange } : {}),
          ...(extra.pinResetRequested !== undefined ? { pinResetRequested: extra.pinResetRequested } : {}),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (updated > 0) {
      await batch.commit();
      for (const oldHash of oldCredHashes) {
        if (oldHash !== newCredHash) {
          await deleteDoc(doc(db, 'pinCredentials', oldHash)).catch(() => {});
        }
      }
      await upsertPinCredentialDoc({
        credHash: newCredHash,
        phone: cleanPhone,
        phoneHash: newPhoneHash,
        role: matchedRole,
        name: matchedName,
        directoryIds: matchedIds,
        pinMustChange: Boolean(extra.pinMustChange),
      });
      if (options.isAdmin && extra.pinResetRequested === false) {
        await deleteDoc(doc(db, 'pinResetRequests', newPhoneHash)).catch(() => {});
      }
    }
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'directory');
  }
}

export async function fsDeleteDirectoryEntry(id: string): Promise<void> {
  const dirRef = doc(db, 'directory', id);
  try {
    const existingSnap = await getDoc(dirRef);
    const data = existingSnap.exists() ? existingSnap.data() : null;
    const credHashToClean =
      data && data.zone !== 'ADMIN' && data.zone !== 'SUPERADMIN'
        ? String(data.claimHash || '') ||
          (normalizeIndianMobile(String(data.phone || '')).length === 10 && /^\d{4}$/.test(String(data.pin || ''))
            ? await computePinCredentialHash(String(data.phone), String(data.pin))
            : '')
        : '';

    const batch = writeBatch(db);
    batch.delete(dirRef);
    batch.delete(doc(db, 'destinations', `dest_${id}`));
    if (data && data.zone === 'ADMIN' && data.email) {
      batch.delete(doc(db, 'approvedAdmins', makeEmailKey(String(data.email))));
    }
    await batch.commit();

    if (credHashToClean) {
      const credRef = doc(db, 'pinCredentials', credHashToClean);
      const credSnap = await getDoc(credRef).catch(() => null);
      if (credSnap?.exists()) {
        const prevIds = Array.isArray(credSnap.data().directoryIds)
          ? credSnap.data().directoryIds.map(String).filter((x: string) => x !== id)
          : [];
        if (prevIds.length === 0) {
          await deleteDoc(credRef).catch(() => {});
        } else {
          await updateDoc(credRef, {
            directoryIds: prevIds,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `directory/${id}`);
  }
}

export async function fsDeleteDirectoryByPhone(phone: string, zone?: string): Promise<void> {
  const cleanPhone = normalizeIndianMobile(phone);
  try {
    const snap = await getDocs(collection(db, 'directory'));
    const batch = writeBatch(db);
    const deletedIds = new Set<string>();
    const credHashes = new Set<string>();

    for (const d of snap.docs) {
      const data = d.data();
      if (normalizeIndianMobile(String(data.phone || '')) !== cleanPhone) continue;
      if (data.zone === 'SUPERADMIN' || data.zone === 'ADMIN') continue;
      if (zone && data.zone !== zone) continue;
      deletedIds.add(d.id);
      if (typeof data.claimHash === 'string' && data.claimHash) {
        credHashes.add(data.claimHash);
      } else if (/^\d{4}$/.test(String(data.pin || ''))) {
        credHashes.add(await computePinCredentialHash(cleanPhone, String(data.pin)));
      }
      batch.delete(d.ref);
      batch.delete(doc(db, 'destinations', `dest_${d.id}`));
    }
    await batch.commit();

    for (const credHash of credHashes) {
      const credRef = doc(db, 'pinCredentials', credHash);
      const credSnap = await getDoc(credRef).catch(() => null);
      if (credSnap?.exists()) {
        const remaining = Array.isArray(credSnap.data().directoryIds)
          ? credSnap.data().directoryIds.map(String).filter((id: string) => !deletedIds.has(id))
          : [];
        if (remaining.length === 0) {
          await deleteDoc(credRef).catch(() => {});
        } else {
          await updateDoc(credRef, {
            directoryIds: remaining,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      }
    }
    if (!zone && cleanPhone.length === 10) {
      const pHash = await computePhoneHash(cleanPhone);
      await deleteDoc(doc(db, 'pinResetRequests', pHash)).catch(() => {});
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'directory');
  }
}

export async function fsAddHousingUnits(
  unitsText: string,
  existingUnits: string[]
): Promise<{ added: string[] }> {
  const rawItems = unitsText.split(',');
  const existingKeys = new Set(existingUnits.map((u) => u.trim().toLowerCase()));
  const added: string[] = [];
  const batch = writeBatch(db);

  for (const raw of rawItems) {
    const cleaned = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    added.push(cleaned);
    batch.set(doc(db, 'housingUnits', makeHousingUnitDocId(cleaned)), {
      name: cleaned,
      createdAt: serverTimestamp(),
    });
  }

  if (added.length > 0) {
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'housingUnits');
    }
  }
  return { added };
}

export async function fsDeleteHousingUnit(unit: string): Promise<void> {
  const id = makeHousingUnitDocId(unit);
  try {
    await deleteDoc(doc(db, 'housingUnits', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `housingUnits/${id}`);
  }
}

export async function fsUpdateCampusSettings(
  currentGeofence: GeofenceConfig,
  currentLogo: string,
  patch: { geofence?: GeofenceConfig; logoDataUrl?: string }
): Promise<void> {
  const nextGeo = patch.geofence || currentGeofence;
  const nextLogo = patch.logoDataUrl !== undefined ? patch.logoDataUrl : currentLogo;
  if (nextLogo.length > 500000) {
    throw new Error('Logo image is too large (max ~350KB).');
  }
  try {
    await setDoc(doc(db, 'settings', 'campus'), {
      enabled: Boolean(nextGeo.enabled),
      lat: typeof nextGeo.lat === 'number' ? nextGeo.lat : null,
      lng: typeof nextGeo.lng === 'number' ? nextGeo.lng : null,
      radiusMeters: clampRadius(nextGeo.radiusMeters),
      logoDataUrl: nextLogo,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/campus');
  }
}
