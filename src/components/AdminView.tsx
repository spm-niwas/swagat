import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Building,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Home,
  KeyRound,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  ConfirmDialogConfig,
  DirectoryEntry,
  UserSession,
  VisitorRecord,
} from '../types/swagat';
import {
  displayIndianMobile,
  formatTitleCaseValue,
  isSameUnit,
  isValidIndianMobile,
  normalizeIndianMobile,
} from '../utils/formatters';
import { generateSecurityBriefingApi } from '../services/api';

interface AdminViewProps {
  session: UserSession | null;
  visitors: VisitorRecord[];
  directory: DirectoryEntry[];
  housingUnits: string[];
  onOpenPersonalHostView: () => void;
  onAddDirectoryEntries: (entries: Array<Omit<DirectoryEntry, 'id'>>) => Promise<void>;
  onAddHousingUnits: (unitsText: string) => Promise<{ added: string[] }>;
  onDeleteHousingUnit: (unit: string) => Promise<void>;
  onTagHostToHousingUnit: (phone: string, unit: string) => Promise<void>;
  onResetUserPin: (entry: DirectoryEntry) => Promise<void>;
  onDeleteDirectoryEntry: (id: string) => Promise<void>;
  onDeleteEmployeeByPhone: (phone: string) => Promise<void>;
  onShareCredentials: (name: string, phone: string, pin: string) => void;
  onRequestConfirm: (cfg: ConfirmDialogConfig) => void;
  onShowToast: (msg: string) => void;
}

type AdminSection = 'none' | 'users' | 'housing' | 'resets';

interface ConsolidatedUser {
  primaryId: string;
  name: string;
  phone: string;
  pin: string;
  pinMustChange: boolean;
  pinResetRequested: boolean;
  officeRec: DirectoryEntry | null;
  resRecs: DirectoryEntry[];
  guardRec: DirectoryEntry | null;
  adminRec: DirectoryEntry | null;
  category: 'OFFICE' | 'OFFICE_RES' | 'GUARD' | 'ADMIN';
}

