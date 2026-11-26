import type {
  AppStatePayload,
  DirectoryEntry,
  GeofenceConfig,
  VisitorRecord,
  VisitorStatus,
} from '../types/swagat';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function fetchAppState(): Promise<AppStatePayload> {
  return requestJson<AppStatePayload>('/api/state');
}

export function subscribeToAppEvents(
  onUpdate: (state: AppStatePayload) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  const source = new EventSource('/api/events');
  source.onopen = () => onStatusChange?.(true);
  source.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as AppStatePayload;
      onUpdate(parsed);
      onStatusChange?.(true);
    } catch {
      // ignore malformed heartbeat
    }
  };
  source.onerror = () => {
    onStatusChange?.(false);
  };
  return () => {
    source.close();
  };
}

export function createVisitor(record: Omit<VisitorRecord, 'id'>): Promise<VisitorRecord> {
  return requestJson<VisitorRecord>('/api/visitors', {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

export function updateVisitorStatusApi(id: string, status: VisitorStatus): Promise<VisitorRecord> {
  return requestJson<VisitorRecord>(`/api/visitors/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function createDirectoryEntriesApi(
  entries: Array<Omit<DirectoryEntry, 'id'>>
): Promise<{ created: DirectoryEntry[] }> {
  return requestJson<{ created: DirectoryEntry[] }>('/api/directory', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}

export function updateDirectoryEntryApi(
  id: string,
  patch: Partial<DirectoryEntry>
): Promise<DirectoryEntry> {
  return requestJson<DirectoryEntry>(`/api/directory/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function updateUserPinByPhoneApi(
  phone: string,
  pin: string,
  extra: { pinMustChange?: boolean; pinResetRequested?: boolean } = {}
): Promise<{ updated: number }> {
  return requestJson<{ updated: number }>('/api/directory/pin-update', {
    method: 'POST',
    body: JSON.stringify({ phone, pin, ...extra }),
  });
}

export function requestPinResetApi(phone: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>('/api/directory/pin-reset-request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export function deleteDirectoryEntryApi(id: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`/api/directory/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function deleteDirectoryByPhoneApi(phone: string, zone?: string): Promise<{ ok: boolean }> {
  const qs = zone ? `?zone=${encodeURIComponent(zone)}` : '';
  return requestJson<{ ok: boolean }>(`/api/directory/by-phone/${encodeURIComponent(phone)}${qs}`, {
    method: 'DELETE',
  });
}

export function addHousingUnitsApi(
  unitsText: string
): Promise<{ added: string[]; housingUnits: string[] }> {
  return requestJson<{ added: string[]; housingUnits: string[] }>('/api/housing-units', {
    method: 'POST',
    body: JSON.stringify({ unitsText }),
  });
}

export function deleteHousingUnitApi(
  unit: string
): Promise<{ ok: boolean; housingUnits: string[] }> {
  return requestJson<{ ok: boolean; housingUnits: string[] }>(
    `/api/housing-units/${encodeURIComponent(unit)}`,
    {
      method: 'DELETE',
    }
  );
}

export function updateBrandingLogoApi(logoDataUrl: string): Promise<{ logoDataUrl: string }> {
  return requestJson<{ logoDataUrl: string }>('/api/settings/branding', {
    method: 'PUT',
    body: JSON.stringify({ logoDataUrl }),
  });
}

export function updateGeofenceApi(geofence: GeofenceConfig): Promise<GeofenceConfig> {
  return requestJson<GeofenceConfig>('/api/settings/geofence', {
    method: 'PUT',
    body: JSON.stringify(geofence),
  });
}

export function analyzeIdOrPlateApi(
  base64Data: string,
  mimeType: string
): Promise<{ name: string; vehicle: string }> {
  return requestJson<{ name: string; vehicle: string }>('/api/gemini/ocr', {
    method: 'POST',
    body: JSON.stringify({ base64Data, mimeType }),
  });
}

export function draftAiInviteApi(payload: {
  guestName: string;
  destination: string;
  otp: string;
  note: string;
}): Promise<{ text: string }> {
  return requestJson<{ text: string }>('/api/gemini/invite', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function generateSecurityBriefingApi(payload: {
  totalLogs: number;
  officeInside: number;
  resInside: number;
  pendingCount: number;
}): Promise<{ text: string }> {
  return requestJson<{ text: string }>('/api/gemini/briefing', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
