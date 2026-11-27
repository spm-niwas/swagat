import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Copy,
  Crown,
  Download,
  KeyRound,
  MapPin,
  QrCode,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  Share2,
  X,
} from 'lucide-react';
import type {
  ConfirmDialogConfig,
  GuardGpsPopupState,
  UserSession,
  VisitorRecord,
} from '../types/swagat';
import {
  displayIndianMobile,
  isValidIndianMobile,
  normalizeIndianMobile,
  SUPERADMIN_EMAIL,
} from '../utils/formatters';
import {
  copyQrPassImage,
  generateQrDataUrl,
  shareQrPassImage,
  type GeneratedQrPassCard,
} from '../utils/qrPassCard';

/* 1. Digital Zone Pass Modal */
export const PassModal: React.FC<{
  visitor: VisitorRecord | null;
  logoDataUrl?: string;
  onClose: () => void;
}> = ({ visitor, logoDataUrl, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (!visitor) {
      setQrDataUrl('');
      return;
    }
    generateQrDataUrl({
      otp: visitor.passCode || '0000',
      guestName: visitor.visitorName,
      destination: visitor.destination,
      zone: visitor.zone,
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [visitor]);

  if (!visitor) return null;
  const isOffice = visitor.zone === 'OFFICE';
  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div
        className={`w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl border-4 ${
          isOffice ? 'border-blue-600' : 'border-emerald-600'
        }`}
      >
        <div
          className={`${
            isOffice ? 'bg-blue-600' : 'bg-emerald-600'
          } text-white p-5 text-center relative`}
        >
          {logoDataUrl && (
            <img
              src={logoDataUrl}
              alt="SPM NIWAS"
              className="w-9 h-9 rounded-xl bg-white/95 object-contain p-1 mx-auto mb-2 shadow-sm"
            />
          )}
          <p className="text-xs font-bold uppercase tracking-widest opacity-90">
            Authorized Zone Pass
          </p>
          <h3 className="text-xl font-extrabold mt-0.5">
            {isOffice ? 'CORPORATE OFFICE' : 'RESIDENTIAL WING'}
          </h3>
        </div>
        <div className="p-5 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-36 h-36 rounded-2xl bg-white border-2 border-slate-200 p-2 mx-auto shadow-sm">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code for ${visitor.visitorName}`}
                className="w-full h-full object-contain rounded-lg"
              />
            ) : (
              <QrCode className="w-16 h-16 text-slate-800" />
            )}
          </div>
          <div>
            <h4 className="text-lg font-bold text-slate-900">{visitor.visitorName}</h4>
            <p className="text-xs font-semibold text-slate-500">
              {visitor.visitorType}
              {visitor.vehicleNumber ? ` · ${visitor.vehicleNumber}` : ''}
            </p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 text-xs space-y-1">
            <p className="text-slate-500">
              Destination: <strong className="text-slate-800">{visitor.destination}</strong>
            </p>
            <p className="text-slate-500 font-mono-tabular">
              Pass OTP: <strong className="text-slate-900">{visitor.passCode}</strong> ·{' '}
              <span>{visitor.timeLabel}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-xl transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

/* 2. Settings Modal */
export const SettingsModal: React.FC<{
  open: boolean;
  session: UserSession | null;
  onClose: () => void;
  onSelfPinChange: (oldPin: string, newPin: string) => Promise<void>;
}> = ({
  open,
  session,
  onClose,
  onSelfPinChange,
}) => {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');

  if (!open) return null;
  const isAdmin = session?.role === 'admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSelfPinChange(oldPin, newPin);
    setOldPin('');
    setNewPin('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-700" />
            <span>{isAdmin ? 'Admin Settings' : 'Account Settings'}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {session && session.role === 'superadmin' && (
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 space-y-1">
            <p className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-600" />
              <span>Google Account Authentication</span>
            </p>
            <p className="text-xs text-amber-900/90 leading-relaxed">
              Super Admin access is secured exclusively through Google Sign-In ({SUPERADMIN_EMAIL}).
            </p>
          </div>
        )}

        {session && session.role !== 'superadmin' && (
          <form
            onSubmit={handleSubmit}
            className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-3.5 space-y-2.5"
          >
            <p className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change My 4-Digit PIN</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="tel"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                value={oldPin}
                onChange={(e) => setOldPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="Current PIN"
                className="pin-mask min-h-[42px] bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="tel"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="New PIN"
                className="pin-mask min-h-[42px] bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[42px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 rounded-xl transition"
            >
              Update My Private PIN
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[42px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl transition"
        >
          Close
        </button>
      </div>
    </div>
  );
};

/* 3. Forced First-Login Private PIN Setup Modal */
export const ForcePinModal: React.FC<{
  open: boolean;
  onSubmit: (pin1: string, pin2: string) => Promise<void>;
}> = ({ open, onSubmit }) => {
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(pin1, pin2);
    setPin1('');
    setPin2('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-3.5 text-center"
      >
        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <KeyRound className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900 text-base">Set Your Private 4-Digit PIN</h3>
          <p className="text-xs text-slate-500 mt-1">
            You signed in with a temporary PIN. Create your own personal PIN to secure your portal.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="tel"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            value={pin1}
            onChange={(e) => setPin1(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="New PIN"
            className="pin-mask min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-center font-extrabold tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="tel"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="Confirm PIN"
            className="pin-mask min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-center font-extrabold tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          className="w-full min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-xl shadow"
        >
          Save Private PIN & Continue
        </button>
      </form>
    </div>
  );
};

/* 4. Forgot PIN Modal */
export const ForgotPinModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSubmit: (phone: string) => Promise<void>;
}> = ({ open, onClose, onSubmit }) => {
  const [phone, setPhone] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(normalizeIndianMobile(phone));
    setPhone('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-3.5"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4 text-blue-600" />
            <span>Request PIN Reset</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Enter your registered SPM NIWAS mobile number. An alert will appear on the Admin
          dashboard to issue you a fresh temporary PIN.
        </p>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={16}
          value={phone}
          onChange={(e) => {
            const cleaned = normalizeIndianMobile(e.target.value);
            if (cleaned.length > 0 && !/^[6-9]/.test(cleaned)) {
              setPhone('');
              return;
            }
            setPhone(displayIndianMobile(cleaned));
          }}
          placeholder="98765 43210"
          className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold font-mono-tabular tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!isValidIndianMobile(phone)}
            className="flex-1 min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs py-3 rounded-xl"
          >
            Notify Admin Now
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] bg-slate-100 text-slate-700 font-bold text-xs px-4 py-3 rounded-xl"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

/* 5. Super Admin Login Modal (Google/Gmail only: director@spmniwas.in) */
export const SuperAdminLoginModal: React.FC<{
  open: boolean;
  googleLoading?: boolean;
  firebaseEmail?: string | null;
  authError?: string | null;
  onGoogleLogin: () => Promise<void> | void;
  onSwitchGoogleAccount?: () => Promise<void> | void;
  onClose: () => void;
}> = ({
  open,
  googleLoading = false,
  firebaseEmail = null,
  authError = null,
  onGoogleLogin,
  onSwitchGoogleAccount,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-1.5">
            <Crown className="w-4 h-4 text-amber-600" />
            <span>Super Admin Login</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Super Admin Login"
            className="p-2 rounded-xl bg-slate-100 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Sign in with Google using the authorized Director account{' '}
          <strong className="text-slate-900">{SUPERADMIN_EMAIL}</strong>.
        </p>

        <button
          type="button"
          disabled={googleLoading}
          onClick={onGoogleLogin}
          className="w-full min-h-[46px] bg-white hover:bg-slate-50 active:scale-[0.99] text-slate-800 font-bold text-sm py-2.5 px-4 rounded-xl border border-slate-200 shadow-sm transition flex items-center justify-center gap-2.5 disabled:opacity-60"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          <span>{googleLoading ? 'Connecting Google...' : 'Continue with Google'}</span>
        </button>

        {authError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 space-y-1.5">
            <div className="flex items-start gap-2 font-semibold leading-relaxed">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          </div>
        )}

        {firebaseEmail && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950 space-y-2">
            <p className="leading-relaxed font-medium">
              Connected as <span className="font-bold break-all">{firebaseEmail}</span>. Only{' '}
              <span className="font-bold">{SUPERADMIN_EMAIL}</span> is permitted for Super Admin
              access.
            </p>
            {onSwitchGoogleAccount && (
              <button
                type="button"
                disabled={googleLoading}
                onClick={onSwitchGoogleAccount}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold text-xs transition inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Switch Google Account</span>
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[42px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

/* 6. Unified Confirmation Modal */
export const ConfirmActionModal: React.FC<{
  config: ConfirmDialogConfig | null;
  onClose: () => void;
}> = ({ config, onClose }) => {
  if (!config) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-3.5 text-center">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900 text-base">{config.title}</h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{config.message}</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              const action = config.onConfirm;
              onClose();
              await action();
            }}
            className="w-full min-h-[44px] bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3 rounded-xl shadow transition"
          >
            {config.confirmLabel || 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* 8. Guard GPS Alert Modal */
export const GuardGpsModal: React.FC<{
  popup: GuardGpsPopupState;
  radiusMeters: number;
  onClose: () => void;
  onRetry: () => void;
}> = ({ popup, radiusMeters, onClose, onRetry }) => {
  if (!popup.open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-3.5 text-center">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${
            popup.reason === 'OUTSIDE'
              ? 'bg-rose-100 text-rose-600'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          <MapPin className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900 text-base">
            {popup.reason === 'OUTSIDE'
              ? 'Outside Main Gate Threshold'
              : 'Turn On GPS Location'}
          </h3>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            {popup.reason === 'OUTSIDE'
              ? `You are currently ${popup.distanceMeters ?? ''}m away from the Main Gate. Please come within ${radiusMeters}m to proceed.`
              : 'GPS is turned off or unavailable. Enable Location Services on your phone and tap Retry GPS.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="w-full min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl shadow transition"
          >
            Retry GPS
          </button>
        </div>
      </div>
    </div>
  );
};

/* 9. Share Credentials Modal (Replaces window.open for WhatsApp invite sharing) */
export const ShareCredentialsModal: React.FC<{
  payload: { name: string; phone: string; pin: string; message: string } | null;
  onClose: () => void;
  onCopy: () => void;
}> = ({ payload, onClose, onCopy }) => {
  if (!payload) return null;
  const cleanPhone = normalizeIndianMobile(payload.phone);
  const waUrl = isValidIndianMobile(cleanPhone)
    ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(payload.message)}`
    : `https://wa.me/?text=${encodeURIComponent(payload.message)}`;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-base">Credentials Ready</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-600">
          Temporary PIN <strong className="font-mono-tabular text-slate-900">{payload.pin}</strong>{' '}
          generated for <strong>{payload.name}</strong> ({displayIndianMobile(payload.phone)}).
        </p>
        <pre className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
          {payload.message}
        </pre>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send WhatsApp</span>
          </a>
          <button
            type="button"
            onClick={onCopy}
            className="min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* 10. Mobile QR Pass Image Preview & WhatsApp Share Modal */
export const QrPassShareModal: React.FC<{
  payload: {
    card: GeneratedQrPassCard;
    visitorName: string;
    phone?: string;
    inviteText: string;
  } | null;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}> = ({ payload, onClose, onShowToast }) => {
  const [sharing, setSharing] = useState(false);

  if (!payload) return null;

  const cleanPhone = normalizeIndianMobile(payload.phone || '');
  const waUrl = isValidIndianMobile(cleanPhone)
    ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(payload.inviteText)}`
    : `https://wa.me/?text=${encodeURIComponent(payload.inviteText)}`;

  const handleShareImage = async () => {
    setSharing(true);
    try {
      const result = await shareQrPassImage(payload.card, payload.inviteText);
      if (result === 'shared') {
        onShowToast('QR Pass image shared!');
      } else if (result === 'copied_and_downloaded') {
        onShowToast('QR Pass downloaded & copied — attach or paste into WhatsApp!');
      } else if (result === 'downloaded') {
        onShowToast('QR Pass PNG downloaded — attach in WhatsApp!');
      }
    } finally {
      setSharing(false);
    }
  };

  const handleCopyImage = async () => {
    const ok = await copyQrPassImage(payload.card);
    onShowToast(
      ok
        ? 'QR Pass image copied! Paste it directly in WhatsApp.'
        : 'Clipboard image copy unavailable here — use Download PNG.'
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-4 shadow-2xl space-y-3 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Mobile QR Guest Pass</h3>
            <p className="text-xs text-slate-500">{payload.visitorName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR Pass Preview"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-inner">
          <img
            src={payload.card.dataUrl}
            alt={`Mobile QR Entry Pass for ${payload.visitorName}`}
            className="w-full h-auto block"
          />
        </div>

        <div className="space-y-2">
          <button
            type="button"
            disabled={sharing}
            onClick={handleShareImage}
            className="w-full min-h-[46px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition"
          >
            <Share2 className="w-4 h-4" />
            <span>{sharing ? 'Preparing Image...' : 'Share QR Image on WhatsApp'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={payload.card.dataUrl}
              download={payload.card.fileName}
              onClick={() => onShowToast('Downloading QR Pass PNG...')}
              className="min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PNG</span>
            </a>
            <button
              type="button"
              onClick={handleCopyImage}
              className="min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Image</span>
            </button>
          </div>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[44px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Open WhatsApp Chat</span>
          </a>
        </div>
      </div>
    </div>
  );
};

