import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Smartphone } from 'lucide-react';
import { auth } from './firebase';
import type {
  AppStatePayload,
  ConfirmDialogConfig,
  DirectoryEntry,
  GeofenceConfig,
  GuardGeoState,
  GuardGpsPopupState,
  RoleType,
  UserSession,
  VisitorRecord,
  VisitorStatus,
} from './types/swagat';
import {
  canHostViewVisitor,
  displayIndianMobile,
  formatDirectoryLabel,
  haversineMeters,
  isMobileDevice,
  normalizeIndianMobile,
  playGateDoorbellChime,
  SUPERADMIN_EMAIL,
  unlockSharedAudioContext,
} from './utils/formatters';
import {
  addHousingUnitsApi,
  createDirectoryEntriesApi,
  createVisitor,
  deleteDirectoryByPhoneApi,
  deleteDirectoryEntryApi,
  deleteHousingUnitApi,
  fetchAppState,
  requestPinResetApi,
  subscribeToAppEvents,
  updateBrandingLogoApi,
  updateDirectoryEntryApi,
  updateGeofenceApi,
  updateUserPinByPhoneApi,
  updateVisitorStatusApi,
} from './services/api';
import {
  checkGoogleRedirectResult,
  ensureAndResolveFirebaseUser,
  formatFirebaseAuthError,
  fsAddHousingUnits,
  fsCreateDirectoryEntries,
  fsCreateVisitor,
  fsDeleteDirectoryByPhone,
  fsDeleteDirectoryEntry,
  fsDeleteHousingUnit,
  fsUpdateCampusSettings,
  fsUpdateDirectoryEntry,
  fsUpdateUserPinByPhone,
  fsUpdateVisitorStatus,
  seedInitialFirestoreIfNeeded,
  signInWithGoogleFirebase,
  signOutFirebase,
  subscribeFirestoreCampusState,
} from './services/firestoreSync';
import { HeaderBar } from './components/HeaderBar';
import { LoginView } from './components/LoginView';
import { GuardView } from './components/GuardView';
import { HostView } from './components/HostView';
import { AdminView } from './components/AdminView';
import { SuperAdminView } from './components/SuperAdminView';
import { BottomLeftRoleSwitcher } from './components/BottomLeftRoleSwitcher';
import {
  AdminLoginModal,
  ConfirmActionModal,
  ForcePinModal,
  ForgotPinModal,
  GuardGpsModal,
  PassModal,
  SettingsModal,
  ShareCredentialsModal,
} from './components/Modals';

