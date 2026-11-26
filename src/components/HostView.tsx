import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CheckCircle2,
  Copy,
  Download,
  History,
  Maximize2,
  QrCode,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Sun,
  Trash2,
  Users,
  Volume2,
  XCircle,
} from 'lucide-react';
import type {
  ConfirmDialogConfig,
  DirectoryEntry,
  UserSession,
  VisitorRecord,
  VisitorStatus,
} from '../types/swagat';
import {
  buildCategoryOptions,
  canHostViewVisitor,
  displayIndianMobile,
  formatTime,
  formatTitleCaseValue,
  isPrimaryHostOfFlat,
  isSameUnit,
  isValidIndianMobile,
  normalizeIndianMobile,
  playGateDoorbellChime,
  resolveHostDestinationForCategory,
  unlockSharedAudioContext,
} from '../utils/formatters';
import { draftAiInviteApi } from '../services/api';
import {
  copyQrPassImage,
  generateMobileQrPassCard,
  openWhatsAppChatLink,
  shareQrPassImage,
  type GeneratedQrPassCard,
} from '../utils/qrPassCard';
import { QrPassShareModal } from './Modals';

interface HostViewProps {
  session: UserSession | null;
  visitors: VisitorRecord[];
  directory: DirectoryEntry[];
  logoDataUrl?: string;
  designStudioMode: boolean;
  hostAlertsEnabled: boolean;
  onEnableHostAlerts: () => Promise<void>;
  onRefreshVisitors: () => Promise<void>;
  onCreateVisitor: (record: Omit<VisitorRecord, 'id'>) => Promise<void>;
  onUpdateVisitorStatus: (id: string, status: VisitorStatus) => Promise<void>;
  onAddFamilyMember: (entry: Omit<DirectoryEntry, 'id'>) => Promise<void>;
  onDeleteDirectoryEntry: (id: string) => Promise<void>;
  onShareCredentials: (name: string, phone: string, pin: string) => void;
  onResetUserPin: (entry: DirectoryEntry) => Promise<void>;
  onRequestConfirm: (cfg: ConfirmDialogConfig) => void;
  onShowToast: (msg: string) => void;
}

