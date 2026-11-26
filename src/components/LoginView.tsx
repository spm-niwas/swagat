import React, { useState } from 'react';
import { Building2, Crown, KeyRound } from 'lucide-react';
import {
  displayIndianMobile,
  isValidIndianMobile,
  normalizeIndianMobile,
} from '../utils/formatters';

interface LoginViewProps {
  logoDataUrl: string;
  attemptHint: string;
  googleLoading?: boolean;
  firebaseEmail?: string | null;
  onGoogleLogin: () => Promise<void> | void;
  onPinLogin: (phone: string, pin: string) => void;
  onOpenForgotPin: () => void;
  onOpenSuperAdminLogin: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  logoDataUrl,
  attemptHint,
  googleLoading = false,
  firebaseEmail = null,
  onGoogleLogin,
  onPinLogin,
  onOpenForgotPin,
  onOpenSuperAdminLogin,
}) => {
  const [phoneInput, setPhoneInput] = useState('');
  const [pinInput, setPinInput] = useState('');

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = normalizeIndianMobile(e.target.value);
    if (cleaned.length > 0 && !/^[6-9]/.test(cleaned)) {
      setPhoneInput('');
      return;
    }
    setPhoneInput(displayIndianMobile(cleaned));
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPinInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 4));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onPinLogin(normalizeIndianMobile(phoneInput), pinInput.trim());
  };

  const phoneReady = isValidIndianMobile(phoneInput);

  return (
    <section className="flex-1 overflow-y-auto no-scrollbar p-6 flex flex-col justify-between bg-gradient-to-br from-amber-50/90 via-indigo-50/75 to-sky-100/80 relative">
      <div className="my-auto flex flex-col items-center text-center space-y-5 relative z-10 max-w-sm w-full mx-auto">
        <div
          className={`w-24 h-24 rounded-3xl bg-white/95 backdrop-blur flex flex-col items-center justify-center overflow-hidden transition-all ${
            logoDataUrl
              ? 'border border-slate-200 shadow-md'
              : 'border-2 border-dashed border-amber-400/80 shadow-lg shadow-indigo-950/10'
          }`}
        >
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="SPM NIWAS Logo" className="w-full h-full object-contain p-1.5" />
          ) : (
            <div className="flex flex-col items-center justify-center text-amber-600 px-2">
              <Building2 className="w-8 h-8 mb-1 text-amber-500" />
              <span className="text-[11px] font-bold tracking-wider">Logo</span>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-indigo-900/75">
            SPM NIWAS
          </p>
          <h2 className="font-swagat text-4xl font-black bg-gradient-to-r from-indigo-950 via-blue-800 to-amber-700 bg-clip-text text-transparent leading-tight">
            Swagat
          </h2>
          <p className="text-sm font-semibold text-slate-600">Guest Welcome App</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full bg-white/95 backdrop-blur-md rounded-3xl p-5 shadow-xl shadow-indigo-950/10 border border-white space-y-3 text-left"
        >
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
            <span>
              {googleLoading
                ? 'Connecting Google...'
                : firebaseEmail
                  ? `Connected (${firebaseEmail})`
                  : 'Continue with Google'}
            </span>
          </button>

          <div className="flex items-center gap-2 py-0.5">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] font-semibold text-slate-400">or PIN Login</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={16}
              value={phoneInput}
              onChange={handlePhoneChange}
              placeholder="Mobile Number"
              aria-label="Mobile Number"
              className="w-full min-h-[48px] bg-slate-50 border border-indigo-100 rounded-xl px-4 py-3 text-base font-bold font-mono-tabular tracking-wider text-center text-slate-900 placeholder:font-sans placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>

          <div>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              value={pinInput}
              onChange={handlePinChange}
              placeholder="4-Digit PIN"
              aria-label="4-Digit PIN"
              className="pin-mask w-full min-h-[48px] bg-slate-50 border border-indigo-100 rounded-xl px-4 py-3 text-lg font-extrabold tracking-[0.45em] text-center text-slate-900 placeholder:text-base placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>

          <button
            type="submit"
            className="w-full min-h-[48px] bg-gradient-to-r from-indigo-900 via-blue-800 to-indigo-950 hover:from-indigo-800 hover:to-slate-900 active:scale-[0.99] text-white font-bold text-base py-3 rounded-xl shadow-lg shadow-indigo-900/25 transition flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            <span>{phoneReady && pinInput.length === 4 ? 'Sign In' : 'Login'}</span>
          </button>

          <div className="flex flex-col items-center justify-center pt-1.5 text-xs text-center space-y-2">
            <button
              type="button"
              onClick={onOpenForgotPin}
              className="min-h-[36px] px-2 font-bold text-indigo-700 hover:text-amber-700 hover:underline transition"
            >
              Forgot PIN? Request Admin Reset
            </button>
            <button
              type="button"
              onClick={onOpenSuperAdminLogin}
              className="min-h-[36px] px-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-800 transition"
            >
              <Crown className="w-3.5 h-3.5 text-amber-600" />
              <span>Super Admin Login</span>
            </button>
            {attemptHint && <span className="text-rose-600 font-semibold">{attemptHint}</span>}
          </div>
        </form>
      </div>

      <p className="text-center text-xs text-indigo-950/60 font-semibold pt-4 relative z-10">
        SPM NIWAS Secure Campus Access
      </p>
    </section>
  );
};
