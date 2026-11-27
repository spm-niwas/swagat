import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LogOut, Settings } from 'lucide-react';
import type { DirectoryEntry, RoleType, UserSession } from '../types/swagat';
import { extractUnitName } from '../utils/formatters';

interface HeaderBarProps {
  session: UserSession | null;
  currentRole: RoleType;
  directory: DirectoryEntry[];
  logoDataUrl: string;
  onSwitchRole: (role: RoleType) => void;
  onOpenSettings: () => void;
  onRequestLogout: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  session,
  currentRole,
  directory,
  logoDataUrl,
  onSwitchRole,
  onOpenSettings,
  onRequestLogout,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const getCategoryDetails = () => {
    if (!session) return { category: 'Guest', unitText: '' };
    if (session.role === 'superadmin') return { category: 'Super Admin', unitText: 'Director Office' };
    if (session.role === 'admin') return { category: 'Campus Admin', unitText: 'Management Office' };
    if (session.role === 'guard') {
      const guardRec = directory.find((d) => d.phone === session.phone && d.zone === 'GUARD');
      return { category: 'Security Guard', unitText: guardRec?.unit || 'Main Gate' };
    }
    const userRecs = directory.filter((d) => d.phone === session.phone);
    const hasOffice = userRecs.some((r) => r.zone === 'OFFICE');
    const hasRes = userRecs.some((r) => r.zone === 'RESIDENTIAL');
    const isFamily = userRecs.some((r) => r.isFamilyMember === true);
    const units = (session.allowedUnits || []).map(extractUnitName).filter(Boolean).join(' · ');

    if (hasOffice && hasRes) return { category: 'Office with Residence', unitText: units };
    if (isFamily) return { category: 'Family Member', unitText: units };
    if (hasRes) return { category: 'Resident', unitText: units };
    return { category: 'Office Staff', unitText: units };
  };

  const details = getCategoryDetails();
  const isDirector = session?.role === 'superadmin';
  const isAdminInOtherView = session?.role === 'admin' && currentRole !== 'admin';
  const showBackButton = (isDirector && currentRole !== 'superadmin') || isAdminInOtherView;

  return (
    <header className="bg-slate-900 text-white px-4 py-3 shrink-0 z-30 shadow-md relative">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt="SPM NIWAS Logo" className="w-full h-full object-contain p-1 bg-white" />
            ) : (
              <span className="font-swagat text-lg font-black text-amber-400">S</span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-swagat text-base font-black text-white tracking-wider truncate whitespace-nowrap">
              Swagat
            </h1>
            <p className="text-xs font-medium text-amber-300/90 truncate">SPM NIWAS · Guest Welcome</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 relative" ref={menuRef}>
          {showBackButton && (
            <button
              type="button"
              onClick={() => onSwitchRole(isDirector ? 'superadmin' : 'admin')}
              className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{isDirector ? 'Super Admin' : 'Admin'}</span>
            </button>
          )}

          {session && (
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Account and Settings"
              className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}

          {menuOpen && session && (
            <div className="absolute right-0 top-13 w-64 bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 p-4 z-50 space-y-3">
              <div className="space-y-1 border-b border-slate-100 pb-3">
                <p className="text-sm font-bold text-slate-900 break-words">{session.name}</p>
                <p className="text-xs font-semibold text-indigo-700">{details.category}</p>
                {details.unitText && (
                  <p className="text-xs text-slate-500 break-words">Unit: {details.unitText}</p>
                )}
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full min-h-[42px] bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Account Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRequestLogout();
                  }}
                  className="w-full min-h-[42px] bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 px-3 rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
