import React, { useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Crown,
  Home,
  LayoutGrid,
  LogIn,
  Shield,
} from 'lucide-react';
import type { RoleType, UserSession } from '../types/swagat';

interface BottomLeftRoleSwitcherProps {
  session: UserSession | null;
  currentRole: RoleType;
  designStudioMode: boolean;
  onSelectLogin: () => void;
  onSelectRole: (role: RoleType) => void;
  onToggleDesignStudio: () => void;
}

export const BottomLeftRoleSwitcher: React.FC<BottomLeftRoleSwitcherProps> = ({
  session,
  currentRole,
  designStudioMode,
  onSelectLogin,
  onSelectRole,
  onToggleDesignStudio,
}) => {
  const [expanded, setExpanded] = useState(false);

  const activeKey = designStudioMode
    ? 'all'
    : !session
      ? 'login'
      : currentRole;

  const activeLabelMap: Record<string, string> = {
    login: 'Login',
    guard: 'Guard',
    host: 'Host',
    admin: 'Admin',
    superadmin: 'Super Admin',
    all: 'All Views',
  };

  const roles: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
  }> = [
    {
      key: 'login',
      label: 'Login',
      icon: <LogIn className="w-3.5 h-3.5" />,
      onClick: () => {
        onSelectLogin();
        setExpanded(false);
      },
    },
    {
      key: 'guard',
      label: 'Guard',
      icon: <Shield className="w-3.5 h-3.5" />,
      onClick: () => {
        onSelectRole('guard');
        setExpanded(false);
      },
    },
    {
      key: 'host',
      label: 'Host',
      icon: <Home className="w-3.5 h-3.5" />,
      onClick: () => {
        onSelectRole('host');
        setExpanded(false);
      },
    },
    {
      key: 'admin',
      label: 'Admin',
      icon: <BarChart3 className="w-3.5 h-3.5" />,
      onClick: () => {
        onSelectRole('admin');
        setExpanded(false);
      },
    },
    {
      key: 'superadmin',
      label: 'Super Admin',
      icon: <Crown className="w-3.5 h-3.5" />,
      onClick: () => {
        onSelectRole('superadmin');
        setExpanded(false);
      },
    },
    {
      key: 'all',
      label: 'All Screens',
      icon: <LayoutGrid className="w-3.5 h-3.5" />,
      onClick: () => {
        onToggleDesignStudio();
        setExpanded(false);
      },
    },
  ];

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
      {expanded && (
        <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-2 shadow-2xl border border-slate-700/80 flex flex-col gap-1 min-w-[164px]">
          <p className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Design View Roles
          </p>
          {roles.map((item) => {
            const isActive = activeKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className={`min-h-[40px] w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition whitespace-nowrap ${
                  isActive
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label="Toggle design view role switcher"
        className="min-h-[42px] px-3.5 py-2 rounded-full bg-slate-900/95 hover:bg-slate-800 text-white border border-slate-700 shadow-xl backdrop-blur-md text-xs font-bold flex items-center gap-2 transition whitespace-nowrap"
      >
        <LayoutGrid className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>Role: {activeLabelMap[activeKey] || 'Login'}</span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
      </button>
    </div>
  );
};
