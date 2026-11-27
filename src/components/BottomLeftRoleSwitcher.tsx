import React from 'react';
import { Crown, KeyRound, ShieldCheck, Smartphone, UserCog } from 'lucide-react';
import type { RoleType } from '../types/swagat';

interface BottomLeftRoleSwitcherProps {
  hasSession: boolean;
  currentRole: RoleType;
  onSelectLogin: () => void;
  onSelectRole: (role: RoleType) => void;
}

export const BottomLeftRoleSwitcher: React.FC<BottomLeftRoleSwitcherProps> = ({
  hasSession,
  currentRole,
  onSelectLogin,
  onSelectRole,
}) => {
  const baseBtn =
    'min-h-[34px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer';
  const inactiveBtn = 'text-slate-300 hover:text-white hover:bg-slate-800';
  const activeBtn = 'bg-amber-400 text-slate-950 shadow-sm';

  return (
    <div
      aria-label="Design Role Switcher"
      className="fixed bottom-3 left-3 z-40 hidden sm:flex items-center gap-1 p-1.5 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-slate-700/80 shadow-2xl"
    >
      <button
        type="button"
        onClick={onSelectLogin}
        className={`${baseBtn} ${!hasSession ? activeBtn : inactiveBtn}`}
      >
        <KeyRound className="w-3.5 h-3.5" />
        <span>Login</span>
      </button>
      <button
        type="button"
        onClick={() => onSelectRole('guard')}
        className={`${baseBtn} ${hasSession && currentRole === 'guard' ? activeBtn : inactiveBtn}`}
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Guard</span>
      </button>
      <button
        type="button"
        onClick={() => onSelectRole('host')}
        className={`${baseBtn} ${hasSession && currentRole === 'host' ? activeBtn : inactiveBtn}`}
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span>Host</span>
      </button>
      <button
        type="button"
        onClick={() => onSelectRole('admin')}
        className={`${baseBtn} ${hasSession && currentRole === 'admin' ? activeBtn : inactiveBtn}`}
      >
        <UserCog className="w-3.5 h-3.5" />
        <span>Admin</span>
      </button>
      <button
        type="button"
        onClick={() => onSelectRole('superadmin')}
        className={`${baseBtn} ${hasSession && currentRole === 'superadmin' ? activeBtn : inactiveBtn}`}
      >
        <Crown className="w-3.5 h-3.5" />
        <span>Super Admin</span>
      </button>
    </div>
  );
};
