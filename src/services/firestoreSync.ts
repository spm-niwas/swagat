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
import { signInWithPopup, signOut, type User } from 'firebase/auth';
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
import { formatDirectoryLabel, formatTime, normalizeIndianMobile, SUPERADMIN_EMAIL } from '../utils/formatters';

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

export async function signInWithGoogleFirebase(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export interface ResolvedFirebaseUser {
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
  const displayName = (user.displayName || email.split('@')[0] || 'Campus User').trim().slice(0, 100);
  const isSuperAdmin = email === SUPERADMIN_EMAIL;

  // Check if user profile exists
  const userRef = doc(db, 'users', user.uid);
  let profileData: Record<string, unknown> | null = null;
  try {
    const snap = await getDoc(userRef);
    profileData = snap.exists() ? snap.data() : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
  }

  // Check admin & guard role collections
  let hasAdminDoc = false;
  let hasGuardDoc = false;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    hasAdminDoc = adminSnap.exists();
  } catch {
    hasAdminDoc = false;
  }
  try {
    const guardSnap = await getDoc(doc(db, 'guards', user.uid));
    hasGuardDoc = guardSnap.exists();
  } catch {
    hasGuardDoc = false;
  }

  let matchedDirEntries: DirectoryEntry[] = [];
  if (!isSuperAdmin && !hasAdminDoc) {
    try {
      const byUid = await getDocs(
        query(collection(db, 'directory'), where('uid', '==', user.uid))
      );
      matchedDirEntries = byUid.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<DirectoryEntry, 'id'>),
      }));
      if (matchedDirEntries.length === 0 && email) {
        const byEmail = await getDocs(
          query(collection(db, 'directory'), where('email', '==', email))
        );
        matchedDirEntries = byEmail.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DirectoryEntry, 'id'>),
        }));
      }
    } catch {
      matchedDirEntries = [];
    }
  }

  let role: RoleType = 'host';
  if (isSuperAdmin) role = 'superadmin';
  else if (hasAdminDoc || matchedDirEntries.some((d) => d.zone === 'ADMIN')) role = 'admin';
  else if (hasGuardDoc || matchedDirEntries.some((d) => d.zone === 'GUARD')) role = 'guard';

  const phone = matchedDirEntries[0]?.phone || String(profileData?.phone || '') || '';
  const allowedUnits = matchedDirEntries
    .filter((d) => d.zone === 'OFFICE' || d.zone === 'RESIDENTIAL')
    .map(formatDirectoryLabel);

  if (!profileData) {
    try {
      await setDoc(userRef, {
        uid: user.uid,
        email: email || `${user.uid}@spmniwas.local`,
        displayName,
        role: isSuperAdmin ? 'superadmin' : 'host',
        phone: phone.slice(0, 20),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
    }
  }

  return {
    role,
    isAdmin: role === 'superadmin' || role === 'admin',
    isGuard: role === 'guard',
    name: matchedDirEntries[0]?.name || displayName,
    email,
    phone,
    allowedUnits,
  };
}

export async function seedInitialFirestoreIfNeeded(user: User): Promise<void> {
  const dirSnap = await getDocs(collection(db, 'directory')).catch((err) =>
    handleFirestoreError(err, OperationType.LIST, 'directory')
  );
  if (!dirSnap.empty) return;

  const batch = writeBatch(db);
  const seedDirectory: Array<{ id: string } & Omit<DirectoryEntry, 'id'>> = [
    {
      id: 'dir_superadmin_1',
      zone: 'SUPERADMIN',
      unit: 'Director Office',
      name: 'Director SPM NIWAS',
      email: SUPERADMIN_EMAIL,
      uid: user.uid,
      phone: SUPERADMIN_EMAIL,
      pin: '0000',
      pinMustChange: false,
      pinResetRequested: false,
    },
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
    {
      id: 'dir_admin_1',
      zone: 'ADMIN',
      unit: 'Management Office',
      name: 'SPM NIWAS Admin',
      phone: '9999999999',
      pin: '9999',
      pinMustChange: false,
      pinResetRequested: false,
    },
  ];

  for (const entry of seedDirectory) {
    const { id, ...rest } = entry;
    batch.set(doc(db, 'directory', id), {
      ...rest,
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
            .sort((a, b) => a.unit.localeCompare(b.unit));
          onState({ directory: entries });
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'directory')
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
              phone: '',
              pin: '0000',
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
    unsubs.push(
      onSnapshot(
        query(collection(db, 'directory'), where('uid', '==', user.uid)),
        (snap) => {
          const entries: DirectoryEntry[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<DirectoryEntry, 'id'>),
          }));
          onState({ directory: entries });
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
    const emitMerged = () => {
      const merged = new Map<string, VisitorRecord>();
      for (const v of [...hosted, ...created]) merged.set(v.id, v);
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
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function fsCreateVisitor(record: Omit<VisitorRecord, 'id'>): Promise<VisitorRecord> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in with Google first.');
  const id = makeRecordId('vis');
  const now = Date.now();
  const payload = {
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

  try {
    await setDoc(doc(db, 'visitors', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `visitors/${id}`);
  }
  return {
    id,
    visitorName: payload.visitorName,
    visitorPhone: payload.visitorPhone,
    visitorType: payload.visitorType,
    zone: payload.zone,
    destination: payload.destination,
    hostPhone: payload.hostPhone,
    hostUid: payload.hostUid,
    createdByUid: payload.createdByUid,
    vehicleNumber: payload.vehicleNumber,
    passCode: payload.passCode,
    status: payload.status,
    createdAt: now,
    timeLabel: payload.timeLabel,
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

  for (const item of entries) {
    const id = makeRecordId('dir');
    const cleanPhone =
      item.zone === 'SUPERADMIN'
        ? String(item.phone).slice(0, 120)
        : (normalizeIndianMobile(item.phone) || String(item.phone)).slice(0, 120);
    const cleanPin = /^\d{4}$/.test(String(item.pin))
      ? String(item.pin)
      : String(Math.floor(1000 + Math.random() * 9000));
    const docData: Record<string, unknown> = {
      zone: item.zone,
      unit: String(item.unit || '').trim().slice(0, 100),
      name: String(item.name).trim().slice(0, 100),
      phone: cleanPhone,
      pin: cleanPin,
      pinMustChange: Boolean(item.pinMustChange),
      pinResetRequested: Boolean(item.pinResetRequested),
      isFamilyMember: Boolean(item.isFamilyMember),
      isPrimaryHost: Boolean(item.isPrimaryHost),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (item.email) docData.email = item.email.trim().toLowerCase().slice(0, 120);
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
      batch.set(doc(db, 'destinations', `dest_${id}`), destData);
    }

    created.push({
      id,
      zone: item.zone,
      unit: String(docData.unit),
      name: String(docData.name),
      email: item.email,
      uid: item.uid,
      phone: cleanPhone,
      pin: cleanPin,
      pinMustChange: Boolean(item.pinMustChange),
      pinResetRequested: Boolean(item.pinResetRequested),
      isFamilyMember: Boolean(item.isFamilyMember),
      isPrimaryHost: Boolean(item.isPrimaryHost),
    });
  }

  try {
    await batch.commit();
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
  if (patch.pin !== undefined && /^\d{4}$/.test(patch.pin)) safePatch.pin = patch.pin;
  if (patch.pinMustChange !== undefined) safePatch.pinMustChange = Boolean(patch.pinMustChange);
  if (patch.pinResetRequested !== undefined) safePatch.pinResetRequested = Boolean(patch.pinResetRequested);

  try {
    await updateDoc(doc(db, 'directory', id), safePatch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `directory/${id}`);
  }
}

export async function fsUpdateUserPinByPhone(
  phone: string,
  pin: string,
  extra: { pinMustChange?: boolean; pinResetRequested?: boolean } = {}
): Promise<number> {
  const cleanPhone = normalizeIndianMobile(phone);
  try {
    const snap = await getDocs(collection(db, 'directory'));
    const batch = writeBatch(db);
    let updated = 0;
    for (const d of snap.docs) {
      const data = d.data();
      const docPhone = String(data.phone || '');
      if (normalizeIndianMobile(docPhone) === cleanPhone || docPhone.toLowerCase() === phone.toLowerCase()) {
        updated++;
        batch.update(d.ref, {
          pin,
          ...(extra.pinMustChange !== undefined ? { pinMustChange: extra.pinMustChange } : {}),
          ...(extra.pinResetRequested !== undefined ? { pinResetRequested: extra.pinResetRequested } : {}),
          updatedAt: serverTimestamp(),
        });
      }
    }
    if (updated > 0) await batch.commit();
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'directory');
  }
}

export async function fsDeleteDirectoryEntry(id: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'directory', id));
  batch.delete(doc(db, 'destinations', `dest_${id}`));
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `directory/${id}`);
  }
}

export async function fsDeleteDirectoryByPhone(phone: string, zone?: string): Promise<void> {
  const cleanPhone = normalizeIndianMobile(phone);
  try {
    const snap = await getDocs(collection(db, 'directory'));
    const batch = writeBatch(db);
    for (const d of snap.docs) {
      const data = d.data();
      if (normalizeIndianMobile(String(data.phone || '')) !== cleanPhone) continue;
      if (data.zone === 'SUPERADMIN' || data.zone === 'ADMIN') continue;
      if (zone && data.zone !== zone) continue;
      batch.delete(d.ref);
      batch.delete(doc(db, 'destinations', `dest_${d.id}`));
    }
    await batch.commit();
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
