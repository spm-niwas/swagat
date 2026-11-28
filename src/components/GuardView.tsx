import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  ClipboardList,
  Home,
  Loader2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { AccessZone, DirectoryEntry, VisitorRecord, VisitorStatus } from '../types/swagat';
import {
  buildCategoryOptions,
  displayIndianMobile,
  formatDirectoryLabel,
  formatTime,
  formatTitleCaseValue,
  getZoneDirectoryLabels,
  isSameUnit,
  isValidIndianMobile,
  normalizeIndianMobile,
} from '../utils/formatters';
import { analyzeIdOrPlateApi } from '../services/api';
import { MobileInput } from './MobileInput';

interface GuardViewProps {
  visitors: VisitorRecord[];
  directory: DirectoryEntry[];
  onEnforceGeofence: () => boolean;
  onCreateVisitor: (record: Omit<VisitorRecord, 'id'>) => Promise<void>;
  onUpdateVisitorStatus: (id: string, status: VisitorStatus) => Promise<void>;
  onOpenPassModal: (visitor: VisitorRecord) => void;
  onShowToast: (msg: string) => void;
}

export const GuardView: React.FC<GuardViewProps> = ({
  visitors,
  directory,
  onEnforceGeofence,
  onCreateVisitor,
  onUpdateVisitorStatus,
  onOpenPassModal,
  onShowToast,
}) => {
  const [showGateLog, setShowGateLog] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [selectedZone, setSelectedZone] = useState<AccessZone>('OFFICE');
  const [destinationSearch, setDestinationSearch] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorType, setVisitorType] = useState('Personal Guest');
  const [visitorVehicle, setVisitorVehicle] = useState('');
  const [aiScanning, setAiScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const categoryOptions = buildCategoryOptions(selectedZone === 'RESIDENTIAL');
  const zoneLabels = getZoneDirectoryLabels(directory, selectedZone);
  const filteredLabels = zoneLabels.filter((label) =>
    label.toLowerCase().includes(destinationSearch.trim().toLowerCase())
  );

  const handleZoneChange = (zone: AccessZone) => {
    setSelectedZone(zone);
    setDestinationSearch('');
    setSelectedDestination('');
    const nextOptions = buildCategoryOptions(zone === 'RESIDENTIAL');
    if (!nextOptions.some((o) => o.value === visitorType)) {
      setVisitorType(nextOptions[0].value);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onEnforceGeofence()) return;
    const code = otpCode.trim();
    if (code.length !== 4) {
      onShowToast('Enter a valid 4-digit OTP code.');
      return;
    }
    const match = visitors.find(
      (v) => v.passCode === code && (v.status === 'PRE_APPROVED' || v.status === 'APPROVED')
    );
    if (!match) {
      onShowToast('Invalid or expired OTP code.');
      return;
    }
    setOtpCode('');
    if (match.status === 'PRE_APPROVED') {
      await onUpdateVisitorStatus(match.id, 'APPROVED');
    }
    onOpenPassModal(match);
  };

  const handleAiScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAiScanning(true);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const dataUrl = String(ev.target?.result || '');
        const base64Data = dataUrl.split(',')[1];
        if (!base64Data) throw new Error('Could not read image.');
        const result = await analyzeIdOrPlateApi(base64Data, file.type || 'image/jpeg');
        if (result.name) setVisitorName(formatTitleCaseValue(result.name));
        if (result.vehicle) setVisitorVehicle(result.vehicle.toUpperCase());
        if (result.name || result.vehicle) {
          onShowToast('ID / Plate details auto-filled by Gemini AI.');
        } else {
          onShowToast('No readable name or vehicle plate found in image.');
        }
      } catch (err) {
        onShowToast(err instanceof Error ? err.message : 'Could not extract details from image.');
      } finally {
        setAiScanning(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const isPhoneOptional = visitorType === 'Delivery' || visitorType === 'Cab / Taxi';

  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onEnforceGeofence()) return;
    const name = visitorName.trim();
    const cleanPhone = normalizeIndianMobile(visitorPhone);
    const destination = selectedDestination || destinationSearch.trim();

    if (!name || !destination) {
      onShowToast('Please select a Host/Unit and enter Visitor Name.');
      return;
    }
    if (!isPhoneOptional && !isValidIndianMobile(cleanPhone)) {
      onShowToast('Enter a valid 10-digit Mobile starting with 6, 7, 8, or 9.');
      return;
    }
    if (isPhoneOptional && cleanPhone.length > 0 && !isValidIndianMobile(cleanPhone)) {
      onShowToast('Enter a valid 10-digit Mobile starting with 6, 7, 8, or 9, or leave it blank.');
      return;
    }

    setSubmitting(true);
    try {
      const matchedEntries = directory.filter(
        (d) => d.zone === selectedZone && isSameUnit(d.unit, destination)
      );
      const exactMatch =
        matchedEntries.find((d) => formatDirectoryLabel(d) === destination) || matchedEntries[0];
      const hostUids = Array.from(
        new Set(matchedEntries.map((d) => d.uid).filter((u): u is string => Boolean(u)))
      );

      const now = Date.now();
      await onCreateVisitor({
        visitorName: name,
        visitorPhone: cleanPhone ? displayIndianMobile(cleanPhone) : 'Not Provided',
        visitorType,
        zone: selectedZone,
        destination,
        hostPhone: exactMatch?.phone || '',
        hostUid: exactMatch?.uid || hostUids[0] || '',
        hostUids,
        vehicleNumber: visitorVehicle.trim().toUpperCase(),
        passCode: String(Math.floor(1000 + Math.random() * 9000)),
        status: 'PENDING',
        createdAt: now,
        timeLabel: formatTime(now),
      });
      setVisitorName('');
      setVisitorPhone('');
      setVisitorVehicle('');
      setDestinationSearch('');
      setSelectedDestination('');
      onShowToast(`Approval request sent to ${destination}`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to submit walk-in visitor.');
    } finally {
      setSubmitting(false);
    }
  };

  if (showGateLog) {
    return (
      <section className="space-y-3.5 max-w-2xl mx-auto w-full">
        <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-200/80 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowGateLog(false)}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Gate Check-In</span>
          </button>
          <span className="text-xs font-bold font-mono-tabular text-slate-500">
            {visitors.length} entries
          </span>
        </div>

        <div className="space-y-2.5">
          {visitors.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 border border-slate-200">
              No gate entries recorded yet today.
            </div>
          ) : (
            visitors.map((v) => {
              const isOffice = v.zone === 'OFFICE';
              const statusLabelMap: Record<VisitorStatus, { text: string; cls: string }> = {
                PENDING: { text: 'Pending', cls: 'text-amber-700' },
                PRE_APPROVED: { text: `OTP ${v.passCode}`, cls: 'text-indigo-700' },
                APPROVED: { text: 'Inside', cls: 'text-emerald-700' },
                DENIED: { text: 'Denied', cls: 'text-rose-700' },
                CHECKED_OUT: { text: 'Checked Out', cls: 'text-slate-500' },
              };
              const st = statusLabelMap[v.status];

              return (
                <div key={v.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-500">
                        <span className={isOffice ? 'text-blue-700' : 'text-emerald-700'}>
                          {isOffice ? 'Office' : 'Residential'}
                        </span>
                        <span> · </span>
                        <span className="font-mono-tabular">{v.timeLabel}</span>
                      </p>
                      <h4 className="font-bold text-slate-900 text-sm mt-0.5">
                        {v.visitorName}{' '}
                        <span className="text-xs font-normal text-slate-500">({v.visitorType})</span>
                      </h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        To: <strong>{v.destination}</strong>
                      </p>
                      {v.vehicleNumber && (
                        <p className="text-xs font-mono-tabular text-slate-500 mt-0.5">
                          Vehicle: {v.vehicleNumber}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs font-bold shrink-0 font-mono-tabular ${st.cls}`}>
                      {st.text}
                    </span>
                  </div>

                  {v.status === 'APPROVED' && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => onOpenPassModal(v)}
                        className="flex-1 min-h-[40px] bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2 rounded-xl transition"
                      >
                        View Pass
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateVisitorStatus(v.id, 'CHECKED_OUT')}
                        className="flex-1 min-h-[40px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2 rounded-xl transition"
                      >
                        Check Out
                      </button>
                    </div>
                  )}

                  {v.status === 'PRE_APPROVED' && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => onUpdateVisitorStatus(v.id, 'APPROVED')}
                        className="w-full min-h-[40px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 rounded-xl transition"
                      >
                        Check In Guest (OTP {v.passCode})
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 max-w-2xl mx-auto w-full">
      {/* Pre-Approved Entry Code Quick Bar */}
      <form
        onSubmit={handleVerifyOtp}
        className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-4 text-white shadow-md"
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-100">
            Pre-Approved Entry Code
          </span>
          <span className="text-xs font-semibold text-indigo-100">Fast-Track</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="tel"
            inputMode="numeric"
            maxLength={4}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="4-Digit OTP"
            aria-label="Pre-approved 4-digit OTP"
            className="flex-1 min-w-[160px] min-h-[44px] bg-white/15 border border-white/30 rounded-xl px-3.5 py-2.5 text-base font-bold font-mono-tabular tracking-widest placeholder-indigo-200 text-white text-center focus:outline-none focus:ring-2 focus:ring-white"
          />
          <button
            type="submit"
            className="min-h-[44px] bg-white text-indigo-700 font-bold text-sm px-6 py-2.5 rounded-xl shadow hover:bg-indigo-50 active:scale-95 transition shrink-0"
          >
            Verify
          </button>
        </div>
      </form>

      {/* New Walk-In Visitor Check-In Card */}
      <form
        onSubmit={handleWalkInSubmit}
        className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-slate-800 text-base">Walk-in Visitor</h2>
          <label className="cursor-pointer inline-flex items-center gap-1.5 min-h-[40px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0">
            <Camera className="w-3.5 h-3.5" />
            <span>AI Scan ID/Plate</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleAiScan}
            />
          </label>
        </div>

        {aiScanning && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-800 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Gemini AI is reading card or number plate...</span>
          </div>
        )}

        {/* Zone Access Control Selector */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => handleZoneChange('OFFICE')}
            className={`min-h-[44px] p-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition ${
              selectedZone === 'OFFICE'
                ? 'border-blue-600 bg-blue-50 text-blue-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Office</span>
          </button>
          <button
            type="button"
            onClick={() => handleZoneChange('RESIDENTIAL')}
            className={`min-h-[44px] p-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition ${
              selectedZone === 'RESIDENTIAL'
                ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Residence</span>
          </button>
        </div>

        {/* Searchable Host / Destination Selector */}
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <input
              type="text"
              autoComplete="off"
              value={destinationSearch}
              onFocus={() => setDropdownOpen(true)}
              onChange={(e) => {
                setDestinationSearch(e.target.value);
                setSelectedDestination('');
                setDropdownOpen(true);
              }}
              placeholder="Search Host / Unit (flat no., dept, name) *"
              aria-label="Search Host or Unit"
              className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-10 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 pointer-events-none" />
            {(destinationSearch || selectedDestination) && (
              <button
                type="button"
                onClick={() => {
                  setDestinationSearch('');
                  setSelectedDestination('');
                  setDropdownOpen(true);
                }}
                aria-label="Clear destination"
                className="absolute right-2 top-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {dropdownOpen && (
            <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-30 divide-y divide-slate-100">
              {filteredLabels.length === 0 ? (
                <div className="px-3.5 py-3 text-xs text-slate-400">
                  No matching unit or host found.
                </div>
              ) : (
                filteredLabels.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setDestinationSearch(label);
                      setSelectedDestination(label);
                      setDropdownOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2.5 min-h-[42px] text-xs font-semibold text-slate-800 hover:bg-indigo-50 transition block"
                  >
                    {label}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Visitor Details */}
        <div className="space-y-2.5">
          <select
            value={visitorType}
            onChange={(e) => setVisitorType(e.target.value)}
            aria-label="Visitor Category"
            className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          >
            {categoryOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={visitorName}
            onChange={(e) => setVisitorName(formatTitleCaseValue(e.target.value))}
            placeholder="Name *"
            aria-label="Visitor Name"
            className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
          <MobileInput
            value={visitorPhone}
            onChange={(formatted) => setVisitorPhone(formatted)}
            placeholder={isPhoneOptional ? 'Mobile (Optional)' : 'Mobile *'}
            ariaLabel={isPhoneOptional ? 'Mobile (Optional)' : 'Mobile *'}
            className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono-tabular placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
          <input
            type="text"
            value={visitorVehicle}
            onChange={(e) => setVisitorVehicle(e.target.value.toUpperCase())}
            placeholder="Vehicle No. (Optional — e.g., WB 02 AB 1234)"
            aria-label="Vehicle Number"
            className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm uppercase font-mono-tabular placeholder:normal-case placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-700 disabled:opacity-60 active:scale-[0.99] text-white font-bold text-base py-3 rounded-xl shadow-md shadow-blue-600/20 transition flex items-center justify-center gap-2"
        >
          <span>{submitting ? 'Sending...' : 'Request Host Approval'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {/* Link to Dedicated Live Gate Log Sub-View */}
      <button
        type="button"
        onClick={() => setShowGateLog(true)}
        className="w-full min-h-[60px] bg-white hover:bg-slate-50 active:scale-[0.99] rounded-2xl p-4 shadow-sm border border-slate-200/80 flex items-center justify-between transition"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5" />
          </span>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-900">Live Gate Log</p>
            <p className="text-xs text-slate-500">
              {visitors.length} entries · Active passes, approvals & check-outs
            </p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
      </button>
    </section>
  );
};
