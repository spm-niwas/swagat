export type RoleType = 'guard' | 'host' | 'admin' | 'superadmin';

export type DirectoryZone = 'SUPERADMIN' | 'GUARD' | 'OFFICE' | 'RESIDENTIAL' | 'ADMIN';

export type AccessZone = 'OFFICE' | 'RESIDENTIAL';

export type VisitorStatus = 'PENDING' | 'PRE_APPROVED' | 'APPROVED' | 'DENIED' | 'CHECKED_OUT';

export interface DirectoryEntry {
  id: string;
  zone: DirectoryZone;
  unit: string;
  name: string;
  email?: string;
  uid?: string;
  phone: string;
  pin: string;
  pinMustChange: boolean;
  pinResetRequested: boolean;
  isFamilyMember?: boolean;
  isPrimaryHost?: boolean;
}

export interface VisitorRecord {
  id: string;
  visitorName: string;
  visitorPhone: string;
  visitorType: string;
  zone: AccessZone;
  destination: string;
  hostPhone?: string;
  hostUid?: string;
  createdByUid?: string;
  vehicleNumber: string;
  passCode: string;
  status: VisitorStatus;
  createdAt: number;
  timeLabel: string;
}

export interface GeofenceConfig {
  enabled: boolean;
  lat: number | null;
  lng: number | null;
  radiusMeters: number;
}

export interface BrandingConfig {
  logoDataUrl: string;
}

export interface UserSession {
  name: string;
  phone: string;
  email: string;
  role: RoleType;
  allowedUnits: string[];
}

export interface GuardGeoState {
  status: 'CHECKING' | 'INSIDE' | 'OUTSIDE' | 'DENIED';
  distanceMeters: number | null;
  simulatedInside: boolean;
}

export interface AppStatePayload {
  visitors: VisitorRecord[];
  directory: DirectoryEntry[];
  housingUnits: string[];
  geofence: GeofenceConfig;
  branding: BrandingConfig;
}

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  icon?: string;
  onConfirm: () => Promise<void> | void;
}

export interface GuardGpsPopupState {
  open: boolean;
  reason: 'OUTSIDE' | 'DENIED';
  distanceMeters: number | null;
}
