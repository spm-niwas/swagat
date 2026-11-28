import React, { useState } from 'react';
import { Building2, KeyRound, ShieldCheck } from 'lucide-react';
import {
  isValidIndianMobile,
  normalizeIndianMobile,
} from '../utils/formatters';
import { MobileInput } from './MobileInput';

interface LoginViewProps {
  logoDataUrl: string;
  attemptHint: string;
  onPinLogin: (phone: string, pin: string) => void;
  onOpenForgotPin: () => void;
  onOpenAdminLogin: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  logoDataUrl,
  attemptHint,
  onPinLogin,
  onOpenForgotPin,
  onOpenAdminLogin,
}) => {
  const [phoneInput, setPhoneInput] = useState('');
  const [pinInput, setPinInput] = useState('');

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
          <div>
            <MobileInput
              value={phoneInput}
              onChange={(formatted) => setPhoneInput(formatted)}
              placeholder="Mobile"
              ariaLabel="Mobile"
              errorAlign="center"
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

          <div className="pt-1.5 text-xs text-center space-y-2">
            <div className="flex items-center justify-center gap-3 whitespace-nowrap">
              <button
                type="button"
                onClick={onOpenForgotPin}
                className="min-h-[36px] px-2 font-bold text-indigo-700 hover:text-amber-700 hover:underline transition"
              >
                Forgot Pin?
              </button>
              <span className="h-3.5 w-px bg-slate-300 shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={onOpenAdminLogin}
                className="min-h-[36px] px-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-800 transition"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Admin</span>
              </button>
            </div>
            {attemptHint && <p className="text-rose-600 font-semibold">{attemptHint}</p>}
          </div>
        </form>
      </div>

      <p className="text-center text-xs text-indigo-950/60 font-semibold pt-4 relative z-10">
        SPM NIWAS Secure Campus Access
      </p>
    </section>
  );
};