export const HostView: React.FC<HostViewProps> = ({
  session,
  visitors,
  directory,
  logoDataUrl,
  designStudioMode,
  hostAlertsEnabled,
  onEnableHostAlerts,
  onRefreshVisitors,
  onCreateVisitor,
  onUpdateVisitorStatus,
  onAddFamilyMember,
  onDeleteDirectoryEntry,
  onShareCredentials,
  onResetUserPin,
  onRequestConfirm,
  onShowToast,
}) => {
  const [subView, setSubView] = useState<'main' | 'history' | 'family'>('main');
  const [wakeLockWanted, setWakeLockWanted] = useState(
    () => localStorage.getItem('swagat_host_wakelock_v1') === '1'
  );

  // Pre-approve form state
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestType, setGuestType] = useState('Personal Guest');
  const [guestNote, setGuestNote] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [lastGuestName, setLastGuestName] = useState('');
  const [lastGuestPhone, setLastGuestPhone] = useState('');
  const [inviteText, setInviteText] = useState('');
  const [draftingInvite, setDraftingInvite] = useState(false);
  const [qrPassCard, setQrPassCard] = useState<GeneratedQrPassCard | null>(null);
  const [generatingQrCard, setGeneratingQrCard] = useState(false);
  const [sharingQr, setSharingQr] = useState(false);
  const [passModalPayload, setPassModalPayload] = useState<{
    card: GeneratedQrPassCard;
    visitorName: string;
    phone?: string;
    inviteText: string;
  } | null>(null);
  const [loadingHistoryPassId, setLoadingHistoryPassId] = useState<string | null>(null);

  // Family form state
  const [familyName, setFamilyName] = useState('');
  const [familyPhone, setFamilyPhone] = useState('');
  const [familyPin, setFamilyPin] = useState('');

  // WakeLock effect
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    const syncLock = async () => {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
      };
      if (wakeLockWanted && nav.wakeLock && document.visibilityState === 'visible') {
        try {
          sentinel = await nav.wakeLock.request('screen');
        } catch {
          // Ignore wake lock rejection
        }
      }
    };
    syncLock();
    return () => {
      if (sentinel) {
        sentinel.release().catch(() => {});
      }
    };
  }, [wakeLockWanted]);

  const toggleWakeLock = () => {
    const next = !wakeLockWanted;
    setWakeLockWanted(next);
    try {
      localStorage.setItem('swagat_host_wakelock_v1', next ? '1' : '0');
    } catch {
      // ignore
    }
    onShowToast(
      next
        ? 'Screen Wake-Lock ON — phone stays ready for gate rings.'
        : 'Screen Wake-Lock OFF.'
    );
  };

  const hasHouseAccess = (() => {
    if (designStudioMode && (!session || !session.allowedUnits?.length)) return true;
    return Boolean(
      session?.allowedUnits?.some(
        (u) =>
          u.toLowerCase().startsWith('flat') ||
          directory.some((d) => d.zone === 'RESIDENTIAL' && isSameUnit(d.unit, u))
      )
    );
  })();

  const categoryOptions = buildCategoryOptions(hasHouseAccess);

  const unitVisitors = visitors.filter((v) =>
    canHostViewVisitor(v, session, directory, designStudioMode)
  );
  const pendingVisitors = unitVisitors.filter((v) => v.status === 'PENDING');
  const historyVisitors = unitVisitors.filter((v) => v.status !== 'PENDING');

  const activeResidentialUnit = (() => {
    const resUnit = session?.allowedUnits?.find(
      (u) =>
        u.toLowerCase().startsWith('flat') ||
        directory.some((d) => d.zone === 'RESIDENTIAL' && isSameUnit(d.unit, u))
    );
    if (resUnit) {
      const idx = resUnit.indexOf(' - ');
      return idx !== -1 ? resUnit.slice(0, idx).trim() : resUnit.trim();
    }
    if (designStudioMode) {
      return directory.find((d) => d.zone === 'RESIDENTIAL')?.unit || '';
    }
    return '';
  })();

  const flatMembers = activeResidentialUnit
    ? directory.filter(
        (d) =>
          d.zone === 'RESIDENTIAL' &&
          d.unit.toLowerCase() === activeResidentialUnit.toLowerCase()
      )
    : [];

  const viewerIsPrimary = (() => {
    if (!activeResidentialUnit) return false;
    if (designStudioMode && !session) return true;
    if (!session) return false;
    const me = flatMembers.find(
      (m) => normalizeIndianMobile(m.phone) === normalizeIndianMobile(session.phone)
    );
    return isPrimaryHostOfFlat(me, flatMembers, directory);
  })();

  const handleGeneratePass = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = guestName.trim();
    const cleanPhone = normalizeIndianMobile(guestPhone);
    if (!name) {
      onShowToast("Please enter the guest's name.");
      return;
    }
    if (guestPhone.trim() && !isValidIndianMobile(cleanPhone)) {
      onShowToast('Enter a valid 10-digit mobile starting with 6, 7, 8, or 9.');
      return;
    }

    const destination = resolveHostDestinationForCategory(
      guestType,
      session,
      directory,
      designStudioMode
    );
    const isRes =
      destination.toLowerCase().startsWith('flat') ||
      directory.some((d) => d.zone === 'RESIDENTIAL' && isSameUnit(d.unit, destination));
    const zone = isRes ? 'RESIDENTIAL' : 'OFFICE';
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const now = Date.now();
    const timeLabel = formatTime(now);

    await onCreateVisitor({
      visitorName: name,
      visitorPhone: cleanPhone ? displayIndianMobile(cleanPhone) : 'Pre-Approved',
      visitorType: guestType,
      zone,
      destination,
      hostPhone: session?.phone || '',
      vehicleNumber: '',
      passCode: otp,
      status: 'PRE_APPROVED',
      createdAt: now,
      timeLabel,
    });

    const targetPhone = isValidIndianMobile(cleanPhone) ? cleanPhone : '';
    const defaultInvite = `Namaste ${name}! Your gate pass for ${destination} at SPM NIWAS is ready. Show OTP *${otp}* or the attached QR Pass at the Main Gate for instant entry.`;

    setGeneratedOtp(otp);
    setLastGuestName(name);
    setLastGuestPhone(targetPhone);
    setInviteText(defaultInvite);
    setGuestPhone('');

    setGeneratingQrCard(true);
    setQrPassCard(null);
    try {
      const card = await generateMobileQrPassCard({
        guestName: name,
        guestType,
        destination,
        hostName: session?.name,
        zone,
        otp,
        timeLabel,
        note: guestNote.trim(),
        logoDataUrl,
      });
      setQrPassCard(card);
      const shareResult = await shareQrPassImage(card, defaultInvite);
      if (shareResult === 'shared') {
        onShowToast(`Pass ${otp} generated — QR photo ready in WhatsApp!`);
      } else if (shareResult === 'cancelled') {
        onShowToast(`Pass ${otp} generated for ${name}.`);
      } else {
        openWhatsAppChatLink(targetPhone, defaultInvite);
        onShowToast(
          shareResult === 'copied_and_downloaded'
            ? `Pass ${otp} ready — QR photo copied & downloaded. Paste/attach in WhatsApp!`
            : `Pass ${otp} ready — QR photo downloaded. Attach it in WhatsApp!`
        );
      }
    } catch {
      onShowToast('Could not render mobile QR pass image.');
    } finally {
      setGeneratingQrCard(false);
    }
  };

  const handleShareGeneratedQr = async () => {
    if (!qrPassCard) return;
    setSharingQr(true);
    try {
      const result = await shareQrPassImage(qrPassCard, inviteText.trim());
      if (result === 'shared') {
        onShowToast('QR Pass image shared!');
      } else if (result === 'copied_and_downloaded') {
        onShowToast('QR Pass downloaded & copied — attach or paste into WhatsApp!');
      } else if (result === 'downloaded') {
        onShowToast('QR Pass PNG downloaded — attach in WhatsApp!');
      }
    } finally {
      setSharingQr(false);
    }
  };

  const handleCopyGeneratedQrImage = async () => {
    if (!qrPassCard) return;
    const ok = await copyQrPassImage(qrPassCard);
    onShowToast(
      ok
        ? 'QR Pass image copied! Paste it directly in WhatsApp.'
        : 'Clipboard image copy unavailable here — use Download PNG.'
    );
  };

  const handleOpenHistoryQrPass = async (v: VisitorRecord, message: string) => {
    setLoadingHistoryPassId(v.id);
    try {
      const card = await generateMobileQrPassCard({
        guestName: v.visitorName,
        guestType: v.visitorType,
        destination: v.destination,
        hostName: session?.name,
        zone: v.zone,
        otp: v.passCode || '0000',
        timeLabel: v.timeLabel,
        vehicleNumber: v.vehicleNumber,
        logoDataUrl,
      });
      const cleanHistPhone = normalizeIndianMobile(v.visitorPhone);
      setPassModalPayload({
        card,
        visitorName: v.visitorName,
        phone: isValidIndianMobile(cleanHistPhone) ? cleanHistPhone : undefined,
        inviteText: message,
      });
    } catch {
      onShowToast('Could not generate QR pass image.');
    } finally {
      setLoadingHistoryPassId(null);
    }
  };

  const handleDraftAiInvite = async () => {
    setDraftingInvite(true);
    const destination = resolveHostDestinationForCategory(
      guestType,
      session,
      directory,
      designStudioMode
    );
    try {
      const res = await draftAiInviteApi({
        guestName: guestName.trim() || lastGuestName || 'Guest',
        destination,
        otp: generatedOtp || '0000',
        note: guestNote.trim(),
      });
      if (res.text) {
        setInviteText(res.text);
        onShowToast('Gemini drafted your invite!');
      }
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Could not draft invite with AI.');
    } finally {
      setDraftingInvite(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteText.trim()) return;
    try {
      await navigator.clipboard.writeText(inviteText);
      onShowToast('Invite message copied!');
    } catch {
      onShowToast('Copy failed — please copy manually.');
    }
  };

  const handleAddFamilySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeResidentialUnit || !viewerIsPrimary) return;
    const name = familyName.trim();
    const cleanPhone = normalizeIndianMobile(familyPhone);
    const pin = familyPin.trim().length === 4 ? familyPin.trim() : String(Math.floor(1000 + Math.random() * 9000));

    if (!name || name.length < 2 || !/^[A-Za-z][A-Za-z\s.'-]{1,49}$/.test(name)) {
      onShowToast('Enter a valid Name (letters only, at least 2 characters).');
      return;
    }
    if (!isValidIndianMobile(cleanPhone)) {
      onShowToast('Enter a valid 10-digit mobile starting with 6–9.');
      return;
    }
    if (flatMembers.some((m) => normalizeIndianMobile(m.phone) === cleanPhone)) {
      onShowToast(`This mobile number is already registered for ${activeResidentialUnit}`);
      return;
    }

    await onAddFamilyMember({
      zone: 'RESIDENTIAL',
      unit: activeResidentialUnit,
      name,
      phone: cleanPhone,
      pin,
      isFamilyMember: true,
      pinMustChange: true,
      pinResetRequested: false,
    });
    setFamilyName('');
    setFamilyPhone('');
    setFamilyPin('');
    onShareCredentials(name, cleanPhone, pin);
  };

  if (subView === 'history') {
    return (
      <section className="space-y-3.5 max-w-2xl mx-auto w-full">
        <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-200/80 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSubView('main')}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Host Portal</span>
          </button>
          <span className="text-xs font-bold font-mono-tabular text-slate-500">
            {historyVisitors.length} {historyVisitors.length === 1 ? 'visit' : 'visits'}
          </span>
        </div>

        <div className="space-y-2">
          {historyVisitors.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 border border-slate-200">
              No recent visitor history.
            </div>
          ) : (
            historyVisitors.map((v) => {
              const cleanHistPhone = normalizeIndianMobile(v.visitorPhone);
              const histMsg =
                v.status === 'PRE_APPROVED'
                  ? `Namaste ${v.visitorName}! Your gate pass for ${v.destination} at SPM NIWAS is ready. Show OTP *${v.passCode}* at the Main Gate for instant entry.`
                  : `Namaste ${v.visitorName}! Welcome to ${v.destination} at SPM NIWAS. Your gate entry has been approved.`;
              const histWaUrl = isValidIndianMobile(cleanHistPhone)
                ? `https://wa.me/91${cleanHistPhone}?text=${encodeURIComponent(histMsg)}`
                : `https://wa.me/?text=${encodeURIComponent(histMsg)}`;
              return (
                <div
                  key={v.id}
                  className="bg-white rounded-xl p-3.5 border border-slate-200/80 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800 break-words">
                        {v.visitorName}{' '}
                        <span className="font-normal text-slate-400">({v.visitorType})</span>
                      </p>
                      <p className="text-slate-500 break-words mt-0.5">
                        {v.destination} · <span className="font-mono-tabular">{v.timeLabel}</span>
                      </p>
                    </div>
                    <span className="font-bold text-[11px] text-slate-700 shrink-0">
                      {v.status.replace('_', ' ')}
                    </span>
                  </div>
                  {(v.status === 'PRE_APPROVED' || v.status === 'APPROVED') && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={loadingHistoryPassId === v.id}
                        onClick={() => handleOpenHistoryQrPass(v, histMsg)}
                        className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold transition"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>
                          {loadingHistoryPassId === v.id ? 'Creating...' : 'QR Pass Image'}
                        </span>
                      </button>
                      <a
                        href={histWaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold transition"
                      >
                        <Send className="w-3 h-3" />
                        <span>Welcome on WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <QrPassShareModal
          payload={passModalPayload}
          onClose={() => setPassModalPayload(null)}
          onShowToast={onShowToast}
        />
      </section>
    );
  }

  if (subView === 'family') {
    return (
      <section className="space-y-3.5 max-w-2xl mx-auto w-full">
        <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-200/80 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSubView('main')}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Host Portal</span>
          </button>
          <span className="text-xs font-bold text-emerald-700">{activeResidentialUnit}</span>
        </div>

        {viewerIsPrimary ? (
          <form
            onSubmit={handleAddFamilySubmit}
            className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3"
          >
            <div>
              <h3 className="text-base font-bold text-slate-900">Add Family Member</h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                They sign in with their own mobile & PIN and receive simultaneous Main Gate alerts for{' '}
                {activeResidentialUnit}.
              </p>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(formatTitleCaseValue(e.target.value))}
                placeholder="Name"
                aria-label="Family Member Name"
                className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
              <input
                type="tel"
                inputMode="numeric"
                maxLength={16}
                value={familyPhone}
                onChange={(e) => {
                  const cleaned = normalizeIndianMobile(e.target.value);
                  if (cleaned.length > 0 && !/^[6-9]/.test(cleaned)) {
                    setFamilyPhone('');
                    return;
                  }
                  setFamilyPhone(displayIndianMobile(cleaned));
                }}
                placeholder="Mobile"
                aria-label="Family Member Mobile"
                className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold font-mono-tabular placeholder:font-sans placeholder:font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
              <div className="flex items-center gap-2">
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={4}
                  value={familyPin}
                  onChange={(e) => setFamilyPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="4-Digit PIN"
                  aria-label="4-Digit PIN"
                  className="flex-1 min-w-0 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-center font-bold font-mono-tabular tracking-widest placeholder:font-sans placeholder:font-medium placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setFamilyPin(String(Math.floor(1000 + Math.random() * 9000)))}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-700 shrink-0 transition"
                >
                  Random
                </button>
              </div>
              <button
                type="submit"
                className="w-full min-h-[46px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-3 rounded-xl shadow-md shadow-indigo-600/20 transition"
              >
                Add Family Member
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-4 text-xs text-indigo-950 font-medium leading-relaxed">
            Only the <strong>Primary Host</strong> of {activeResidentialUnit} can add or remove family members.
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-500 px-1">
            Authorised members of {activeResidentialUnit}
          </h4>
          {flatMembers.map((m) => {
            const isSelf =
              session && normalizeIndianMobile(m.phone) === normalizeIndianMobile(session.phone);
            const isPrimary = isPrimaryHostOfFlat(m, flatMembers, directory);
            const canDelete = viewerIsPrimary && !isPrimary && !isSelf && flatMembers.length > 1;
            return (
              <div
                key={m.id}
                className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2.5"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-bold text-slate-900 break-words">{m.name}</p>
                    <span className="text-xs font-semibold text-slate-600">
                      {isPrimary ? 'Primary Host' : 'Family Member'}
                      {isSelf ? ' · You' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 font-mono-tabular">
                    {displayIndianMobile(m.phone)} ·{' '}
                    <span className={m.pinMustChange ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>
                      {m.pinMustChange ? `Temp PIN: ${m.pin}` : 'Private PIN Set'}
                    </span>
                  </p>
                </div>

                {viewerIsPrimary && (
                  <div className={`grid ${canDelete ? 'grid-cols-2' : 'grid-cols-1'} gap-2 pt-2 border-t border-slate-100`}>
                    <button
                      type="button"
                      onClick={() => onResetUserPin(m)}
                      className="min-h-[40px] py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition"
                    >
                      Share New PIN
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() =>
                          onRequestConfirm({
                            title: 'Delete Family Member',
                            message: `Remove ${m.name} from ${m.unit}? They will lose gate alert and login access.`,
                            onConfirm: () => onDeleteDirectoryEntry(m.id),
                          })
                        }
                        className="min-h-[40px] py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition inline-flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const waGuestUrl = lastGuestPhone
    ? `https://wa.me/91${lastGuestPhone}?text=${encodeURIComponent(inviteText.trim())}`
    : `https://wa.me/?text=${encodeURIComponent(inviteText.trim())}`;

  return (
    <section className="space-y-4 max-w-2xl mx-auto w-full">
      {/* Gate Bell Sound & Lock-Screen Alerts Banner */}
      <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-200/80 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                hostAlertsEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              <Bell className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">
                {hostAlertsEnabled ? 'Gate Bell & Lock-Screen Active' : 'Gate Bell & Lock-Screen Alerts'}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {hostAlertsEnabled
                  ? 'Chime & browser alerts armed for guest arrivals'
                  : 'Ring chime & notify when a guest arrives'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                unlockSharedAudioContext();
                playGateDoorbellChime();
              }}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition inline-flex items-center gap-1"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Test</span>
            </button>
            <button
              type="button"
              onClick={onEnableHostAlerts}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold text-xs transition ${
                hostAlertsEnabled
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
              }`}
            >
              {hostAlertsEnabled ? 'Active' : 'Enable'}
            </button>
          </div>
        </div>

        {hostAlertsEnabled && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
            <span className="text-emerald-700 font-medium truncate">
              Gate bell listener active
            </span>
            <button
              type="button"
              onClick={toggleWakeLock}
              className={`min-h-[34px] px-2.5 py-1 rounded-lg font-bold shrink-0 transition inline-flex items-center gap-1 ${
                wakeLockWanted
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Keep Screen Ready: {wakeLockWanted ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Pending Approval Alerts */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700">
            Action Required at Main Gate ({pendingVisitors.length})
          </h3>
          <button
            type="button"
            onClick={onRefreshVisitors}
            className="min-h-[36px] text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1 rounded-lg transition inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh</span>
          </button>
        </div>

        {pendingVisitors.length === 0 ? (
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 text-center text-xs text-slate-400">
            No visitors waiting at the gate right now.
          </div>
        ) : (
          pendingVisitors.map((v) => (
            <div
              key={v.id}
              className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-amber-900">Waiting for Approval</span>
                  <h4 className="font-bold text-slate-900 text-base mt-0.5">{v.visitorName}</h4>
                  <p className="text-xs text-slate-600">
                    {v.visitorType} · <span className="font-mono-tabular">{displayIndianMobile(v.visitorPhone)}</span>
                  </p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5">
                    For: {v.destination}
                  </p>
                </div>
                <span className="text-xs font-bold font-mono-tabular text-slate-500">
                  {v.timeLabel}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateVisitorStatus(v.id, 'APPROVED')}
                  className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl shadow transition inline-flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateVisitorStatus(v.id, 'DENIED')}
                  className="min-h-[44px] bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs py-2.5 rounded-xl transition inline-flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Deny</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pre-Approve Guest & AI Invite Generator */}
      <form
        onSubmit={handleGeneratePass}
        className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-slate-800 text-base">Pre-Approve Guest</h2>
          <span className="text-xs font-semibold text-indigo-700">Gemini Assisted</span>
        </div>

        <div className="space-y-2.5">
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(formatTitleCaseValue(e.target.value))}
            placeholder="Name *"
            aria-label="Pre-approved Guest Name"
            className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
          />
          <input
            type="tel"
            inputMode="numeric"
            maxLength={16}
            value={guestPhone}
            onChange={(e) => {
              const cleaned = normalizeIndianMobile(e.target.value);
              if (cleaned.length > 0 && !/^[6-9]/.test(cleaned)) {
                setGuestPhone('');
                return;
              }
              setGuestPhone(displayIndianMobile(cleaned));
            }}
            placeholder="Phone (Optional — e.g., 98765 43210)"
            aria-label="Pre-approved Guest Phone"
            className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono-tabular placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
          />
          <select
            value={guestType}
            onChange={(e) => setGuestType(e.target.value)}
            aria-label="Pre-approved Guest Category"
            className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
          >
            {categoryOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={guestNote}
            onChange={(e) => setGuestNote(e.target.value)}
            placeholder="Quick Note / Instructions (Optional)"
            aria-label="Quick Note"
            className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
          />
        </div>

        <button
          type="submit"
          disabled={generatingQrCard}
          className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 active:scale-[0.99] text-white font-bold text-sm py-3 rounded-xl shadow-md shadow-emerald-600/20 transition"
        >
          {generatingQrCard ? 'Generating Pass...' : 'Generate Pass'}
        </button>

        {generatedOtp && (
          <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  4-Digit Entry OTP
                </p>
                <p className="text-2xl font-black tracking-[0.25em] text-emerald-950 font-mono-tabular mt-0.5">
                  {generatedOtp}
                </p>
              </div>
              <button
                type="button"
                disabled={draftingInvite}
                onClick={handleDraftAiInvite}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs shadow-sm transition inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{draftingInvite ? 'Drafting...' : 'Draft Invite'}</span>
              </button>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-white p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Mobile QR Pass Card</span>
                </p>
                {qrPassCard && (
                  <button
                    type="button"
                    onClick={() =>
                      setPassModalPayload({
                        card: qrPassCard,
                        visitorName: lastGuestName || guestName.trim() || 'Guest',
                        phone: lastGuestPhone || undefined,
                        inviteText: inviteText.trim(),
                      })
                    }
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1 transition"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Full Preview</span>
                  </button>
                )}
              </div>

              {generatingQrCard ? (
                <div className="h-40 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400">
                  Generating mobile QR pass image...
                </div>
              ) : qrPassCard ? (
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setPassModalPayload({
                        card: qrPassCard,
                        visitorName: lastGuestName || guestName.trim() || 'Guest',
                        phone: lastGuestPhone || undefined,
                        inviteText: inviteText.trim(),
                      })
                    }
                    className="w-28 shrink-0 rounded-xl overflow-hidden border border-slate-200 shadow-sm hover:opacity-95 transition"
                  >
                    <img
                      src={qrPassCard.dataUrl}
                      alt={`QR Entry Pass for ${lastGuestName || 'Guest'}`}
                      className="w-full h-auto block"
                    />
                  </button>
                  <div className="flex-1 min-w-0 space-y-2">
                    <button
                      type="button"
                      disabled={sharingQr}
                      onClick={handleShareGeneratedQr}
                      className="w-full min-h-[42px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs py-2 px-3 rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>{sharingQr ? 'Sharing...' : 'Share QR Image'}</span>
                    </button>
                    <a
                      href={qrPassCard.dataUrl}
                      download={qrPassCard.fileName}
                      onClick={() => onShowToast('Downloading QR Pass PNG...')}
                      className="w-full min-h-[40px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PNG</span>
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyGeneratedQrImage}
                      className="w-full min-h-[40px] bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy QR Image</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <textarea
              rows={3}
              value={inviteText}
              onChange={(e) => setInviteText(e.target.value)}
              className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />

            <div className="grid grid-cols-2 gap-2">
              <a
                href={waGuestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-3 rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send on WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={handleCopyInvite}
                className="min-h-[44px] bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 font-bold text-xs py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Message</span>
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Sub-View Navigation Buttons */}
      <button
        type="button"
        onClick={() => setSubView('history')}
        className="w-full min-h-[60px] bg-white hover:bg-slate-50 active:scale-[0.99] rounded-2xl p-4 shadow-sm border border-slate-200/80 flex items-center justify-between gap-2 transition"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
            <History className="w-5 h-5" />
          </span>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-900">My Visitor History</p>
            <p className="text-xs text-slate-500">
              {historyVisitors.length} visits · Past & pre-approved visitors
            </p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {activeResidentialUnit && (
        <button
          type="button"
          onClick={() => setSubView('family')}
          className="w-full min-h-[60px] bg-white hover:bg-slate-50 active:scale-[0.99] rounded-2xl p-4 shadow-sm border border-slate-200/80 flex items-center justify-between transition"
        >
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-indigo-900 text-white flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </span>
            <div className="text-left">
              <p className="text-sm font-bold text-slate-900">Add / Manage Family</p>
              <p className="text-xs text-slate-500">
                {flatMembers.length} {flatMembers.length === 1 ? 'member' : 'members'} · Parallel gate approval access
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      )}

      <QrPassShareModal
        payload={passModalPayload}
        onClose={() => setPassModalPayload(null)}
        onShowToast={onShowToast}
      />
    </section>
  );
};