const SESSION_STORAGE_KEY = 'swagat_session_v1';
const PIN_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const isDevConsole =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' &&
    (window.location.hostname.startsWith('ais-dev-') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'));

export default function App() {
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [housingUnits, setHousingUnits] = useState<string[]>([]);
  const [geofence, setGeofence] = useState<GeofenceConfig>({
    enabled: false,
    lat: null,
    lng: null,
    radiusMeters: 100,
  });
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState<boolean>(() => isMobileDevice());
  const [devPreviewOverride, setDevPreviewOverride] = useState(false);
  const [session, setSession] = useState<UserSession | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as UserSession;
      if (parsed.role === 'superadmin' || parsed.role === 'admin') {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        return null;
      }
      if (typeof parsed.expiresAt !== 'number' || Date.now() >= parsed.expiresAt) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        return null;
      }
      if ((parsed.role === 'guard' || parsed.role === 'host') && !isMobileDevice()) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const [currentRole, setCurrentRole] = useState<RoleType>(() => session?.role || 'guard');

  useEffect(() => {
    const syncDevice = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', syncDevice);
    window.addEventListener('orientationchange', syncDevice);
    return () => {
      window.removeEventListener('resize', syncDevice);
      window.removeEventListener('orientationchange', syncDevice);
    };
  }, []);

  // Security / Lockout state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [attemptHint, setAttemptHint] = useState('');

  // Alerts & Doorbell
  const [hostAlertsEnabled, setHostAlertsEnabled] = useState(
    () => localStorage.getItem('swagat_host_alerts_v1') === '1'
  );
  const knownPendingIdsRef = useRef<Set<string> | null>(null);
  const doorbellTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Geofence guard state
  const guardGeoRef = useRef<GuardGeoState>({
    status: 'CHECKING',
    distanceMeters: null,
    simulatedInside: true,
  });
  const [gpsPopup, setGpsPopup] = useState<GuardGpsPopupState>({
    open: false,
    reason: 'DENIED',
    distanceMeters: null,
  });

  // Modals & Toasts
  const [activePassVisitor, setActivePassVisitor] = useState<VisitorRecord | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [forcePinOpen, setForcePinOpen] = useState(false);
  const [forgotPinOpen, setForgotPinOpen] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmDialogConfig | null>(null);
  const [sharePayload, setSharePayload] = useState<{
    name: string;
    phone: string;
    pin: string;
    message: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3400);
  }, []);

  const applyServerState = useCallback((data: Partial<AppStatePayload>) => {
    if (Array.isArray(data.visitors)) setVisitors(data.visitors);
    if (Array.isArray(data.directory)) setDirectory(data.directory);
    if (Array.isArray(data.housingUnits)) setHousingUnits(data.housingUnits);
    if (data.geofence) setGeofence(data.geofence);
    if (data.branding) setLogoDataUrl(data.branding.logoDataUrl || '');
    setLoading(false);
  }, []);

  // Track Firebase Auth + attach Cloud Firestore listeners when authenticated; fallback to local Express API otherwise
  useEffect(() => {
    let active = true;
    let fsUnsub: (() => void) | null = null;
    let sseUnsub: (() => void) | null = null;

    const cleanupSubs = () => {
      if (fsUnsub) {
        fsUnsub();
        fsUnsub = null;
      }
      if (sseUnsub) {
        sseUnsub();
        sseUnsub = null;
      }
    };

    checkGoogleRedirectResult().catch((err) => {
      if (active) {
        const msg = formatFirebaseAuthError(err);
        setAuthError(msg);
        setAdminLoginOpen(true);
        showToast(msg);
      }
    });

    const authUnsub = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      cleanupSubs();
      setFirebaseUser(user);

      if (user) {
        setAuthError(null);
        try {
          const resolved = await ensureAndResolveFirebaseUser(user);
          if (!active) return;
          if (!resolved.authorized) {
            setLoading(false);
            setSession((prev) =>
              prev?.role === 'superadmin' || prev?.role === 'admin' ? null : prev
            );
            setAuthError(
              `Access denied for "${resolved.email || 'this Google account'}". Only ${SUPERADMIN_EMAIL} or an Approved Campus Admin Google ID can sign in.`
            );
            setAdminLoginOpen(true);
            return;
          }

          if (resolved.role === 'superadmin') {
            await seedInitialFirestoreIfNeeded(user);
            if (!active) return;
          }
          fsUnsub = subscribeFirestoreCampusState(user, resolved, (partial) => {
            if (active) applyServerState(partial);
          });

          setDevPreviewOverride(false);
          const cloudSession: UserSession = {
            name: resolved.name,
            phone: '',
            email: resolved.email,
            role: resolved.role,
            allowedUnits: [],
          };
          setSession(cloudSession);
          setCurrentRole(resolved.role);
          setAdminLoginOpen(false);
        } catch (err) {
          if (active) {
            setLoading(false);
            const msg = formatFirebaseAuthError(err);
            setAuthError(msg);
            showToast(msg);
          }
        }
      } else {
        fetchAppState()
          .then((data) => {
            if (!active) return;
            applyServerState(data);
            sseUnsub = subscribeToAppEvents((evtData) => {
              if (active) applyServerState(evtData);
            });
          })
          .catch(() => {
            if (active) setLoading(false);
          });
      }
    });

    return () => {
      active = false;
      authUnsub();
      cleanupSubs();
    };
  }, [applyServerState, showToast]);

  // Keep session allowedUnits synced if directory updates (e.g. residence allotted/vacated)
  useEffect(() => {
    if (!session || directory.length === 0) return;
    const matches = directory.filter(
      (d) =>
        (d.phone && d.phone.toLowerCase() === session.phone.toLowerCase()) ||
        (session.email && d.email && d.email.toLowerCase() === session.email.toLowerCase())
    );
    if (matches.length > 0) {
      const nextUnits = matches
        .filter((m) => m.zone === 'OFFICE' || m.zone === 'RESIDENTIAL')
        .map(formatDirectoryLabel);
      if (JSON.stringify(nextUnits) !== JSON.stringify(session.allowedUnits)) {
        const updated = { ...session, allowedUnits: nextUnits };
        setSession(updated);
        try {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
      }
    }
  }, [directory, session]);

  // Enforce 1-week expiration for mobile + PIN sessions
  useEffect(() => {
    if (!session || session.role === 'superadmin' || session.role === 'admin' || devPreviewOverride) {
      return;
    }
    const expiresAt = session.expiresAt;
    if (typeof expiresAt !== 'number') return;

    const expireIfNeeded = () => {
      if (Date.now() < expiresAt) return;
      setSession(null);
      knownPendingIdsRef.current = null;
      try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // ignore
      }
      showToast('Your 7-day session expired. Please log in again.');
    };

    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
      expireIfNeeded();
      return;
    }

    const timer = setTimeout(expireIfNeeded, remainingMs);
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') expireIfNeeded();
    };
    window.addEventListener('focus', expireIfNeeded);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', expireIfNeeded);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [session, devPreviewOverride, showToast]);

  // Unlock WebAudio on first user gesture when alerts enabled
  useEffect(() => {
    const unlock = () => {
      if (hostAlertsEnabled) unlockSharedAudioContext();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [hostAlertsEnabled]);

  const stopDoorbellLoop = useCallback(() => {
    if (doorbellTimerRef.current) {
      clearInterval(doorbellTimerRef.current);
      doorbellTimerRef.current = null;
    }
  }, []);

  const startDoorbellLoop = useCallback(() => {
    stopDoorbellLoop();
    playGateDoorbellChime();
    let rings = 1;
    doorbellTimerRef.current = setInterval(() => {
      const stillPending = visitors.some(
        (v) => v.status === 'PENDING' && canHostViewVisitor(v, session, directory)
      );
      if (!stillPending || rings >= 5) {
        stopDoorbellLoop();
        return;
      }
      rings++;
      playGateDoorbellChime();
    }, 3500);
  }, [visitors, session, directory, stopDoorbellLoop]);

  useEffect(() => {
    return () => stopDoorbellLoop();
  }, [stopDoorbellLoop]);

  // Monitor pending arrivals for logged-in Host
  useEffect(() => {
    if (!session || (session.role !== 'host' && currentRole !== 'host')) return;
    const pendingForHost = visitors.filter(
      (v) => v.status === 'PENDING' && canHostViewVisitor(v, session, directory)
    );
    const currentIds = new Set(pendingForHost.map((v) => v.id));

    if (knownPendingIdsRef.current === null) {
      knownPendingIdsRef.current = currentIds;
      if (pendingForHost.length > 0 && hostAlertsEnabled) {
        startDoorbellLoop();
      }
      return;
    }

    const brandNew = pendingForHost.filter((v) => !knownPendingIdsRef.current!.has(v.id));
    knownPendingIdsRef.current = currentIds;

    if (pendingForHost.length === 0) {
      stopDoorbellLoop();
    }
    if (brandNew.length > 0) {
      const latest = brandNew[0];
      if (hostAlertsEnabled) {
        startDoorbellLoop();
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`Guest at Main Gate — ${latest.visitorName}`, {
              body: `${latest.visitorType} for ${latest.destination}. Tap to Approve or Deny.`,
              tag: 'swagat-gate-arrival',
            });
          } catch {
            // ignore Notification failure
          }
        }
      }
      showToast(`New guest at Main Gate: ${latest.visitorName} (${latest.destination})`);
    }
  }, [
    visitors,
    session,
    currentRole,
    directory,
    hostAlertsEnabled,
    startDoorbellLoop,
    stopDoorbellLoop,
    showToast,
  ]);

  // Geofencing verification for Guard
  const refreshGuardLocation = useCallback(
    (manual = false) => {
      if (!geofence.enabled || geofence.lat === null || geofence.lng === null) return;
      if (session && session.role !== 'guard') return;
      if (!navigator.geolocation) {
        guardGeoRef.current.status = 'DENIED';
        if (manual) setGpsPopup({ open: true, reason: 'DENIED', distanceMeters: null });
        return;
      }
      guardGeoRef.current.status = 'CHECKING';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const dist = haversineMeters(
            pos.coords.latitude,
            pos.coords.longitude,
            geofence.lat!,
            geofence.lng!
          );
          guardGeoRef.current.distanceMeters = dist;
          guardGeoRef.current.status = dist <= geofence.radiusMeters ? 'INSIDE' : 'OUTSIDE';
          if (guardGeoRef.current.status === 'OUTSIDE') {
            setGpsPopup({ open: true, reason: 'OUTSIDE', distanceMeters: dist });
          } else if (manual) {
            setGpsPopup({ open: false, reason: 'DENIED', distanceMeters: dist });
            showToast('Location verified at Main Gate.');
          }
        },
        () => {
          guardGeoRef.current.status = 'DENIED';
          if (manual || session?.role === 'guard') {
            setGpsPopup({ open: true, reason: 'DENIED', distanceMeters: null });
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
      );
    },
    [geofence, session, showToast]
  );

  useEffect(() => {
    if (currentRole === 'guard' && geofence.enabled) {
      refreshGuardLocation(false);
    }
  }, [currentRole, geofence.enabled, refreshGuardLocation]);

  const enforceGuardGeofence = useCallback(() => {
    if (!session || session.role !== 'guard') return true;
    if (!geofence.enabled || geofence.lat === null || geofence.lng === null) return true;
    if (guardGeoRef.current.status === 'INSIDE') return true;
    refreshGuardLocation(false);
    if (guardGeoRef.current.status === 'OUTSIDE') {
      setGpsPopup({
        open: true,
        reason: 'OUTSIDE',
        distanceMeters: guardGeoRef.current.distanceMeters,
      });
    } else {
      setGpsPopup({ open: true, reason: 'DENIED', distanceMeters: null });
    }
    return false;
  }, [session, geofence, refreshGuardLocation]);

  // Authentication
  const authenticateIdentifier = (identifier: string, pin: string): boolean => {
    if (Date.now() < lockUntil) {
      const secs = Math.ceil((lockUntil - Date.now()) / 1000);
      showToast(`Too many attempts. Try again in ${secs}s.`);
      return false;
    }

    const cleanInput = identifier.trim().toLowerCase();
    if (!cleanInput || cleanInput === SUPERADMIN_EMAIL) {
      showToast('Admin login requires Google Sign-In via the Admin button below.');
      return false;
    }

    const matches = directory.filter((d) => {
      if (d.zone === 'SUPERADMIN' || d.zone === 'ADMIN') return false;
      const idMatch = Boolean(d.phone && d.phone.toLowerCase() === cleanInput);
      return idMatch && d.pin === pin;
    });

    if (matches.length === 0) {
      const nextFails = failedAttempts + 1;
      const left = Math.max(0, 5 - nextFails);
      if (nextFails >= 5) {
        setLockUntil(Date.now() + 60000);
        setFailedAttempts(0);
        setAttemptHint('Locked 60s');
        showToast('Locked for 60s after 5 wrong PIN attempts.');
      } else {
        setFailedAttempts(nextFails);
        setAttemptHint(`${left} tries left`);
        showToast(`Invalid credentials or PIN (${left} tries left).`);
      }
      return false;
    }

    setFailedAttempts(0);
    setAttemptHint('');

    const primary = matches[0];
    let assignedRole: RoleType = 'host';
    if (matches.some((m) => m.zone === 'GUARD')) {
      assignedRole = 'guard';
    }

    if ((assignedRole === 'guard' || assignedRole === 'host') && !isMobileDevice()) {
      setAttemptHint('Mobile device required for Guard & Host');
      showToast('Guard and Host portals can only be opened on a mobile device.');
      return false;
    }

    setDevPreviewOverride(false);
    const allowedUnits = matches
      .filter((m) => m.zone === 'OFFICE' || m.zone === 'RESIDENTIAL')
      .map(formatDirectoryLabel);

    const now = Date.now();
    const newSession: UserSession = {
      name: primary.name,
      phone: primary.phone,
      email: primary.email || '',
      role: assignedRole,
      allowedUnits,
      loggedInAt: now,
      expiresAt: now + PIN_SESSION_DURATION_MS,
    };

    setSession(newSession);
    setCurrentRole(assignedRole);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
    } catch {
      // ignore
    }

    if (matches.some((m) => m.pinMustChange)) {
      setForcePinOpen(true);
    } else {
      showToast(`Welcome, ${primary.name}!`);
    }
    return true;
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setGoogleLoading(true);
    try {
      const user = await signInWithGoogleFirebase();
      if (user) {
        showToast(`Signed in as ${user.email || user.displayName || 'Google User'}`);
      } else {
        showToast('Redirecting to Google Sign-In...');
      }
    } catch (err) {
      const msg = formatFirebaseAuthError(err);
      setAuthError(msg);
      showToast(msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSwitchGoogleAccount = async () => {
    setAuthError(null);
    setGoogleLoading(true);
    try {
      await signOutFirebase();
      const user = await signInWithGoogleFirebase();
      if (user) {
        showToast(`Signed in as ${user.email || user.displayName || 'Google User'}`);
      }
    } catch (err) {
      const msg = formatFirebaseAuthError(err);
      setAuthError(msg);
      showToast(msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handlePinLogin = (phone: string, pin: string) => {
    if (!phone || phone.length !== 10 || pin.length !== 4) {
      showToast('Enter a valid 10-digit Mobile (starting with 6–9) & 4-digit PIN.');
      return;
    }
    if (!firebaseUser && directory.length === 0) {
      showToast('Swagat Cloud is not synced yet. Use Admin Google Sign-In first on this device.');
      return;
    }
    authenticateIdentifier(phone, pin);
  };

  const handleSwitchRole = (role: RoleType) => {
    if (
      (role === 'guard' || role === 'host') &&
      !isMobileDevice() &&
      !(isDevConsole && devPreviewOverride)
    ) {
      showToast('Guard and Host portals can only be opened on a mobile device.');
      return;
    }
    if (session) {
      if (session.role === 'guard' && role !== 'guard') return;
      if (session.role === 'host' && role !== 'host') return;
    }
    setCurrentRole(role);
  };

  const handleDevSelectLogin = () => {
    if (!isDevConsole) return;
    setDevPreviewOverride(false);
    setSession(null);
    setCurrentRole('guard');
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handleDevSelectRole = (role: RoleType) => {
    if (!isDevConsole) return;
    setDevPreviewOverride(true);
    setCurrentRole(role);
    if (role === 'guard') {
      const guardRec = directory.find((d) => d.zone === 'GUARD');
      setSession({
        name: guardRec?.name || 'Ramesh Singh',
        phone: guardRec?.phone || '9000000001',
        email: '',
        role: 'guard',
        allowedUnits: [],
      });
    } else if (role === 'host') {
      const firstHost = directory.find((d) => d.zone === 'OFFICE' || d.zone === 'RESIDENTIAL');
      const hostPhone = firstHost?.phone || '9876543210';
      const hostUnits = directory
        .filter((d) => d.phone === hostPhone && (d.zone === 'OFFICE' || d.zone === 'RESIDENTIAL'))
        .map(formatDirectoryLabel);
      setSession({
        name: firstHost?.name || 'Rahul Sharma',
        phone: hostPhone,
        email: '',
        role: 'host',
        allowedUnits:
          hostUnits.length > 0
            ? hostUnits
            : ['IT Dept (Floor 2) - Rahul Sharma', 'Flat A-402 - Rahul Sharma'],
      });
    } else if (role === 'admin') {
      const adminRec = directory.find((d) => d.zone === 'ADMIN' && Boolean(d.email));
      setSession({
        name: adminRec?.name || 'SPM NIWAS Admin',
        phone: '',
        email: adminRec?.email || 'admin@spmniwas.in',
        role: 'admin',
        allowedUnits: [],
      });
    } else {
      setSession({
        name: 'Director SPM NIWAS',
        phone: SUPERADMIN_EMAIL,
        email: SUPERADMIN_EMAIL,
        role: 'superadmin',
        allowedUnits: [],
      });
    }
  };

  const handleLogout = () => {
    setDevPreviewOverride(false);
    setSession(null);
    stopDoorbellLoop();
    knownPendingIdsRef.current = null;
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (firebaseUser) {
      void signOutFirebase();
    }
    showToast('Signed out.');
  };

  const handleEnableHostAlerts = async () => {
    unlockSharedAudioContext();
    setHostAlertsEnabled(true);
    try {
      localStorage.setItem('swagat_host_alerts_v1', '1');
    } catch {
      // ignore
    }
    if ('Notification' in window && Notification.permission !== 'granted') {
      try {
        await Notification.requestPermission();
      } catch {
        // ignore
      }
    }
    playGateDoorbellChime();
    showToast('Gate Bell & Lock-Screen Alerts enabled!');
  };

  const handleShareCredentials = useCallback(
    (name: string, phone: string, pin: string) => {
      const cleanPhone = normalizeIndianMobile(phone);
      const formattedPhone = displayIndianMobile(cleanPhone);
      const appUrl = window.location.href.split('?')[0];
      const msg = `Namaste ${name}! Your Swagat portal for *SPM NIWAS* is active.\n\nLink: ${appUrl}\nMobile: ${formattedPhone}\nTemp PIN: *${pin}*\n\n(You will be prompted to set your own private PIN on first login.)`;
      setSharePayload({ name, phone: cleanPhone, pin, message: msg });
    },
    []
  );

  const isCloudMode = Boolean(firebaseUser);

  const saveCreateVisitor = async (rec: Omit<VisitorRecord, 'id'>) =>
    isCloudMode ? fsCreateVisitor(rec) : createVisitor(rec);

  const saveUpdateVisitorStatus = async (id: string, status: VisitorStatus) => {
    if (isCloudMode) {
      await fsUpdateVisitorStatus(id, status);
    } else {
      await updateVisitorStatusApi(id, status);
    }
  };

  const saveCreateDirectoryEntries = async (entries: Array<Omit<DirectoryEntry, 'id'>>) =>
    isCloudMode ? fsCreateDirectoryEntries(entries) : createDirectoryEntriesApi(entries);

  const saveUpdateDirectoryEntry = async (id: string, patch: Partial<DirectoryEntry>) => {
    if (isCloudMode) {
      await fsUpdateDirectoryEntry(id, patch);
    } else {
      await updateDirectoryEntryApi(id, patch);
    }
  };

  const saveUpdatePinByPhone = async (
    phone: string,
    pin: string,
    extra: { pinMustChange?: boolean; pinResetRequested?: boolean } = {}
  ) =>
    isCloudMode
      ? fsUpdateUserPinByPhone(phone, pin, extra)
      : updateUserPinByPhoneApi(phone, pin, extra);

  const saveDeleteDirectoryEntry = async (id: string) => {
    if (isCloudMode) {
      await fsDeleteDirectoryEntry(id);
    } else {
      await deleteDirectoryEntryApi(id);
    }
  };

  const saveDeleteDirectoryByPhone = async (phone: string, zone?: string) => {
    if (isCloudMode) {
      await fsDeleteDirectoryByPhone(phone, zone);
    } else {
      await deleteDirectoryByPhoneApi(phone, zone);
    }
  };

  const saveAddHousingUnits = async (unitsText: string) => {
    if (isCloudMode) {
      return fsAddHousingUnits(unitsText, housingUnits);
    }
    const res = await addHousingUnitsApi(unitsText);
    return { added: res.added };
  };

  const saveDeleteHousingUnit = async (unit: string) => {
    if (isCloudMode) {
      await fsDeleteHousingUnit(unit);
    } else {
      await deleteHousingUnitApi(unit);
    }
  };

  const saveUpdateLogo = async (url: string) => {
    if (isCloudMode) {
      await fsUpdateCampusSettings(geofence, logoDataUrl, { logoDataUrl: url });
    } else {
      await updateBrandingLogoApi(url);
    }
  };

  const saveUpdateGeofence = async (geo: GeofenceConfig) => {
    if (isCloudMode) {
      await fsUpdateCampusSettings(geofence, logoDataUrl, { geofence: geo });
    } else {
      await updateGeofenceApi(geo);
    }
  };

  const handleResetUserPin = async (entry: DirectoryEntry) => {
    if (entry.zone === 'SUPERADMIN') return;
    const newTempPin = String(Math.floor(1000 + Math.random() * 9000));
    await saveUpdatePinByPhone(entry.phone, newTempPin, {
      pinMustChange: true,
      pinResetRequested: false,
    });
    handleShareCredentials(entry.name, entry.phone, newTempPin);
  };

  const handleSelfPinChange = async (oldPin: string, newPin: string) => {
    if (!session || session.role === 'superadmin' || session.role === 'admin') return;
    const validOld = directory.some(
      (d) =>
        d.zone !== 'SUPERADMIN' &&
        d.zone !== 'ADMIN' &&
        normalizeIndianMobile(d.phone) === normalizeIndianMobile(session.phone) &&
        d.pin === oldPin
    );
    if (!validOld) {
      showToast('Current PIN is incorrect.');
      return;
    }
    if (newPin.length !== 4) {
      showToast('Enter a 4-digit new PIN.');
      return;
    }
    await saveUpdatePinByPhone(session.phone, newPin, {
      pinMustChange: false,
      pinResetRequested: false,
    });
    setSettingsOpen(false);
    showToast('Your personal PIN has been updated!');
  };

  const handleForcedPinSetup = async (p1: string, p2: string): Promise<boolean> => {
    if (!session || session.role === 'superadmin' || session.role === 'admin') return false;
    if (p1.length !== 4 || p1 !== p2) {
      showToast('Both PIN fields must match (4 digits).');
      return false;
    }
    try {
      await saveUpdatePinByPhone(session.phone, p1, {
        pinMustChange: false,
        pinResetRequested: false,
      });
      const cleanSessionPhone = normalizeIndianMobile(session.phone);
      setDirectory((prev) =>
        prev.map((d) =>
          d.zone !== 'SUPERADMIN' &&
          d.zone !== 'ADMIN' &&
          normalizeIndianMobile(d.phone) === cleanSessionPhone
            ? { ...d, pin: p1, pinMustChange: false, pinResetRequested: false }
            : d
        )
      );
      setForcePinOpen(false);
      showToast('Personal PIN saved!');
      return true;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not save PIN. Please check connection and retry.';
      showToast(msg);
      throw new Error(msg);
    }
  };

  const handleForgotPinSubmit = async (phone: string) => {
    if (!phone || phone.length !== 10) {
      showToast('Enter a valid 10-digit Mobile starting with 6, 7, 8, or 9.');
      return;
    }
    try {
      if (isCloudMode) {
        const target = directory.find(
          (d) =>
            d.zone !== 'SUPERADMIN' &&
            d.zone !== 'ADMIN' &&
            normalizeIndianMobile(d.phone) === phone
        );
        if (!target) throw new Error('Mobile not found in SPM NIWAS directory.');
        await fsUpdateDirectoryEntry(target.id, { pinResetRequested: true });
      } else {
        await requestPinResetApi(phone);
      }
      setForgotPinOpen(false);
      showToast('PIN reset request sent to SPM NIWAS Admin!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Mobile not found.');
    }
  };

  const handleTagHostToHousingUnit = async (phone: string, unit: string) => {
    if (!phone || !unit) return;
    const hostRec =
      directory.find((d) => d.phone === phone && d.zone === 'OFFICE') ||
      directory.find((d) => d.phone === phone && d.zone === 'RESIDENTIAL');
    if (!hostRec) return;
    await saveCreateDirectoryEntries([
      {
        zone: 'RESIDENTIAL',
        unit,
        name: hostRec.name,
        phone: hostRec.phone,
        email: hostRec.email,
        uid: hostRec.uid,
        pin: hostRec.pin,
        pinMustChange: hostRec.pinMustChange || false,
        pinResetRequested: false,
      },
    ]);
    showToast(`Tagged ${hostRec.name} to ${unit}`);
  };

  // Pure mobile shell
  const shellClass =
    'w-full sm:max-w-[430px] h-[100dvh] sm:h-[850px] bg-slate-50 sm:rounded-[2.5rem] sm:shadow-2xl sm:border-[6px] sm:border-slate-800 flex flex-col overflow-hidden relative';

  return (
    <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-900 min-h-screen flex flex-col items-center justify-center sm:p-4">
      <div className={shellClass}>
        <HeaderBar
          session={session}
          currentRole={currentRole}
          directory={directory}
          logoDataUrl={logoDataUrl}
          onSwitchRole={handleSwitchRole}
          onOpenSettings={() => setSettingsOpen(true)}
          onRequestLogout={() =>
            setConfirmConfig({
              title: 'Confirm Logout',
              message: `Are you sure you want to log out of ${session?.name || 'your account'}?`,
              confirmLabel: 'Logout',
              onConfirm: handleLogout,
            })
          }
        />

        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-slate-50 p-6">
            <p className="text-sm font-semibold text-slate-500">Connecting to SPM NIWAS...</p>
          </div>
        ) : !session ? (
          <LoginView
            logoDataUrl={logoDataUrl}
            attemptHint={attemptHint}
            onPinLogin={handlePinLogin}
            onOpenForgotPin={() => setForgotPinOpen(true)}
            onOpenAdminLogin={() => setAdminLoginOpen(true)}
          />
        ) : (
          <main className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4 pb-20">
            {(currentRole === 'guard' || currentRole === 'host') &&
            !isMobile &&
            !(isDevConsole && devPreviewOverride) ? (
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 text-center space-y-4 my-8">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center mx-auto">
                  <Smartphone className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold text-slate-900">Mobile Device Required</h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {currentRole === 'guard' ? 'Guard Gate Console' : 'Host Portal'} can only be
                    opened on a mobile phone. Please open Swagat on your mobile device.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (session.role === 'admin' || session.role === 'superadmin') {
                      setCurrentRole(session.role);
                    } else {
                      handleLogout();
                    }
                  }}
                  className="w-full min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-xl transition"
                >
                  {session.role === 'admin' || session.role === 'superadmin'
                    ? 'Back to Admin Dashboard'
                    : 'Return to Login'}
                </button>
              </div>
            ) : (
              <>
                {currentRole === 'guard' && (
                  <GuardView
                    visitors={visitors}
                    directory={directory}
                    onEnforceGeofence={enforceGuardGeofence}
                    onCreateVisitor={async (rec) => {
                      await saveCreateVisitor(rec);
                    }}
                    onUpdateVisitorStatus={async (id, st) => {
                      await saveUpdateVisitorStatus(id, st);
                      const labels: Record<VisitorStatus, string> = {
                        PENDING: 'Pending approval',
                        PRE_APPROVED: 'Pre-approved',
                        APPROVED: 'Entry Approved!',
                        DENIED: 'Entry Denied.',
                        CHECKED_OUT: 'Visitor Checked Out.',
                      };
                      showToast(labels[st]);
                    }}
                    onOpenPassModal={setActivePassVisitor}
                    onShowToast={showToast}
                  />
                )}

                {currentRole === 'host' && (
                  <HostView
                    session={session}
                    visitors={visitors}
                    directory={directory}
                    logoDataUrl={logoDataUrl}
                    hostAlertsEnabled={hostAlertsEnabled}
                    onEnableHostAlerts={handleEnableHostAlerts}
                    onRefreshVisitors={async () => {
                      if (!isCloudMode) {
                        const data = await fetchAppState();
                        applyServerState(data);
                      }
                      showToast('Synced latest Main Gate requests!');
                    }}
                    onCreateVisitor={async (rec) => {
                      await saveCreateVisitor(rec);
                    }}
                    onUpdateVisitorStatus={async (id, st) => {
                      await saveUpdateVisitorStatus(id, st);
                      showToast(st === 'APPROVED' ? 'Entry Approved!' : 'Entry Denied.');
                    }}
                    onAddFamilyMember={async (entry) => {
                      await saveCreateDirectoryEntries([entry]);
                    }}
                    onDeleteDirectoryEntry={async (id) => {
                      await saveDeleteDirectoryEntry(id);
                      showToast('Family member removed.');
                    }}
                    onShareCredentials={handleShareCredentials}
                    onResetUserPin={handleResetUserPin}
                    onRequestConfirm={setConfirmConfig}
                    onShowToast={showToast}
                  />
                )}
              </>
            )}

            {currentRole === 'admin' && (
              <AdminView
                visitors={visitors}
                directory={directory}
                housingUnits={housingUnits}
                onAddDirectoryEntries={async (entries) => {
                  const resUnits = entries
                    .filter((e) => e.zone === 'RESIDENTIAL' && e.unit.trim())
                    .map((e) => e.unit.trim())
                    .join(', ');
                  if (resUnits) await saveAddHousingUnits(resUnits);
                  await saveCreateDirectoryEntries(entries);
                }}
                onAddHousingUnits={saveAddHousingUnits}
                onDeleteHousingUnit={async (unit) => {
                  await saveDeleteHousingUnit(unit);
                  showToast(`Removed ${unit} from Housing Units.`);
                }}
                onTagHostToHousingUnit={handleTagHostToHousingUnit}
                onResetUserPin={handleResetUserPin}
                onDeleteDirectoryEntry={async (id) => {
                  await saveDeleteDirectoryEntry(id);
                  showToast('Directory entry removed.');
                }}
                onDeleteEmployeeByPhone={async (phone) => {
                  await saveDeleteDirectoryByPhone(phone);
                  showToast('User deleted from directory.');
                }}
                onShareCredentials={handleShareCredentials}
                onRequestConfirm={setConfirmConfig}
                onShowToast={showToast}
              />
            )}

            {currentRole === 'superadmin' && (
              <SuperAdminView
                directory={directory}
                logoDataUrl={logoDataUrl}
                geofence={geofence}
                onAddAdmin={async (entry) => {
                  await saveCreateDirectoryEntries([entry]);
                }}
                onUpdateAdmin={async (id, name, email) => {
                  await saveUpdateDirectoryEntry(id, { name, email });
                }}
                onDeleteAdmin={async (id) => {
                  await saveDeleteDirectoryEntry(id);
                  showToast('Deleted from Approved Admins.');
                }}
                onUpdateLogo={saveUpdateLogo}
                onUpdateGeofence={saveUpdateGeofence}
                onRequestConfirm={setConfirmConfig}
                onShowToast={showToast}
              />
            )}
          </main>
        )}

      </div>

      {/* Global Toast Notification Banner (always above modals) */}
      {toastMessage && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[398px] bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 z-[70] flex items-center justify-between">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      <PassModal
        visitor={activePassVisitor}
        logoDataUrl={logoDataUrl}
        onClose={() => setActivePassVisitor(null)}
      />

      <SettingsModal
        open={settingsOpen}
        session={session}
        onClose={() => setSettingsOpen(false)}
        onSelfPinChange={handleSelfPinChange}
      />

      <ForcePinModal
        open={forcePinOpen}
        onSubmit={handleForcedPinSetup}
        onLogout={() => {
          setForcePinOpen(false);
          handleLogout();
        }}
      />

      <ForgotPinModal
        open={forgotPinOpen}
        onClose={() => setForgotPinOpen(false)}
        onSubmit={handleForgotPinSubmit}
      />

      <AdminLoginModal
        open={adminLoginOpen}
        googleLoading={googleLoading}
        firebaseEmail={firebaseUser?.email || null}
        authError={authError}
        onGoogleLogin={handleGoogleLogin}
        onSwitchGoogleAccount={handleSwitchGoogleAccount}
        onClose={() => setAdminLoginOpen(false)}
      />

      <ConfirmActionModal config={confirmConfig} onClose={() => setConfirmConfig(null)} />

      <GuardGpsModal
        popup={gpsPopup}
        radiusMeters={geofence.radiusMeters}
        onClose={() => setGpsPopup((prev) => ({ ...prev, open: false }))}
        onRetry={() => refreshGuardLocation(true)}
      />

      <ShareCredentialsModal
        payload={sharePayload}
        onClose={() => setSharePayload(null)}
        onCopy={async () => {
          if (!sharePayload) return;
          try {
            await navigator.clipboard.writeText(sharePayload.message);
            showToast('Credentials copied to clipboard!');
          } catch {
            showToast('Could not copy automatically.');
          }
        }}
      />

      {isDevConsole && (
        <BottomLeftRoleSwitcher
          hasSession={Boolean(session)}
          currentRole={currentRole}
          onSelectLogin={handleDevSelectLogin}
          onSelectRole={handleDevSelectRole}
        />
      )}
    </div>
  );
}