export const AdminView: React.FC<AdminViewProps> = ({
  session,
  visitors,
  directory,
  housingUnits,
  onOpenPersonalHostView,
  onAddDirectoryEntries,
  onAddHousingUnits,
  onDeleteHousingUnit,
  onTagHostToHousingUnit,
  onResetUserPin,
  onDeleteDirectoryEntry,
  onDeleteEmployeeByPhone,
  onShareCredentials,
  onRequestConfirm,
  onShowToast,
}) => {
  const [gateFeedOpen, setGateFeedOpen] = useState(false);
  const [openSection, setOpenSection] = useState<AdminSection>('none');
  const [usersTab, setUsersTab] = useState<'add' | 'added'>('add');

  // Add User Form
  const [newCategory, setNewCategory] = useState<'OFFICE' | 'GUARD'>('OFFICE');
  const [newOfficeUnit, setNewOfficeUnit] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');

  // Housing Units State
  const [housingTab, setHousingTab] = useState<'tag' | 'tagged' | 'houses'>('tag');
  const [showAddHouseBox, setShowAddHouseBox] = useState(false);
  const [housingInputText, setHousingInputText] = useState('');
  const [savingHouses, setSavingHouses] = useState(false);
  const [hostSearchQuery, setHostSearchQuery] = useState('');
  const [unitSearchQuery, setUnitSearchQuery] = useState('');
  const [selectedTagHostPhone, setSelectedTagHostPhone] = useState('');
  const [selectedTagUnit, setSelectedTagUnit] = useState('');
  const [hostDropdownOpen, setHostDropdownOpen] = useState(false);
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const [taggingHost, setTaggingHost] = useState(false);
  const hostPickerRef = useRef<HTMLDivElement>(null);
  const unitPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (hostPickerRef.current && !hostPickerRef.current.contains(e.target as Node)) {
        setHostDropdownOpen(false);
      }
      if (unitPickerRef.current && !unitPickerRef.current.contains(e.target as Node)) {
        setUnitDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // AI Security Briefing
  const [briefingText, setBriefingText] = useState('');
  const [briefingLoading, setBriefingLoading] = useState(false);

  const officeInside = visitors.filter((v) => v.zone === 'OFFICE' && v.status === 'APPROVED').length;
  const resInside = visitors.filter((v) => v.zone === 'RESIDENTIAL' && v.status === 'APPROVED').length;
  const pendingCount = visitors.filter((v) => v.status === 'PENDING').length;

  const adminUnits = session?.role === 'admin' && session.allowedUnits ? session.allowedUnits : [];
  const adminPendingCount = visitors.filter(
    (v) => v.status === 'PENDING' && adminUnits.some((u) => isSameUnit(v.destination, u))
  ).length;

  // Consolidate directory entries by phone
  const consolidated: ConsolidatedUser[] = (() => {
    const groupedMap = new Map<string, Omit<ConsolidatedUser, 'category'>>();
    directory.forEach((d) => {
      if (d.zone === 'SUPERADMIN') return;
      const key = `${d.zone === 'ADMIN' ? 'ADMIN_' : 'USER_'}${d.phone}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          primaryId: d.id,
          name: d.name,
          phone: d.phone,
          pin: d.pin,
          pinMustChange: Boolean(d.pinMustChange),
          pinResetRequested: Boolean(d.pinResetRequested),
          officeRec: null,
          resRecs: [],
          guardRec: null,
          adminRec: null,
        });
      }
      const g = groupedMap.get(key)!;
      if (d.pinResetRequested) g.pinResetRequested = true;
      if (d.zone === 'OFFICE') g.officeRec = d;
      else if (d.zone === 'RESIDENTIAL') g.resRecs.push(d);
      else if (d.zone === 'GUARD') g.guardRec = d;
      else if (d.zone === 'ADMIN') g.adminRec = d;
    });

    return Array.from(groupedMap.values()).map((g) => {
      let category: ConsolidatedUser['category'] = 'OFFICE';
      if (g.adminRec) category = 'ADMIN';
      else if (g.guardRec) category = 'GUARD';
      else if ((g.officeRec && g.resRecs.length > 0) || g.resRecs.length > 0) category = 'OFFICE_RES';
      return { ...g, category };
    });
  })();

  const resetRequesters = consolidated.filter((item) => item.pinResetRequested);

  const handleGenerateBriefing = async () => {
    setBriefingLoading(true);
    try {
      const res = await generateSecurityBriefingApi({
        totalLogs: visitors.length,
        officeInside,
        resInside,
        pendingCount,
      });
      setBriefingText(res.text);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Could not generate AI briefing.');
    } finally {
      setBriefingLoading(false);
    }
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const cleanPhone = normalizeIndianMobile(newPhone);
    const officeUnit = newOfficeUnit.trim();
    const pin = String(Math.floor(1000 + Math.random() * 9000));

    if (!name) {
      onShowToast('Enter Full Name.');
      return;
    }
    if (!isValidIndianMobile(cleanPhone)) {
      setPhoneError('Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.');
      onShowToast('Enter a valid 10-digit mobile starting with 6, 7, 8, or 9.');
      return;
    }
    if (newCategory === 'OFFICE' && !officeUnit) {
      onShowToast('Enter the Designation.');
      return;
    }

    const recordsToCreate: Array<Omit<DirectoryEntry, 'id'>> = [];
    if (newCategory === 'GUARD') {
      recordsToCreate.push({
        zone: 'GUARD',
        unit: officeUnit || 'Main Gate',
        name,
        phone: cleanPhone,
        pin,
        pinMustChange: true,
        pinResetRequested: false,
      });
    } else {
      recordsToCreate.push({
        zone: 'OFFICE',
        unit: officeUnit,
        name,
        phone: cleanPhone,
        pin,
        pinMustChange: true,
        pinResetRequested: false,
      });
    }

    await onAddDirectoryEntries(recordsToCreate);
    setNewOfficeUnit('');
    setNewName('');
    setNewPhone('');
    setPhoneError('');
    setOpenSection('users');
    setUsersTab('added');
    onShareCredentials(name, cleanPhone, pin);
  };

  const handleAddHousesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!housingInputText.trim()) {
      onShowToast('Enter at least one housing unit (comma separated).');
      return;
    }
    setSavingHouses(true);
    try {
      const res = await onAddHousingUnits(housingInputText);
      if (res.added.length > 0) {
        onShowToast(
          `Added ${res.added.length} housing ${res.added.length === 1 ? 'unit' : 'units'}.`
        );
        setHousingInputText('');
        setShowAddHouseBox(false);
      } else {
        onShowToast('All entered housing units already exist.');
      }
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Could not add housing units.');
    } finally {
      setSavingHouses(false);
    }
  };

  const taggableHosts = consolidated.filter(
    (u) => u.category === 'OFFICE' || u.category === 'OFFICE_RES'
  );
  const taggedStaff = consolidated.filter((u) => u.resRecs.length > 0);

  const filteredTagHosts = taggableHosts.filter((h) => {
    const q = hostSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return h.name.toLowerCase().includes(q);
  });

  const filteredHousingUnits = housingUnits.filter((unit) => {
    const q = unitSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return unit.toLowerCase().includes(q);
  });

  const selectedTagHost =
    taggableHosts.find((h) => h.phone === selectedTagHostPhone) || null;
  const selectedTagUnitValue =
    housingUnits.find((u) => u === selectedTagUnit) || '';

  const isAlreadyTagged = Boolean(
    selectedTagHost &&
      selectedTagUnitValue &&
      directory.some(
        (d) =>
          d.zone === 'RESIDENTIAL' &&
          normalizeIndianMobile(d.phone) === normalizeIndianMobile(selectedTagHost.phone) &&
          isSameUnit(d.unit, selectedTagUnitValue)
      )
  );

  const handleConfirmTagHost = async () => {
    if (!selectedTagHost || !selectedTagUnitValue) {
      onShowToast('Select both a host and a housing unit.');
      return;
    }
    if (isAlreadyTagged) {
      onShowToast(`${selectedTagHost.name} is already tagged to ${selectedTagUnitValue}.`);
      return;
    }
    setTaggingHost(true);
    try {
      await onTagHostToHousingUnit(selectedTagHost.phone, selectedTagUnitValue);
      setSelectedTagHostPhone('');
      setSelectedTagUnit('');
      setHostSearchQuery('');
      setUnitSearchQuery('');
      setHostDropdownOpen(false);
      setUnitDropdownOpen(false);
    } finally {
      setTaggingHost(false);
    }
  };

  return (
    <section className="space-y-4 w-full">
      {/* Overview Section */}
      <div className="space-y-4">
        {adminUnits.length > 0 && (
          <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-2xl p-4 shadow-md flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-amber-300">My Personal Unit</span>
                {adminPendingCount > 0 && (
                  <span className="text-xs font-bold text-amber-200">
                    · {adminPendingCount} Waiting
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-200 truncate mt-0.5">
                {adminUnits.join(' · ')}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenPersonalHostView}
              className="min-h-[40px] bg-white hover:bg-amber-50 text-slate-900 font-bold text-xs px-3.5 py-2 rounded-xl shadow shrink-0 transition inline-flex items-center gap-1"
            >
              <span>Manage</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Live Campus Headcount + AI Security Briefing */}
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-blue-600 text-white rounded-2xl p-3.5 shadow-md min-w-0 flex flex-col justify-between">
              <p className="text-xs font-bold text-blue-100 leading-tight">Office Inside</p>
              <p className="text-2xl font-extrabold font-mono-tabular mt-1">{officeInside}</p>
              <p className="text-xs text-blue-200 mt-0.5 truncate">Corporate</p>
            </div>
            <div className="bg-emerald-600 text-white rounded-2xl p-3.5 shadow-md min-w-0 flex flex-col justify-between">
              <p className="text-xs font-bold text-emerald-100 leading-tight">Residential</p>
              <p className="text-2xl font-extrabold font-mono-tabular mt-1">{resInside}</p>
              <p className="text-xs text-emerald-200 mt-0.5 truncate">Flats</p>
            </div>
            <button
              type="button"
              onClick={handleGenerateBriefing}
              disabled={briefingLoading}
              className="bg-slate-900 hover:bg-indigo-950 active:scale-95 text-white rounded-2xl p-3.5 shadow-md border border-indigo-500/30 min-w-0 flex flex-col justify-between text-left transition"
            >
              <p className="text-xs font-bold text-amber-300 leading-tight">AI Briefing</p>
              <Sparkles className="w-5 h-5 text-amber-300 mt-1" />
              <p className="text-xs text-indigo-300 mt-0.5 truncate">
                {briefingLoading ? 'Loading...' : 'Tap to view'}
              </p>
            </button>
          </div>

          {(briefingText || briefingLoading) && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-700 leading-relaxed whitespace-pre-line shadow-sm">
              {briefingLoading
                ? 'Analyzing live Office & Residential gate movements...'
                : briefingText}
            </div>
          )}
        </div>

        {/* Live Gate Activity Feed */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 overflow-hidden">
          <button
            type="button"
            onClick={() => setGateFeedOpen((prev) => !prev)}
            className="w-full min-h-[44px] flex items-center justify-between gap-2 text-left"
          >
            <div className="flex items-center gap-2.5">
              <ClipboardList className="w-4 h-4 text-slate-700" />
              <h3 className="font-bold text-slate-900 text-sm">Live Gate Activity</h3>
              <span className="text-xs font-semibold text-slate-500 font-mono-tabular">
                {visitors.length} entries
              </span>
            </div>
            <span className="text-slate-500 p-1">
              {gateFeedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>

          {gateFeedOpen && (
            <div className="max-h-64 overflow-y-auto space-y-2 pr-0.5 mt-3 pt-2.5 border-t border-slate-100">
              {visitors.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  No gate activity recorded yet.
                </p>
              ) : (
                visitors.slice(0, 15).map((v) => (
                  <div
                    key={v.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 truncate">{v.visitorName}</p>
                      <p className="text-slate-500 truncate">{v.destination}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-700 shrink-0">
                      {v.status.replace('_', ' ')}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Management Section: Users, Housing Units, PIN Reset Requests */}
      <div className="space-y-3">
        {/* 1. Users Toggle */}
        <button
          type="button"
          onClick={() => setOpenSection((prev) => (prev === 'users' ? 'none' : 'users'))}
          className="w-full min-h-[52px] bg-white hover:bg-slate-50 text-slate-900 font-bold text-sm py-3.5 px-4 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between transition"
        >
          <span className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-blue-600" />
            <span>Users</span>
            <span className="text-xs font-semibold text-slate-500 font-mono-tabular">
              {consolidated.length}
            </span>
          </span>
          {openSection === 'users' ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {openSection === 'users' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
            {/* 2 Tabs: Add User | Added Users */}
            <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setUsersTab('add')}
                className={`min-h-[40px] px-2 py-2 rounded-lg text-xs font-bold transition ${
                  usersTab === 'add'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Add User
              </button>
              <button
                type="button"
                onClick={() => setUsersTab('added')}
                className={`min-h-[40px] px-2 py-2 rounded-lg text-xs font-bold transition ${
                  usersTab === 'added'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Added Users ({consolidated.length})
              </button>
            </div>

            {usersTab === 'add' && (
              <form onSubmit={handleAddUserSubmit} className="space-y-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Register Office Staff or Guard
                  </h3>
                  <p className="text-xs text-slate-500">
                    Auto-generates a 4-digit PIN & prepares WhatsApp share
                  </p>
                </div>

                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 space-y-2.5">
                  <div
                    role="radiogroup"
                    aria-label="Staff Category"
                    className="grid grid-cols-2 gap-2"
                  >
                    {[
                      { value: 'OFFICE' as const, label: 'Office Staff' },
                      { value: 'GUARD' as const, label: 'Security Guard' },
                    ].map((opt) => {
                      const selected = newCategory === opt.value;
                      return (
                        <label
                          key={opt.value}
                          className={`min-h-[44px] flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition ${
                            selected
                              ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-sm'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="staffCategory"
                            value={opt.value}
                            checked={selected}
                            onChange={() => setNewCategory(opt.value)}
                            className="w-4 h-4 accent-blue-600 shrink-0"
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(formatTitleCaseValue(e.target.value))}
                    placeholder="Full Name *"
                    className="w-full min-h-[44px] bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  <input
                    type="text"
                    value={newOfficeUnit}
                    onChange={(e) => setNewOfficeUnit(formatTitleCaseValue(e.target.value))}
                    placeholder="Designation"
                    className="w-full min-h-[44px] bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  <div className="space-y-1">
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={newPhone}
                      onChange={(e) => {
                        const cleaned = normalizeIndianMobile(e.target.value);
                        if (cleaned.length > 0 && !/^[6-9]/.test(cleaned)) {
                          setPhoneError('Mobile number must start with 6, 7, 8, or 9.');
                          return;
                        }
                        setNewPhone(displayIndianMobile(cleaned));
                        if (cleaned.length === 10 || cleaned.length === 0) {
                          setPhoneError('');
                        } else if (phoneError) {
                          setPhoneError('');
                        }
                      }}
                      onBlur={() => {
                        const cleaned = normalizeIndianMobile(newPhone);
                        if (cleaned.length > 0 && !isValidIndianMobile(cleaned)) {
                          setPhoneError('Enter 10 digits starting with 6, 7, 8, or 9.');
                        }
                      }}
                      placeholder="Mobile *"
                      aria-invalid={Boolean(phoneError)}
                      className={`w-full min-h-[44px] bg-white border rounded-xl px-3.5 py-2.5 text-sm font-semibold font-mono-tabular placeholder:font-sans placeholder:font-normal focus:outline-none focus:ring-2 ${
                        phoneError
                          ? 'border-rose-400 focus:ring-rose-500'
                          : 'border-slate-200 focus:ring-blue-500'
                      }`}
                    />
                    {phoneError && (
                      <p className="text-[11px] font-semibold text-rose-600 px-1">
                        {phoneError}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full min-h-[46px] bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-3 px-4 rounded-xl shadow-sm transition"
                  >
                    Register User
                  </button>
                </div>
              </form>
            )}

            {usersTab === 'added' && (
              <div className="max-h-[28rem] overflow-y-auto space-y-3 pr-0.5">
                {consolidated.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6 bg-slate-50 rounded-2xl border border-slate-200/70">
                    No users found.
                  </p>
                ) : (
                  consolidated.map((item) => {
                    const canDelete =
                      item.category !== 'ADMIN' || session?.role === 'superadmin';
                    const categoryLabelMap: Record<ConsolidatedUser['category'], { label: string; cls: string }> = {
                      ADMIN: { label: 'Campus Admin', cls: 'text-indigo-700' },
                      GUARD: { label: 'Security Guard', cls: 'text-amber-800' },
                      OFFICE_RES: { label: 'Office with Residence', cls: 'text-emerald-700' },
                      OFFICE: { label: 'Office Staff', cls: 'text-blue-700' },
                    };
                    const cat = categoryLabelMap[item.category];
                    const officeLine =
                      item.adminRec?.unit || item.guardRec?.unit || item.officeRec?.unit || '';
                    const flatLine = item.resRecs.map((r) => r.unit).join(', ');
                    const primaryEntry =
                      item.officeRec || item.resRecs[0] || item.guardRec || item.adminRec;

                    return (
                      <div
                        key={`${item.category}_${item.phone}`}
                        className={`rounded-2xl px-4 py-3.5 border space-y-2.5 ${
                          item.pinResetRequested
                            ? 'bg-amber-50/70 border-amber-300'
                            : 'bg-slate-50/90 border-slate-200/80'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {item.name}
                            </p>
                            <span className={`text-xs font-semibold shrink-0 ${cat.cls}`}>
                              {cat.label}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                            {officeLine && <span>{officeLine}</span>}
                            {officeLine && <span className="text-slate-300">•</span>}
                            <span className="font-mono-tabular">
                              {displayIndianMobile(item.phone)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
                          <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            {flatLine && (
                              <span className="font-semibold text-emerald-800 inline-flex items-center gap-1.5">
                                <Home className="w-3.5 h-3.5 shrink-0" />
                                <span>{flatLine}</span>
                              </span>
                            )}
                            {item.pinMustChange && (
                              <span className="font-mono-tabular font-semibold text-amber-700">
                                Temp PIN: {item.pin}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-auto shrink-0">
                            {primaryEntry && (
                              <button
                                type="button"
                                onClick={() => onResetUserPin(primaryEntry)}
                                className="min-h-[34px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                <span>Reset PIN</span>
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() =>
                                  onRequestConfirm({
                                    title: 'Delete User',
                                    message: `Delete ${item.name} (${displayIndianMobile(item.phone)}) from the campus directory?`,
                                    onConfirm: () =>
                                      item.category === 'ADMIN'
                                        ? onDeleteDirectoryEntry(item.primaryId)
                                        : onDeleteEmployeeByPhone(item.phone),
                                  })
                                }
                                className="min-h-[34px] px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition inline-flex items-center gap-1.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. Housing Units Toggle */}
        <button
          type="button"
          onClick={() => setOpenSection((prev) => (prev === 'housing' ? 'none' : 'housing'))}
          className="w-full min-h-[52px] bg-white hover:bg-slate-50 text-slate-900 font-bold text-sm py-3.5 px-4 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between transition"
        >
          <span className="flex items-center gap-2.5">
            <Building className="w-4 h-4 text-emerald-700" />
            <span>Housing Units</span>
            <span className="text-xs font-semibold text-slate-500 font-mono-tabular">
              {housingUnits.length}
            </span>
          </span>
          {openSection === 'housing' ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {openSection === 'housing' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500">
                Manage campus flats & tag them against hosts
              </p>
              <button
                type="button"
                onClick={() => setShowAddHouseBox((prev) => !prev)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add House</span>
              </button>
            </div>

            {showAddHouseBox && (
              <form
                onSubmit={handleAddHousesSubmit}
                className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 space-y-2.5"
              >
                <textarea
                  rows={3}
                  value={housingInputText}
                  onChange={(e) => setHousingInputText(e.target.value)}
                  placeholder="Enter housing units separated by commas (e.g., Flat A-101, Flat A-102, Flat B-201, Villa 04)"
                  aria-label="Comma separated housing units"
                  className="w-full bg-white border border-emerald-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={savingHouses}
                    className="flex-1 min-h-[42px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs py-2.5 px-3 rounded-xl transition"
                  >
                    {savingHouses ? 'Saving...' : 'Save Housing Units'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddHouseBox(false);
                      setHousingInputText('');
                    }}
                    className="min-h-[42px] px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="pt-2 border-t border-slate-100 space-y-3">
              {/* 3 Tabs: Tag Hosts | Tagged Staff | Added Houses */}
              <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setHousingTab('tag')}
                  className={`min-h-[40px] px-2 py-2 rounded-lg text-xs font-bold transition ${
                    housingTab === 'tag'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tag Staff
                </button>
                <button
                  type="button"
                  onClick={() => setHousingTab('tagged')}
                  className={`min-h-[40px] px-2 py-2 rounded-lg text-xs font-bold transition ${
                    housingTab === 'tagged'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tagged Staff ({taggedStaff.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHousingTab('houses')}
                  className={`min-h-[40px] px-2 py-2 rounded-lg text-xs font-bold transition ${
                    housingTab === 'houses'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Added Houses ({housingUnits.length})
                </button>
              </div>

              {housingTab === 'tag' && (
                <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* First Searchable Bar: Search Host Name */}
                    <div ref={hostPickerRef} className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={hostSearchQuery}
                        onFocus={() => setHostDropdownOpen(true)}
                        onChange={(e) => {
                          setHostSearchQuery(e.target.value);
                          setSelectedTagHostPhone('');
                          setHostDropdownOpen(true);
                        }}
                        placeholder="Search host name..."
                        aria-label="Search host name"
                        className="w-full min-h-[44px] bg-white border border-slate-200 rounded-xl pl-8 pr-8 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      {hostSearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setHostSearchQuery('');
                            setSelectedTagHostPhone('');
                            setHostDropdownOpen(true);
                          }}
                          aria-label="Clear host search"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {hostDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y divide-slate-100">
                          {filteredTagHosts.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-3">
                              No matching hosts found.
                            </p>
                          ) : (
                            filteredTagHosts.map((h) => {
                              const isSelected = selectedTagHostPhone === h.phone;
                              const currentFlats = h.resRecs.map((r) => r.unit).join(', ');
                              return (
                                <button
                                  key={h.phone}
                                  type="button"
                                  onClick={() => {
                                    setSelectedTagHostPhone(h.phone);
                                    setHostSearchQuery(h.name);
                                    setHostDropdownOpen(false);
                                  }}
                                  className={`w-full min-h-[44px] text-left px-3 py-2.5 flex items-center justify-between gap-2 transition ${
                                    isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-900 truncate">
                                      {h.name}
                                    </p>
                                    <p className="text-[11px] text-slate-500 truncate">
                                      {h.officeRec?.unit || displayIndianMobile(h.phone)}
                                      {currentFlats ? ` · ${currentFlats}` : ''}
                                    </p>
                                  </div>
                                  {isSelected && (
                                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>

                    {/* Second Searchable Box: Search Created Housing Units */}
                    <div ref={unitPickerRef} className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={unitSearchQuery}
                        onFocus={() => setUnitDropdownOpen(true)}
                        onChange={(e) => {
                          setUnitSearchQuery(e.target.value);
                          setSelectedTagUnit('');
                          setUnitDropdownOpen(true);
                        }}
                        placeholder="Search housing units..."
                        aria-label="Search created housing units"
                        className="w-full min-h-[44px] bg-white border border-slate-200 rounded-xl pl-8 pr-8 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      {unitSearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setUnitSearchQuery('');
                            setSelectedTagUnit('');
                            setUnitDropdownOpen(true);
                          }}
                          aria-label="Clear housing unit search"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {unitDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y divide-slate-100">
                          {filteredHousingUnits.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-3">
                              {housingUnits.length === 0
                                ? 'No housing units created yet.'
                                : 'No matching housing units.'}
                            </p>
                          ) : (
                            filteredHousingUnits.map((unit) => {
                              const isSelected = selectedTagUnit === unit;
                              const assignedEntries = directory.filter(
                                (d) => d.zone === 'RESIDENTIAL' && isSameUnit(d.unit, unit)
                              );
                              return (
                                <button
                                  key={unit}
                                  type="button"
                                  onClick={() => {
                                    setSelectedTagUnit(unit);
                                    setUnitSearchQuery(unit);
                                    setUnitDropdownOpen(false);
                                  }}
                                  className={`w-full min-h-[44px] text-left px-3 py-2 flex items-center justify-between gap-2 transition ${
                                    isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-900 flex items-center gap-1 truncate">
                                      <Home className="w-3 h-3 text-emerald-700 shrink-0" />
                                      <span className="truncate">{unit}</span>
                                    </p>
                                    <p
                                      className={`text-[11px] truncate ${
                                        assignedEntries.length > 0
                                          ? 'text-emerald-700 font-semibold'
                                          : 'text-slate-400'
                                      }`}
                                    >
                                      {assignedEntries.length > 0
                                        ? `Tagged: ${assignedEntries.map((a) => a.name).join(', ')}`
                                        : 'Unassigned'}
                                    </p>
                                  </div>
                                  {isSelected && (
                                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!selectedTagHost || !selectedTagUnitValue || isAlreadyTagged || taggingHost}
                    onClick={handleConfirmTagHost}
                    className="w-full min-h-[44px] bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition"
                  >
                    {taggingHost
                      ? 'Tagging...'
                      : !selectedTagHost || !selectedTagUnitValue
                        ? 'Select a Host & a Housing Unit to Tag'
                        : isAlreadyTagged
                          ? `${selectedTagHost.name} already tagged to ${selectedTagUnitValue}`
                          : `Tag ${selectedTagHost.name} → ${selectedTagUnitValue}`}
                  </button>
                </div>
              )}

              {housingTab === 'tagged' && (
                <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
                  {taggedStaff.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6 bg-slate-50 rounded-2xl border border-slate-200/70">
                      No staff tagged to housing units yet.
                    </p>
                  ) : (
                    taggedStaff.map((staff) => (
                      <div
                        key={staff.phone}
                        className="rounded-xl px-3 py-2.5 bg-slate-50/90 border border-slate-200/80 space-y-1"
                      >
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {staff.name}{' '}
                          <span className="font-normal text-[11px] text-slate-500">
                            · {staff.officeRec?.unit || 'Office Staff'} ·{' '}
                            <span className="font-mono-tabular">
                              {displayIndianMobile(staff.phone)}
                            </span>
                          </span>
                        </p>
                        {staff.resRecs.map((resEntry) => (
                          <div
                            key={resEntry.id}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="text-xs font-bold text-emerald-800 flex items-center gap-1 truncate">
                              <Home className="w-3 h-3 shrink-0" />
                              <span className="truncate">{resEntry.unit}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onRequestConfirm({
                                  title: 'Untag Housing Unit',
                                  message: `Remove ${resEntry.unit} from ${staff.name}?`,
                                  confirmLabel: 'Untag',
                                  onConfirm: () => onDeleteDirectoryEntry(resEntry.id),
                                })
                              }
                              className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold shrink-0 transition"
                            >
                              Untag
                            </button>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              )}

              {housingTab === 'houses' && (
                <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
                  {housingUnits.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6 bg-slate-50 rounded-2xl border border-slate-200/70">
                      No houses added yet. Tap Add House above.
                    </p>
                  ) : (
                    housingUnits.map((unit) => {
                      const assignedEntries = directory.filter(
                        (d) => d.zone === 'RESIDENTIAL' && isSameUnit(d.unit, unit)
                      );
                      return (
                        <div
                          key={unit}
                          className="rounded-2xl p-3 bg-slate-50/90 border border-slate-200/80 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5 truncate">
                              <Home className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <span className="truncate">{unit}</span>
                            </p>
                            <p
                              className={`text-[11px] truncate mt-0.5 ${
                                assignedEntries.length > 0
                                  ? 'text-emerald-700 font-semibold'
                                  : 'text-slate-400'
                              }`}
                            >
                              {assignedEntries.length > 0
                                ? `Tagged: ${assignedEntries.map((a) => a.name).join(', ')}`
                                : 'Unassigned'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onRequestConfirm({
                                title: 'Remove Housing Unit',
                                message: `Remove ${unit} from Added Houses?`,
                                onConfirm: () => {
                                  if (selectedTagUnit === unit) {
                                    setSelectedTagUnit('');
                                    setUnitSearchQuery('');
                                  }
                                  return onDeleteHousingUnit(unit);
                                },
                              })
                            }
                            aria-label={`Remove ${unit}`}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 shrink-0 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}


        {/* 3. PIN Reset Requests Toggle */}
        <button
          type="button"
          onClick={() => setOpenSection((prev) => (prev === 'resets' ? 'none' : 'resets'))}
          className={`w-full min-h-[52px] font-bold text-sm py-3.5 px-4 rounded-2xl shadow-sm border flex items-center justify-between transition ${
            resetRequesters.length > 0
              ? 'bg-amber-100/90 hover:bg-amber-100 text-slate-900 border-amber-300'
              : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200/80'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <RotateCcw className="w-4 h-4 text-amber-700" />
            <span>PIN Reset Requests</span>
            <span className="text-xs font-bold font-mono-tabular text-slate-700">
              ({resetRequesters.length})
            </span>
          </span>
          {openSection === 'resets' ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {openSection === 'resets' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200/80 space-y-2.5">
            {resetRequesters.length === 0 ? (
              <p className="text-center py-4 text-xs text-slate-400">
                No pending PIN reset requests.
              </p>
            ) : (
              resetRequesters.map((item) => {
                const primaryEntry =
                  item.officeRec || item.resRecs[0] || item.guardRec || item.adminRec;
                return (
                  <div
                    key={item.phone}
                    className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-100 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-slate-900 truncate">{item.name}</span>
                      <span className="text-xs font-semibold font-mono-tabular text-slate-500 shrink-0">
                        {displayIndianMobile(item.phone)}
                      </span>
                    </div>
                    {primaryEntry && (
                      <button
                        type="button"
                        onClick={() => onResetUserPin(primaryEntry)}
                        className="w-full min-h-[42px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition"
                      >
                        Reset PIN & Share
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </section>
  );
};
