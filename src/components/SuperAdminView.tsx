import React, { useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Crown,
  Edit3,
  MapPin,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import type { ConfirmDialogConfig, DirectoryEntry, GeofenceConfig } from '../types/swagat';
import { formatTitleCaseValue, validateGoogleAdminEmail } from '../utils/formatters';

interface SuperAdminViewProps {
  directory: DirectoryEntry[];
  logoDataUrl: string;
  geofence: GeofenceConfig;
  onAddAdmin: (entry: Omit<DirectoryEntry, 'id'>) => Promise<void>;
  onUpdateAdmin: (id: string, name: string, email: string) => Promise<void>;
  onDeleteAdmin: (id: string) => Promise<void>;
  onUpdateLogo: (dataUrl: string) => Promise<void>;
  onUpdateGeofence: (geo: GeofenceConfig) => Promise<void>;
  onRequestConfirm: (cfg: ConfirmDialogConfig) => void;
  onShowToast: (msg: string) => void;
}

type SuperSection = 'none' | 'add' | 'logo' | 'geofence';

export const SuperAdminView: React.FC<SuperAdminViewProps> = ({
  directory,
  logoDataUrl,
  geofence,
  onAddAdmin,
  onUpdateAdmin,
  onDeleteAdmin,
  onUpdateLogo,
  onUpdateGeofence,
  onRequestConfirm,
  onShowToast,
}) => {
  const [openSection, setOpenSection] = useState<SuperSection>('none');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editEmailError, setEditEmailError] = useState('');

  const [latInput, setLatInput] = useState(geofence.lat !== null ? String(geofence.lat) : '');
  const [lngInput, setLngInput] = useState(geofence.lng !== null ? String(geofence.lng) : '');
  const [radiusInput, setRadiusInput] = useState(String(geofence.radiusMeters || 100));
  const [capturingGps, setCapturingGps] = useState(false);

  const admins = directory.filter((d) => d.zone === 'ADMIN' && Boolean(d.email));

  const handleAddAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const check = validateGoogleAdminEmail(newEmail);

    if (!name) {
      onShowToast('Please enter the Admin Name.');
      return;
    }
    if (!check.valid) {
      setEmailError(check.error);
      onShowToast(check.error);
      return;
    }
    if (admins.some((a) => (a.email || '').toLowerCase() === check.email)) {
      const msg = 'This Google ID is already registered as a Campus Admin.';
      setEmailError(msg);
      onShowToast(msg);
      return;
    }

    setEmailError('');
    setAddingAdmin(true);
    try {
      await onAddAdmin({
        zone: 'ADMIN',
        unit: 'Campus Admin',
        name,
        email: check.email,
        phone: '',
        pin: '',
        pinMustChange: false,
        pinResetRequested: false,
      });
      setNewName('');
      setNewEmail('');
      setOpenSection('none');
      onShowToast(`${name} (${check.email}) added to Approved Admins.`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Could not add Campus Admin.');
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    const name = editName.trim();
    const check = validateGoogleAdminEmail(editEmail);
    if (!name) {
      onShowToast('Please enter the Admin Name.');
      return;
    }
    if (!check.valid) {
      setEditEmailError(check.error);
      onShowToast(check.error);
      return;
    }
    if (admins.some((a) => a.id !== id && (a.email || '').toLowerCase() === check.email)) {
      const msg = 'Another Approved Admin already uses this Google ID.';
      setEditEmailError(msg);
      onShowToast(msg);
      return;
    }
    setEditEmailError('');
    await onUpdateAdmin(id, name, check.email);
    setEditingId(null);
    onShowToast(`Updated ${name}'s details.`);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const maxDim = 280;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/png', 0.9);
        await onUpdateLogo(compressed);
        onShowToast('Campus logo updated on Welcome Screen!');
      };
      img.src = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleToggleGeofence = async () => {
    if (!geofence.enabled && (geofence.lat === null || geofence.lng === null)) {
      onShowToast('Capture or enter Main Gate Latitude & Longitude first.');
      return;
    }
    const next = { ...geofence, enabled: !geofence.enabled };
    await onUpdateGeofence(next);
    onShowToast(
      next.enabled
        ? `Main Gate Geofence ON (${next.radiusMeters}m)`
        : 'Main Gate Geofence turned OFF'
    );
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      onShowToast('GPS not supported on this device or browser.');
      return;
    }
    setCapturingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const rad = parseInt(radiusInput, 10) || 100;
        setLatInput(String(lat));
        setLngInput(String(lng));
        await onUpdateGeofence({ enabled: true, lat, lng, radiusMeters: rad });
        setCapturingGps(false);
        onShowToast(`Main Gate locked (${lat}, ${lng})`);
      },
      (err) => {
        setCapturingGps(false);
        onShowToast(`GPS Error: ${err.message}. Allow Location permission.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSaveGeofenceFields = async (nextRadius?: string) => {
    const latVal = parseFloat(latInput);
    const lngVal = parseFloat(lngInput);
    const radVal = parseInt(nextRadius ?? radiusInput, 10) || 100;
    await onUpdateGeofence({
      enabled: geofence.enabled,
      lat: Number.isFinite(latVal) ? Number(latVal.toFixed(6)) : null,
      lng: Number.isFinite(lngVal) ? Number(lngVal.toFixed(6)) : null,
      radiusMeters: radVal,
    });
    onShowToast('Gate coordinates & radius updated.');
  };

  return (
    <section className="space-y-4 max-w-2xl mx-auto w-full">
      {/* Super Admin Identity Header */}
      <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 shadow-lg border border-indigo-500/30 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
            <Crown className="w-4 h-4" />
            <span>Super Admin</span>
          </span>
          <span className="text-xs font-bold font-mono-tabular text-emerald-300">
            {admins.length} {admins.length === 1 ? 'Admin' : 'Admins'}
          </span>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Super Admin Management</h2>
          <p className="text-xs text-slate-300 mt-0.5">Bound Account: director@spmniwas.in</p>
        </div>
      </div>

      {/* Approved Admins List */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
        <h3 className="font-bold text-slate-900 text-base">Approved Admins</h3>
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
          {admins.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              No Approved Admins yet. Tap Add Admin below to create one.
            </div>
          ) : (
            admins.map((a) =>
              editingId === a.id ? (
                <div key={a.id} className="p-4 bg-indigo-50/40 space-y-2.5 text-sm">
                  <p className="text-xs font-bold text-indigo-800">Edit Admin Details</p>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(formatTitleCaseValue(e.target.value))}
                    placeholder="Name *"
                    aria-label="Admin Name"
                    className="w-full min-h-[42px] bg-white border border-indigo-200 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="space-y-1">
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => {
                        setEditEmail(e.target.value);
                        if (editEmailError) setEditEmailError('');
                      }}
                      placeholder="Google ID * (Gmail, Googlemail, or Google domain)"
                      aria-label="Admin Google ID"
                      aria-invalid={Boolean(editEmailError)}
                      className={`w-full min-h-[42px] bg-white border rounded-xl px-3.5 py-2 text-sm font-medium focus:outline-none focus:ring-2 ${
                        editEmailError
                          ? 'border-rose-400 focus:ring-rose-500'
                          : 'border-indigo-200 focus:ring-indigo-500'
                      }`}
                    />
                    {editEmailError && (
                      <p className="text-[11px] font-semibold text-rose-600 px-1">{editEmailError}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(a.id)}
                      className="min-h-[40px] py-2 px-3 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white text-xs font-bold transition"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditEmailError('');
                      }}
                      className="min-h-[40px] py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div key={a.id} className="p-4 bg-white space-y-3 text-sm">
                  <div className="space-y-0.5">
                    <p className="font-bold text-base text-slate-900 break-words">{a.name}</p>
                    <p className="text-xs font-medium text-indigo-700 break-all">{a.email}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(a.id);
                        setEditName(a.name);
                        setEditEmail(a.email || '');
                        setEditEmailError('');
                      }}
                      className="min-h-[40px] py-2 px-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold transition inline-flex items-center justify-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onRequestConfirm({
                          title: 'Delete Approved Admin',
                          message: `Delete ${a.name} (${a.email}) from Approved Admins?`,
                          onConfirm: () => onDeleteAdmin(a.id),
                        })
                      }
                      className="min-h-[40px] py-2 px-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition inline-flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>

      {/* Add Admin Toggle */}
      <button
        type="button"
        onClick={() => setOpenSection((prev) => (prev === 'add' ? 'none' : 'add'))}
        className="w-full min-h-[52px] bg-white hover:bg-slate-50 text-slate-900 font-bold text-sm py-3.5 px-4 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between transition"
      >
        <span className="flex items-center gap-2.5">
          <UserPlus className="w-4 h-4 text-indigo-700" />
          <span>Add Admin</span>
        </span>
        {openSection === 'add' ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {openSection === 'add' && (
        <form
          onSubmit={handleAddAdminSubmit}
          className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3.5"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Add Admin</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Gmail, Googlemail, or Google custom domain IDs only
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenSection('none')}
              className="p-2 rounded-xl bg-slate-100 text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(formatTitleCaseValue(e.target.value))}
              placeholder="Name *"
              aria-label="Admin Name"
              className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="space-y-1">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  if (emailError) setEmailError('');
                }}
                placeholder="Google ID * (Gmail, Googlemail, or Google domain)"
                aria-label="Google ID"
                aria-invalid={Boolean(emailError)}
                className={`w-full min-h-[44px] bg-slate-50 border rounded-xl px-3.5 py-2.5 text-sm font-medium placeholder:font-normal focus:outline-none focus:ring-2 ${
                  emailError
                    ? 'border-rose-400 focus:ring-rose-500'
                    : 'border-slate-200 focus:ring-indigo-500'
                }`}
              />
              {emailError && (
                <p className="text-[11px] font-semibold text-rose-600 px-1">{emailError}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={addingAdmin}
              className="w-full min-h-[46px] bg-indigo-900 hover:bg-indigo-950 disabled:opacity-60 text-white font-bold text-sm py-3 px-4 rounded-xl shadow-md transition"
            >
              {addingAdmin ? 'Adding Admin...' : 'Add Admin'}
            </button>
          </div>
        </form>
      )}

      {/* Institute Logo */}
      <button
        type="button"
        onClick={() => setOpenSection((prev) => (prev === 'logo' ? 'none' : 'logo'))}
        className="w-full min-h-[52px] bg-white hover:bg-slate-50 text-slate-900 font-bold text-sm py-3.5 px-4 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between transition"
      >
        <span className="flex items-center gap-2.5">
          <Building2 className="w-4 h-4 text-slate-700" />
          <span>Institute Logo</span>
        </span>
        {openSection === 'logo' ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {openSection === 'logo' && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">Shown at the center of the Swagat welcome screen</p>
            <button
              type="button"
              onClick={() => setOpenSection('none')}
              className="p-2 rounded-xl bg-slate-100 text-slate-600 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden shrink-0">
              {logoDataUrl ? (
                <img src={logoDataUrl} alt="Institute Logo" className="w-full h-full object-contain p-1 bg-white" />
              ) : (
                <span className="text-xs font-bold text-slate-400 text-center px-1">No Logo</span>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <label className="cursor-pointer w-full min-h-[44px] bg-slate-900 hover:bg-indigo-950 text-white font-bold text-sm py-2.5 px-4 rounded-xl shadow-sm transition flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" />
                <span>Upload Logo</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </label>
              {logoDataUrl && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdateLogo('');
                    onShowToast('Logo reset to placeholder.');
                  }}
                  className="w-full min-h-[40px] bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-sm py-2 rounded-xl transition"
                >
                  Remove Custom Logo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Gate Geofencing */}
      <button
        type="button"
        onClick={() => setOpenSection((prev) => (prev === 'geofence' ? 'none' : 'geofence'))}
        className="w-full min-h-[52px] bg-white hover:bg-slate-50 text-slate-900 font-bold text-sm py-3.5 px-4 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between transition"
      >
        <span className="flex items-center gap-2.5">
          <MapPin className="w-4 h-4 text-emerald-700" />
          <span>Main Gate Geofencing</span>
          <span className="text-xs font-semibold text-slate-500">
            · {geofence.enabled ? `ON (${geofence.radiusMeters}m)` : 'OFF'}
          </span>
        </span>
        {openSection === 'geofence' ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {openSection === 'geofence' && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">Restrict Guard check-ins to physical gate GPS</p>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleToggleGeofence}
                className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                  geofence.enabled
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {geofence.enabled ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => setOpenSection('none')}
                className="p-2 rounded-xl bg-slate-100 text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCaptureGps}
            disabled={capturingGps}
            className="w-full min-h-[44px] bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold text-xs py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            <Crosshair className="w-4 h-4" />
            <span>
              {capturingGps ? 'Reading GPS satellites...' : 'Capture My Current Gate Location'}
            </span>
          </button>

          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={latInput}
              onChange={(e) => setLatInput(e.target.value)}
              onBlur={() => handleSaveGeofenceFields()}
              placeholder="Lat (22.5726)"
              aria-label="Latitude"
              className="w-full min-h-[42px] bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-mono-tabular"
            />
            <input
              type="text"
              value={lngInput}
              onChange={(e) => setLngInput(e.target.value)}
              onBlur={() => handleSaveGeofenceFields()}
              placeholder="Lng (88.3639)"
              aria-label="Longitude"
              className="w-full min-h-[42px] bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-mono-tabular"
            />
            <select
              value={radiusInput}
              onChange={(e) => {
                setRadiusInput(e.target.value);
                handleSaveGeofenceFields(e.target.value);
              }}
              aria-label="Geofence Radius"
              className="w-full min-h-[42px] bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold"
            >
              <option value="50">50m</option>
              <option value="100">100m</option>
              <option value="150">150m</option>
              <option value="250">250m</option>
              <option value="500">500m</option>
            </select>
          </div>
        </div>
      )}
    </section>
  );
};
