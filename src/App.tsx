// The existing single-file app predates the strict TypeScript project setup.
// Keep its runtime behavior unchanged while the app is incrementally typed.
// @ts-nocheck
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, Clock, User, MapPin, CreditCard, CheckCircle2, Globe, Settings, 
  Plus, Edit, Trash2, Building, FileText, Phone, Mail, Search, Filter, 
  TrendingUp, ChevronRight, AlertCircle, Sparkles, ShieldCheck, Check, X,
  DollarSign, Users, Award, Briefcase, RefreshCw, Layers, CheckSquare, Stethoscope, Database,
  Menu, Home, CalendarDays, UserRound, BarChart3, ChevronRight as ChevronRightIcon,
  Megaphone, ReceiptText, Download, Eye, MousePointerClick, Upload, Crown
} from 'lucide-react';
import * as XLSX from 'xlsx';

const MOCK_BRANCHES = [
  { id: 1, name: "Mississauga Central", address: "4310 Sherwoodtowne Blvd", city: "Mississauga, ON", phone: "+1 437 898 7424" },
  { id: 2, name: "Oakville Downtown", address: "123 Lakeshore Rd E", city: "Oakville, ON", phone: "+1 437 898 7424" },
  { id: 3, name: "Toronto West", address: "456 Bloor St W", city: "Toronto, ON", phone: "+1 437 898 7424" },
  { id: 4, name: "Yorkville Flagship", address: "88 Yorkville Ave", city: "Toronto, ON", phone: "+1 437 898 7424" }
];

const INITIAL_SERVICES = [
  // Thai Traditional Massage (Deep Tissue - No oil)
  { id: 1, name: "Thai Traditional Massage (30 min)", category: "Thai Traditional", duration: 30, price: 60, deposit: 15, isRmt: false, taxRate: 0.13, description: "Deep Tissue Massage (No oil)" },
  { id: 2, name: "Thai Traditional Massage (60 min)", category: "Thai Traditional", duration: 60, price: 95, deposit: 20, isRmt: false, taxRate: 0.13, description: "Deep Tissue Massage (No oil)" },
  { id: 3, name: "Thai Traditional Massage (90 min)", category: "Thai Traditional", duration: 90, price: 140, deposit: 30, isRmt: false, taxRate: 0.13, description: "Deep Tissue Massage (No oil)" },
  { id: 4, name: "Thai Traditional Massage - Couple (60 min)", category: "Thai Traditional", duration: 60, price: 185, deposit: 40, isRmt: false, taxRate: 0.13, description: "Deep Tissue Massage (No oil) for 2 people" },
  { id: 5, name: "Thai Traditional Massage - Couple (90 min)", category: "Thai Traditional", duration: 90, price: 275, deposit: 50, isRmt: false, taxRate: 0.13, description: "Deep Tissue Massage (No oil) for 2 people" },

  // Thai Combination Swedish Massage (Thai massage + Swedish)
  { id: 6, name: "Thai Combination Swedish (30 min)", category: "Thai Combo Swedish", duration: 30, price: 60, deposit: 15, isRmt: false, taxRate: 0.13, description: "Thai Massage + Swedish Massage" },
  { id: 7, name: "Thai Combination Swedish (60 min)", category: "Thai Combo Swedish", duration: 60, price: 95, deposit: 20, isRmt: false, taxRate: 0.13, description: "Thai Massage + Swedish Massage" },
  { id: 8, name: "Thai Combination Swedish (90 min)", category: "Thai Combo Swedish", duration: 90, price: 140, deposit: 30, isRmt: false, taxRate: 0.13, description: "Thai Massage + Swedish Massage" },
  { id: 9, name: "Thai Combination Swedish - Couple (60 min)", category: "Thai Combo Swedish", duration: 60, price: 185, deposit: 40, isRmt: false, taxRate: 0.13, description: "Thai Massage + Swedish Massage for 2 people" },
  { id: 10, name: "Thai Combination Swedish - Couple (90 min)", category: "Thai Combo Swedish", duration: 90, price: 275, deposit: 50, isRmt: false, taxRate: 0.13, description: "Thai Massage + Swedish Massage for 2 people" },

  // Thai Combo Swedish + Hot Stone Massage
  { id: 11, name: "Thai Combo Swedish + Hot Stone (60 min)", category: "Hot Stone Combo", duration: 60, price: 105, deposit: 25, isRmt: false, taxRate: 0.13, description: "Thai + Swedish + Hot Stone Massage" },
  { id: 12, name: "Thai Combo Swedish + Hot Stone (90 min)", category: "Hot Stone Combo", duration: 90, price: 150, deposit: 35, isRmt: false, taxRate: 0.13, description: "Thai + Swedish + Hot Stone Massage" },
  { id: 13, name: "Thai Combo Swedish + Hot Stone - Couple (60 min)", category: "Hot Stone Combo", duration: 60, price: 205, deposit: 45, isRmt: false, taxRate: 0.13, description: "Hot Stone Combo for 2 people" },
  { id: 14, name: "Thai Combo Swedish + Hot Stone - Couple (90 min)", category: "Hot Stone Combo", duration: 90, price: 295, deposit: 60, isRmt: false, taxRate: 0.13, description: "Hot Stone Combo for 2 people" },

  // Add-ons & Packages
  { id: 15, name: "Hot Stone Add-On", category: "Add-On & Packages", duration: 15, price: 15, deposit: 0, isRmt: false, taxRate: 0.13, description: "Add warm volcanic stones to any treatment" },
  { id: 16, name: "Package: 60 min x 4 Sessions", category: "Add-On & Packages", duration: 60, price: 360, deposit: 50, isRmt: false, taxRate: 0.13, description: "Bundled 4 sessions of 60 min massage" },
  { id: 17, name: "Package: 90 min x 4 Sessions", category: "Add-On & Packages", duration: 90, price: 540, deposit: 100, isRmt: false, taxRate: 0.13, description: "Bundled 4 sessions of 90 min massage" },

  // Regulated Healthcare & RMT
  { id: 18, name: "Registered Massage Therapy (RMT 60 min)", category: "RMT Healthcare", duration: 60, price: 120, deposit: 30, isRmt: true, taxRate: 0.00, description: "Regulated Healthcare with Insurance Receipt" },
  { id: 19, name: "Registered Massage Therapy (RMT 90 min)", category: "RMT Healthcare", duration: 90, price: 170, deposit: 40, isRmt: true, taxRate: 0.00, description: "Regulated Healthcare with Insurance Receipt" },
  { id: 20, name: "Traditional Thai Acupuncture (60 min)", category: "RMT Healthcare", duration: 60, price: 110, deposit: 25, isRmt: true, taxRate: 0.00, description: "Certified Medical Acupuncture" }
];

const MOCK_THERAPISTS = [
  { id: 1, name: "Kanya S.", thaiCertified: true, rmtCertified: false, branches: [1, 2], schedule: {}, rating: 4.9, bio: "10+ years traditional Wat Pho Thai technique experience" },
  { id: 2, name: "Michael T., RMT", thaiCertified: true, rmtCertified: true, branches: [1, 3], schedule: {}, rating: 4.8, bio: "CMTO Registered Massage Therapist & Deep Tissue specialist" },
  { id: 3, name: "Priya P.", thaiCertified: true, rmtCertified: false, branches: [2, 4], schedule: {}, rating: 4.9, bio: "Hot stone specialist and body stretch master" },
  { id: 4, name: "Somchai R., RMT", thaiCertified: true, rmtCertified: true, branches: [1, 4], schedule: {}, rating: 5.0, bio: "Acupuncture practitioner and sports rehabilitation" }
];

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Mirrors the backend's weekdayKeyForDate — avoids timezone shifts on YYYY-MM-DD strings.
function weekdayKeyForDate(dateStr) {
  const parsed = new Date(`${String(dateStr || '').slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return WEEKDAY_KEYS[parsed.getUTCDay()];
}

// Mirrors the backend's isTherapistScheduledAtBranch — filters the roster to whoever is
// actually rotated into a branch on a given date, falling back to the static branch list
// when no per-weekday rotation has been configured for that therapist.
function isTherapistScheduledAtBranch(therapist, branchId, dateStr) {
  const targetBranchId = Number(branchId);
  const dayKey = weekdayKeyForDate(dateStr);
  const scheduledBranch = dayKey ? therapist?.schedule?.[dayKey] : undefined;
  if (scheduledBranch !== undefined && scheduledBranch !== null && scheduledBranch !== '') {
    return Number(scheduledBranch) === targetBranchId;
  }
  const hasAnySchedule = therapist?.schedule && WEEKDAY_KEYS.some((key) => {
    const value = therapist.schedule[key];
    return value !== undefined && value !== null && value !== '';
  });
  if (hasAnySchedule) return false;
  return (therapist?.branches || []).map(Number).includes(targetBranchId);
}


const AVAILABLE_TIMES = ["09:30 AM", "11:00 AM", "01:00 PM", "02:30 PM", "04:00 PM", "05:30 PM", "07:00 PM"];
const THERAPIST_CALENDAR_COLORS = [
  { name: 'Emerald', event: 'bg-emerald-100 border-emerald-700', dot: 'bg-emerald-600', text: 'text-emerald-950' },
  { name: 'Blue', event: 'bg-blue-100 border-blue-700', dot: 'bg-blue-600', text: 'text-blue-950' },
  { name: 'Amber', event: 'bg-amber-100 border-amber-700', dot: 'bg-amber-500', text: 'text-amber-950' },
  { name: 'Purple', event: 'bg-purple-100 border-purple-700', dot: 'bg-purple-600', text: 'text-purple-950' },
  { name: 'Rose', event: 'bg-rose-100 border-rose-700', dot: 'bg-rose-600', text: 'text-rose-950' },
  { name: 'Cyan', event: 'bg-cyan-100 border-cyan-700', dot: 'bg-cyan-600', text: 'text-cyan-950' },
];

const DEFAULT_BUSINESS_PROFILE = {
  businessName: 'MY THAI THAI',
  legalName: '',
  tagline: 'Traditional Thai massage & wellness',
  email: 'mythaithaimassage@gmail.com',
  phone: '+1 437 898 7424',
  website: 'https://mythaithaimassage.com',
  address: 'Ontario, Canada',
  taxRegistrationNumber: '',
  photoUrl: '',
};

function useBusinessBranding() {
  const [businessName, setBusinessName] = useState(DEFAULT_BUSINESS_PROFILE.businessName);
  const [photoUrl, setPhotoUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    const loadBranding = async () => {
      try {
        const response = await fetch('/api/booking?view=business-name', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
        if (typeof data.businessName !== 'string' || !data.businessName.trim()) {
          throw new Error('The owner profile does not have a business display name.');
        }
        if (isCurrent) {
          setBusinessName(data.businessName);
          setPhotoUrl(typeof data.photoUrl === 'string' ? data.photoUrl : '');
          setError('');
        }
      } catch {
        if (isCurrent) setError('Business profile branding could not be synced.');
      }
    };

    loadBranding();
    const refreshInterval = window.setInterval(loadBranding, 30000);
    return () => {
      isCurrent = false;
      window.clearInterval(refreshInterval);
    };
  }, []);

  return { businessName, photoUrl, error };
}

function BusinessPhoto({ businessName, photoUrl, className }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [photoUrl]);
  const initials = businessName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'MT';

  if (photoUrl && !imageFailed) {
    return <img src={photoUrl} alt={`${businessName} logo`} className={className} onError={() => setImageFailed(true)} />;
  }

  return (
    <div role="img" aria-label={`${businessName} logo`} className={`${className} flex items-center justify-center bg-gradient-to-br from-emerald-900 to-emerald-700 text-sm font-bold text-white`}>
      {initials}
    </div>
  );
}

function getTherapistCalendarColor(therapistName, therapists) {
  const index = therapists.findIndex((therapist) => therapist.name === therapistName);
  return THERAPIST_CALENDAR_COLORS[(index < 0 ? 0 : index) % THERAPIST_CALENDAR_COLORS.length];
}

const TRANSLATIONS = {
  en: {
    title: "MY THAI THAI Management",
    subTitle: "Practice & Branch Management System",
    lang: "Language",
    dashboard: "Dashboard",
    schedule: "Schedule & Bookings",
    services: "Service Catalogue",
    staff: "Therapists & Staff",
    addTherapist: "Add New Therapist",
    removeTherapist: "Remove Staff",
    confirmRemove: "Confirm Delete?",
    financials: "Financial Reports",
    sheetsTab: "Google Sheets API",
    settings: "Branch Settings",
    allBranches: "All Branches (Consolidated)",
    addBooking: "New Walk-in / Phone Booking",
    addService: "Add New Service",
    revenueToday: "Revenue Today",
    appointmentsToday: "Bookings Today",
    activeStaff: "Active Therapists",
    hstCollected: "HST Tax Collected",
    name: "Service Name",
    category: "Category",
    price: "Price ($)",
    deposit: "Deposit ($)",
    duration: "Duration (min)",
    taxRate: "Tax Rate (%)",
    isRmt: "RMT / Regulated",
    actions: "Actions",
    edit: "Edit",
    archive: "Archive",
    save: "Save Changes",
    cancel: "Cancel",
    filterCat: "Filter Category",
    status: "Status",
    confirmed: "Confirmed",
    completed: "Completed",
    paid: "Paid",
    pending: "Pending Deposit"
  },
  th: {
    title: "ระบบจัดการ มาย ไทย ไทย",
    subTitle: "ระบบจัดการสาขาและการจองบริการ",
    lang: "ภาษา",
    dashboard: "แผงควบคุม",
    schedule: "ตารางงานและการจอง",
    services: "รายการบริการและราคา",
    staff: "พนักงานและเทอราปิส",
    addTherapist: "เพิ่มพนักงาน / เทอราปิส",
    removeTherapist: "ลบพนักงาน",
    confirmRemove: "ยืนยันการลบ?",
    financials: "รายงานการเงิน",
    sheetsTab: "เชื่อมต่อ Google Sheets",
    settings: "ตั้งค่าสาขา",
    allBranches: "รวมทุกสาขา",
    addBooking: "บันทึกการจอง (หน้าร้าน/โทรศัพท์)",
    addService: "เพิ่มบริการใหม่",
    revenueToday: "รายได้วันนี้",
    appointmentsToday: "จำนวนการจองวันนี้",
    activeStaff: "พนักงานปฏิบัติงาน",
    hstCollected: "ภาษี HST ที่จัดเก็บ",
    name: "ชื่อบริการ",
    category: "หมวดหมู่",
    price: "ราคา ($)",
    deposit: "เงินมัดจำ ($)",
    duration: "ระยะเวลา (นาที)",
    taxRate: "อัตราภาษี (%)",
    isRmt: "บริการ RMT / การแพทย์",
    actions: "การจัดการ",
    edit: "แก้ไข",
    archive: "ยกเลิก/ซ่อน",
    save: "บันทึกข้อมูล",
    cancel: "ยกเลิก",
    filterCat: "กรองหมวดหมู่",
    status: "สถานะ",
    confirmed: "ยืนยันแล้ว",
    completed: "เสร็จสิ้น",
    paid: "ชำระเงินแล้ว",
    pending: "รอชำระมัดจำ"
  }
};

async function sendBookingToGoogleSheets(apiUrl, bookingPayload) {
  // Target the backend API route using Google Sheets API v4
  const targetUrl = (apiUrl && apiUrl.trim() !== "") ? apiUrl.trim() : "/api/booking";

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(bookingPayload)
    });

    if (response.ok) {
      const result = await response.json().catch(() => ({}));
      return {
        success: true,
        data: result,
        emailSent: result.emailSent !== false,
        emailReason: result.emailError || '',
        marketingConsentSaved: result.marketingConsentSaved !== false,
        marketingConsentReason: result.marketingConsentError || '',
        patientHistorySaved: result.patientHistorySaved !== false,
        patientHistoryReason: result.patientHistoryError || '',
        loyaltyEnrollmentSaved: result.loyaltyEnrollmentSaved !== false,
        loyaltyEnrollmentReason: result.loyaltyEnrollmentError || '',
        loyaltyEnrollmentEmailSent: result.loyaltyEnrollmentEmailSent !== false,
        loyaltyEnrollmentEmailError: result.loyaltyEnrollmentEmailError || '',
        loyaltyCompanyEmailNotified: result.loyaltyCompanyEmailNotified === true
      };
    } else {
      const errData = await response.json().catch(() => ({}));
      return { success: false, reason: errData.message || `Server returned status ${response.status}` };
    }
  } catch (error) {
    console.error("Error sending to Google Sheets API:", error);
    return { success: false, reason: error.message || "Network error" };
  }
}

const BODY_AREA_OPTIONS = [
  ['Head / face', 'Head'], ['Neck', 'Neck'], ['Shoulders', 'Shoulders'],
  ['Upper back', 'Upper back'], ['Lower back', 'Lower back'], ['Chest / abdomen', 'Core'],
  ['Arms / hands', 'Arms'], ['Hips / glutes', 'Hips'], ['Legs / knees', 'Legs'], ['Feet', 'Feet'],
];

function BodyAreaMap({ value = '', onChange, readOnly = false }) {
  const selected = Array.isArray(value)
    ? value
    : String(value || '').split(',').map((area) => area.trim()).filter(Boolean);
  const toggle = (area) => {
    if (readOnly || !onChange) return;
    onChange(selected.includes(area) ? selected.filter((item) => item !== area) : [...selected, area]);
  };

  const views = [
    { id: 'left', label: 'Left side', areas: ['Head / face', 'Neck', 'Shoulders', 'Arms / hands', 'Hips / glutes', 'Legs / knees'] },
    { id: 'back', label: 'Back', areas: ['Head / face', 'Neck', 'Shoulders', 'Upper back', 'Lower back', 'Arms / hands', 'Hips / glutes', 'Legs / knees'] },
    { id: 'front', label: 'Front', areas: ['Head / face', 'Neck', 'Shoulders', 'Chest / abdomen', 'Arms / hands', 'Hips / glutes', 'Legs / knees', 'Feet'] },
    { id: 'right', label: 'Right side', areas: ['Head / face', 'Neck', 'Shoulders', 'Arms / hands', 'Hips / glutes', 'Legs / knees'] },
  ];
  const positions = {
    'Head / face': 'left-1/2 top-3 -translate-x-1/2',
    Neck: 'left-1/2 top-11 -translate-x-1/2',
    Shoulders: 'left-1/2 top-[4.5rem] -translate-x-1/2',
    'Upper back': 'left-1/2 top-20 -translate-x-1/2',
    'Lower back': 'left-1/2 top-28 -translate-x-1/2',
    'Chest / abdomen': 'left-1/2 top-24 -translate-x-1/2',
    'Arms / hands': 'left-2 top-24',
    'Hips / glutes': 'left-1/2 top-36 -translate-x-1/2',
    'Legs / knees': 'left-1/2 bottom-8 -translate-x-1/2',
    Feet: 'left-1/2 bottom-0 -translate-x-1/2',
  };

  return (
    <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-slate-50 via-white to-cyan-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div><div className="text-sm font-black text-slate-800">Body map</div><div className="text-[11px] text-slate-500">{readOnly ? 'Highlighted areas were reported by the patient' : 'Select every affected area'}</div></div>
        <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-bold text-cyan-800">{selected.length} marked</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 max-w-4xl mx-auto">
        {views.map((view) => (
          <div key={view.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">{view.label}</div>
            <div className={`relative mx-auto h-52 w-24 ${view.id === 'left' || view.id === 'right' ? 'scale-x-75' : ''}`}>
              <div className="absolute left-1/2 top-1 h-8 w-8 -translate-x-1/2 rounded-full border-2 border-slate-400 bg-slate-50" />
              <div className="absolute left-1/2 top-8 h-28 w-16 -translate-x-1/2 rounded-[42%] border-2 border-slate-400 bg-slate-50" />
              <div className="absolute left-1/2 top-10 h-24 w-1 -translate-x-1/2 bg-slate-300/70" />
              <div className="absolute left-1/2 bottom-3 h-20 w-5 -translate-x-[13px] rounded-b-full border-2 border-t-0 border-slate-400 bg-slate-50" />
              <div className="absolute left-1/2 bottom-3 h-20 w-5 translate-x-[3px] rounded-b-full border-2 border-t-0 border-slate-400 bg-slate-50" />
              <div className="absolute left-1 top-14 h-24 w-3 -rotate-6 rounded-full border-2 border-slate-400 bg-slate-50" />
              <div className="absolute right-1 top-14 h-24 w-3 rotate-6 rounded-full border-2 border-slate-400 bg-slate-50" />
              {view.areas.map((area) => {
                const marked = selected.includes(area);
                return (
                <button key={`${view.id}-${area}`} type="button" title={area} aria-label={`${area}${marked ? ' (selected)' : ''}`} onClick={() => toggle(area)} disabled={readOnly} className={`absolute ${positions[area]} z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-black shadow transition ${marked ? 'bg-cyan-500 text-white ring-2 ring-cyan-200' : 'bg-slate-200/80 text-slate-500 hover:bg-cyan-200'} ${readOnly ? 'cursor-default' : ''}`}>
                  {marked ? selected.indexOf(area) + 1 : ''}
                </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {BODY_AREA_OPTIONS.map(([area]) => (
          <button key={area} type="button" onClick={() => toggle(area)} disabled={readOnly} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${selected.includes(area) ? 'border-cyan-400 bg-cyan-100 text-cyan-900' : 'border-slate-200 bg-white text-slate-500'} ${readOnly ? 'cursor-default' : ''}`}>{area}</button>
        ))}
      </div>
    </div>
  );
}

function TherapistDonutCard({ title, subtitle, segments, centerValue, centerLabel }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let offset = 0;
  const gradient = total
    ? segments.filter((segment) => segment.value > 0).map((segment) => {
      const start = offset;
      offset += (segment.value / total) * 100;
      return `${segment.color} ${start}% ${offset}%`;
    }).join(', ')
    : '#e2e8f0 0% 100%';

  return (
    <section className="min-h-[250px] rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 rounded-t-xl bg-sky-800 px-4 py-3 text-white">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-[10px] text-sky-100">{subtitle}</p>
        </div>
        <BarChart3 className="h-4 w-4 shrink-0 text-sky-100" />
      </header>
      <div className="flex min-h-[190px] items-center justify-between gap-3 p-4">
        <ul className="min-w-0 flex-1 space-y-2">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="min-w-0 flex-1 truncate">{segment.label}</span>
              <span className="font-semibold tabular-nums text-slate-800">{segment.value}</span>
            </li>
          ))}
        </ul>
        <div
          className="relative grid h-32 w-32 shrink-0 place-items-center rounded-full"
          role="img"
          aria-label={`${title}: ${segments.map((segment) => `${segment.label} ${segment.value}`).join(', ')}`}
          style={{ background: `conic-gradient(${gradient})` }}
        >
          <div className="grid h-[5.25rem] w-[5.25rem] place-content-center rounded-full bg-white text-center shadow-inner">
            <span className="text-xl font-bold leading-6 text-slate-900">{centerValue}</span>
            <span className="mt-0.5 max-w-[4.75rem] text-[9px] leading-3 text-slate-500">{centerLabel}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [companyPortalToken] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('companyToken') || '';
  });
  const [squarePaymentComplete, setSquarePaymentComplete] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return params.get('paymentComplete') === '1' ? (params.get('bookingId') || 'your booking') : '';
  });

  useEffect(() => {
    if (squarePaymentComplete && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('paymentComplete');
      url.searchParams.delete('bookingId');
      window.history.replaceState({}, '', url.toString());
    }
  }, [squarePaymentComplete]);
  const [viewMode, setViewMode] = useState('customer'); // 'customer' or 'admin'
  const [adminLang, setAdminLang] = useState('en'); // 'en' or 'th'
  const [servicesList, setServicesList] = useState(INITIAL_SERVICES);
  const [servicesError, setServicesError] = useState('');
  const [therapistsList, setTherapistsList] = useState(MOCK_THERAPISTS);
  const [therapistsError, setTherapistsError] = useState('');
  const [branchesList, setBranchesList] = useState(MOCK_BRANCHES);
  const [branchesError, setBranchesError] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState(1);

  const loadBranches = async () => {
    try {
      const response = await fetch('/api/booking?view=branches', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      if (Array.isArray(data.branches) && data.branches.length > 0) {
        setBranchesList(data.branches);
        setBranchesError('');
      }
    } catch (error) {
      setBranchesError(error.message || 'Unable to load branches; showing defaults.');
    }
  };

  const loadServices = async () => {
    try {
      const response = await fetch('/api/booking?view=services', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      if (Array.isArray(data.services) && data.services.length > 0) {
        setServicesList(data.services);
        setServicesError('');
      }
    } catch (error) {
      setServicesError(error.message || 'Unable to load services; showing defaults.');
    }
  };

  const loadTherapists = async () => {
    try {
      const response = await fetch('/api/booking?view=therapists', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      if (Array.isArray(data.therapists) && data.therapists.length > 0) {
        setTherapistsList(data.therapists);
        setTherapistsError('');
      }
    } catch (error) {
      setTherapistsError(error.message || 'Unable to load therapists; showing defaults.');
    }
  };

  useEffect(() => {
    loadBranches();
    loadServices();
    loadTherapists();
  }, []);

  const activeBranches = useMemo(
    () => branchesList.filter((branch) => branch.active !== false),
    [branchesList]
  );

  const activeServices = useMemo(
    () => servicesList.filter((service) => service.active !== false),
    [servicesList]
  );

  const activeTherapists = useMemo(
    () => therapistsList.filter((therapist) => therapist.active !== false),
    [therapistsList]
  );
  
  // Google Sheets API Webhook URL state
  const [sheetsWebhookUrl] = useState(() => {
    return localStorage.getItem('mtt_sheets_webhook_url') || '';
  });

  const [existingBookings, setExistingBookings] = useState([
    { id: 'MTT-1001', customerName: 'David Miller', phone: '416-555-0192', email: 'd.miller@gmail.com', serviceId: 2, serviceName: 'Thai Traditional Massage (60 min)', branchId: 1, therapistId: 1, therapistName: 'Kanya S.', date: '2026-09-19', time: '11:00 AM', status: 'Confirmed', paidAmount: 20, total: 107.35, syncedToSheets: true },
    { id: 'MTT-1002', customerName: 'Sarah Jenkins', phone: '905-555-0143', email: 's.jenkins@yahoo.ca', serviceId: 11, serviceName: 'Thai Combo Swedish + Hot Stone (60 min)', branchId: 1, therapistId: 2, therapistName: 'Michael T., RMT', date: '2026-09-19', time: '01:00 PM', status: 'Completed', paidAmount: 118.65, total: 118.65, syncedToSheets: true },
    { id: 'MTT-1003', customerName: 'Amanda Wong', phone: '647-555-0821', email: 'amanda.wong@outlook.com', serviceId: 18, serviceName: 'Registered Massage Therapy (RMT 60 min)', branchId: 2, therapistId: 4, therapistName: 'Somchai R., RMT', date: '2026-09-19', time: '02:30 PM', status: 'Confirmed', paidAmount: 30, total: 120.00, syncedToSheets: true }
  ]);

  if (companyPortalToken) {
    return <CompanyPortal token={companyPortalToken} />;
  }

  return (
    <div className="min-h-screen bg-stone-100 font-sans text-stone-800 flex flex-col justify-between">
      {squarePaymentComplete && (
        <div role="status" className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-emerald-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white">
          <span>Payment received for booking {squarePaymentComplete}. A receipt confirmation email is on its way.</span>
          <button
            type="button"
            onClick={() => setSquarePaymentComplete('')}
            className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold hover:bg-white/20 transition"
          >
            Dismiss
          </button>
        </div>
      )}
      <header className={`sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 shadow-sm sm:px-6 ${viewMode === 'therapist' ? 'border-slate-800 bg-black text-white' : 'border-slate-200 bg-white text-slate-900'}`}>
        <div className="flex items-center space-x-2 font-semibold tracking-wide">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-950 text-xs font-black tracking-tight text-white shadow-sm">M</span>
          <span className={`text-lg font-bold tracking-tight ${viewMode === 'therapist' ? 'text-white' : 'text-slate-950'}`}>MedBook</span>
          <span className={`hidden rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider sm:inline-flex ${viewMode === 'therapist' ? 'border border-slate-700 bg-slate-900 text-slate-300' : 'border border-emerald-100 bg-emerald-50 text-emerald-800'}`}>Practice platform</span>
        </div>
        <nav aria-label="Platform views" className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode('customer')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              viewMode === 'customer'
                ? 'bg-emerald-950 text-white shadow-sm'
                : viewMode === 'therapist' ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            Booking portal
          </button>
          <button
            onClick={() => setViewMode('admin')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              viewMode === 'admin'
                ? 'bg-emerald-950 text-white shadow-sm'
                : viewMode === 'therapist' ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            Owner dashboard
          </button>
          <button
            onClick={() => setViewMode('therapist')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              viewMode === 'therapist' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            Therapist
          </button>
        </nav>
      </header>

      {/* Main View Switcher */}
      <main className={`flex-1 w-full ${viewMode === 'admin' || viewMode === 'therapist' ? 'p-0' : 'p-3 sm:p-6 max-w-7xl mx-auto'}`}>
        {viewMode === 'customer' ? (
          <CustomerPortal 
            branches={activeBranches} 
            services={activeServices} 
            therapists={activeTherapists}
            sheetsWebhookUrl={sheetsWebhookUrl}
            onNewBooking={(newBkg) => setExistingBookings(prev => [newBkg, ...prev])}
          />
        ) : viewMode === 'admin' ? (
          <AdminGate>
            <AdminPortal
              branches={branchesList}
              onBranchesChange={setBranchesList}
              branchesError={branchesError}
              services={servicesList}
              onServicesChange={setServicesList}
              servicesError={servicesError}
              therapists={therapistsList}
              onTherapistsChange={setTherapistsList}
              therapistsError={therapistsError}
              bookings={existingBookings}
              setBookings={setExistingBookings}
              selectedBranchId={selectedBranchId}
              setSelectedBranchId={setSelectedBranchId}
              lang={adminLang}
              setLang={setAdminLang}
            />
          </AdminGate>
        ) : (
          <TherapistPortal />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-stone-900 text-stone-400 text-xs py-4 px-6 text-center border-t border-stone-800">
        <p>© 2026 MY THAI THAI MASSAGE AND WELLNESS INC. All rights reserved. • Toronto & Mississauga, Ontario</p>
      </footer>
    </div>
  );
}

// Self-service portal for a Platinum company's primary contact, reached via a private magic
// link (?companyToken=...) emailed when their company is enrolled. No login is required — the
// token itself proves the contact's identity, mirroring the existing unsubscribe-link pattern.
function CompanyPortal({ token }) {
  const { businessName, photoUrl } = useBusinessBranding();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signupForm, setSignupForm] = useState({ name: '', email: '', phone: '' });
  const [signupSubmitting, setSignupSubmitting] = useState(false);
  const [signupMessage, setSignupMessage] = useState('');
  const [signupError, setSignupError] = useState('');
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkError, setBulkError] = useState('');
  const bulkFileInputRef = React.useRef(null);

  const loadPortal = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/booking?view=company-portal&token=${encodeURIComponent(token)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to load your company portal.');
      setData(result);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load your company portal.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submitSignup = async (event) => {
    event.preventDefault();
    setSignupSubmitting(true);
    setSignupError('');
    setSignupMessage('');
    try {
      const response = await fetch('/api/booking?view=company-portal-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...signupForm }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to sign up this employee.');
      setSignupMessage(`${signupForm.name} was signed up for Platinum${result.emailSent ? ' and their welcome email was sent.' : ', but their welcome email could not be sent — the clinic can resend it.'}`);
      setSignupForm({ name: '', email: '', phone: '' });
      loadPortal();
    } catch (requestError) {
      setSignupError(requestError.message || 'Unable to sign up this employee.');
    } finally {
      setSignupSubmitting(false);
    }
  };

  // Reads an uploaded .xlsx/.xls/.csv file and maps its rows onto employee
  // { name, email, phone } records regardless of the exact column header wording, so the
  // company owner never has to fill out the onboarding form one employee at a time.
  const pickColumn = (headerRow, aliases) => {
    const normalized = headerRow.map((cell) => String(cell || '').trim().toLowerCase());
    for (const alias of aliases) {
      const index = normalized.indexOf(alias);
      if (index >= 0) return index;
    }
    return -1;
  };

  const handleBulkFile = async (event) => {
    const file = event.target.files?.[0];
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
    if (!file) return;
    setBulkUploading(true);
    setBulkMessage('');
    setBulkError('');
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      if (!rows.length) throw new Error('This file does not have any rows.');
      const [headerRow, ...bodyRows] = rows;
      const firstNameIndex = pickColumn(headerRow, ['first name', 'firstname', 'first']);
      const lastNameIndex = pickColumn(headerRow, ['last name', 'lastname', 'last']);
      const fullNameIndex = pickColumn(headerRow, ['name', 'full name', 'employee name']);
      const emailIndex = pickColumn(headerRow, ['email', 'email address', 'employee email']);
      const phoneIndex = pickColumn(headerRow, ['phone', 'phone number', 'mobile']);
      if (emailIndex < 0 || (fullNameIndex < 0 && firstNameIndex < 0)) {
        throw new Error('The file needs an Email column and a Name (or First Name/Last Name) column.');
      }
      const employees = bodyRows
        .map((row) => {
          const name = fullNameIndex >= 0
            ? String(row[fullNameIndex] || '').trim()
            : [row[firstNameIndex], row[lastNameIndex]].filter(Boolean).map((part) => String(part).trim()).join(' ');
          return {
            name,
            email: String(row[emailIndex] || '').trim(),
            phone: phoneIndex >= 0 ? String(row[phoneIndex] || '').trim() : '',
          };
        })
        .filter((employee) => employee.name || employee.email);
      if (!employees.length) throw new Error('No employee rows were found in this file.');
      const response = await fetch('/api/booking?view=company-portal-bulk-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, employees }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to bulk-upload this employee list.');
      setBulkMessage(`Onboarded ${result.createdCount} employee${result.createdCount === 1 ? '' : 's'}${result.skippedCount ? `, skipped ${result.skippedCount} (already enrolled or missing details)` : ''}.`);
      loadPortal();
    } catch (requestError) {
      setBulkError(requestError.message || 'Unable to bulk-upload this employee list.');
    } finally {
      setBulkUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 font-sans text-stone-800">
      <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-950 text-xs font-black tracking-tight text-white">M</span>
          )}
          <div>
            <p className="text-lg font-bold tracking-tight text-slate-950">{businessName || 'MY THAI THAI'}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Platinum company portal{data?.organization ? ` · ${data.organization}` : ''}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
        {loading ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading your company portal…</p>
        ) : error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">{error}</p>
        ) : data ? (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employees enrolled</p>
                <p className="mt-1 text-2xl font-bold text-slate-950">{data.totals.employeeCount}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shared hours remaining</p>
                <p className="mt-1 text-2xl font-bold text-emerald-800">{data.totals.hoursBalance.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hours topped up (all-time)</p>
                <p className="mt-1 text-2xl font-bold text-slate-950">{data.totals.hoursToppedUpAllTime.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hours used (all-time)</p>
                <p className="mt-1 text-2xl font-bold text-slate-950">{data.totals.hoursUsedAllTime.toFixed(2)}</p>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Employees using Platinum</h2>
              <p className="mt-1 text-xs text-slate-500">All employees share one prepaid-hour balance. Only the primary contact (marked below) can add funds — contact the clinic to change who that is.</p>
              {data.employees.length ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Email</th>
                        <th className="py-2 pr-3">Enrolled</th>
                        <th className="py-2 pr-3">Role</th>
                        <th className="py-2 pr-3">Hours used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.employees.map((employee) => (
                        <tr key={employee.email} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-3 font-medium text-slate-900">{employee.name || '—'}</td>
                          <td className="py-2 pr-3 text-slate-600">{employee.email}</td>
                          <td className="py-2 pr-3 text-slate-600">{employee.enrolledAt ? new Date(employee.enrolledAt).toLocaleDateString() : '—'}</td>
                          <td className="py-2 pr-3">
                            {employee.isPrimaryContact ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"><Crown className="h-3 w-3" /> Primary contact</span>
                            ) : (
                              <span className="text-[11px] text-slate-400">Employee</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 font-semibold text-slate-900">{(employee.hoursUsedByEmployee || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No employees are signed up yet — use the form below to add your first one.</p>
              )}
            </section>


            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Recent activity</h2>
              {data.usage.length ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Employee</th>
                        <th className="py-2 pr-3">Service</th>
                        <th className="py-2 pr-3">Hours used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.usage.map((entry, index) => (
                        <tr key={`${entry.bookingId}-${index}`} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-3 text-slate-600">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}</td>
                          <td className="py-2 pr-3 font-medium text-slate-900">{entry.employeeName || entry.email}</td>
                          <td className="py-2 pr-3 text-slate-600">{entry.description}</td>
                          <td className="py-2 pr-3 font-semibold text-slate-900">{entry.hoursUsed.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No employee has used a Platinum session yet.</p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Top-up history</h2>
              {data.topUps.length ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Employee</th>
                        <th className="py-2 pr-3">Hours added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topUps.map((entry, index) => (
                        <tr key={index} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-3 text-slate-600">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}</td>
                          <td className="py-2 pr-3 font-medium text-slate-900">{entry.employeeName || entry.email}</td>
                          <td className="py-2 pr-3 font-semibold text-emerald-800">+{entry.hoursAdded.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No top-up payments have been recorded yet — contact the clinic to top up.</p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Sign up a new employee</h2>
                <div>
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    id="company-portal-bulk-upload"
                    onChange={handleBulkFile}
                  />
                  <label
                    htmlFor="company-portal-bulk-upload"
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-800 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 ${bulkUploading ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <Upload className="h-4 w-4" /> {bulkUploading ? 'Uploading…' : 'Upload employee list (Excel/CSV)'}
                  </label>
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-500">New employees start at 0 personal usage — they draw from the shared company balance once the primary contact tops it up. Bulk file needs Name (or First/Last Name) and Email columns.</p>
              {bulkMessage && <p className="mt-2 text-sm font-medium text-emerald-800">{bulkMessage}</p>}
              {bulkError && <p className="mt-2 text-sm font-medium text-rose-700">{bulkError}</p>}
              <form onSubmit={submitSignup} className="mt-3 grid gap-3 sm:grid-cols-3">
                <input
                  type="text"
                  required
                  placeholder="Employee name"
                  value={signupForm.name}
                  onChange={(event) => setSignupForm((current) => ({ ...current, name: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="email"
                  required
                  placeholder="Employee email"
                  value={signupForm.email}
                  onChange={(event) => setSignupForm((current) => ({ ...current, email: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={signupForm.phone}
                  onChange={(event) => setSignupForm((current) => ({ ...current, phone: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={signupSubmitting}
                  className="rounded-lg bg-emerald-950 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 sm:col-span-3 sm:w-fit"
                >
                  {signupSubmitting ? 'Signing up…' : 'Sign up employee'}
                </button>
              </form>
              {signupMessage && <p className="mt-2 text-sm font-medium text-emerald-800">{signupMessage}</p>}
              {signupError && <p className="mt-2 text-sm font-medium text-rose-700">{signupError}</p>}
            </section>
          </div>
        ) : null}
      </main>

      <footer className="bg-stone-900 px-4 py-4 text-center text-xs text-stone-400">
        <p>© 2026 MY THAI THAI MASSAGE AND WELLNESS INC. All rights reserved.</p>
      </footer>
    </div>
  );
}

function TherapistPortal() {
  const [therapist, setTherapist] = useState(null);
  const { businessName, photoUrl, error: brandingError } = useBusinessBranding();
  const [appointments, setAppointments] = useState([]);
  const [patientNotes, setPatientNotes] = useState([]);
  const [rebookingReminders, setRebookingReminders] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({ upcomingCount: 0, flaggedCount: 0 });
  const [therapistProfile, setTherapistProfile] = useState({ branchNames: [], attendedHours: 0, attendedClientCount: 0, weeklySchedule: [], todayBranchName: null });
  const [attendedClients, setAttendedClients] = useState([]);
  const [calendarView, setCalendarView] = useState('agenda');
  const [calendarDate, setCalendarDate] = useState(new Date().toISOString().slice(0, 10));
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [workspaceView, setWorkspaceView] = useState('dashboard');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [professionalProfile, setProfessionalProfile] = useState({ email: '', phone: '', specialties: '', certifications: '', bio: '', updatedAt: '' });
  const [profileForm, setProfileForm] = useState({ email: '', phone: '', specialties: '', certifications: '', bio: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [noteForm, setNoteForm] = useState({ bookingId: '', category: 'Treatment note', note: '' });
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [noteMessage, setNoteMessage] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('');
  const [signupComplete, setSignupComplete] = useState('');

  const loadAppointments = async () => {
    const response = await fetch(`/api/booking?view=therapist-dashboard&calendarView=${calendarView}&date=${encodeURIComponent(calendarDate)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to load therapist appointments');
    setTherapist(data.therapist);
    setAppointments(data.appointments || []);
    setPatientNotes(data.patientNotes || []);
    setRebookingReminders(data.rebookingReminders || []);
    setSelectedAppointment((current) => current || data.appointments?.[0] || null);
    setSummary(data.summary || { upcomingCount: (data.appointments || []).length, flaggedCount: 0 });
    setTherapistProfile(data.profile || { branchNames: [], attendedHours: 0, attendedClientCount: 0, weeklySchedule: [], todayBranchName: null });
    const savedProfile = data.professionalProfile || { email: '', phone: '', specialties: '', certifications: '', bio: '', updatedAt: '' };
    setProfessionalProfile(savedProfile);
    setProfileForm({
      email: savedProfile.email || '',
      phone: savedProfile.phone || '',
      specialties: savedProfile.specialties || '',
      certifications: savedProfile.certifications || '',
      bio: savedProfile.bio || '',
    });
    setAttendedClients(data.attended || []);
    setCalendarEvents(data.calendarEvents || []);
  };

  const savePatientNote = async (event) => {
    event.preventDefault();
    setNoteSaving(true);
    setNoteError('');
    setNoteMessage('');
    try {
      const response = await fetch('/api/booking?view=therapist-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noteForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save patient note.');
      setPatientNotes((current) => [data.note, ...current]);
      setNoteForm((current) => ({ ...current, note: '' }));
      setNoteMessage('Note saved to this patient’s therapist record.');
    } catch (requestError) {
      setNoteError(requestError.message || 'Unable to save patient note.');
    } finally {
      setNoteSaving(false);
    }
  };

  const saveProfessionalProfile = async (event) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError('');
    setProfileMessage('');
    try {
      const response = await fetch('/api/booking?view=therapist-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save your profile.');
      setProfessionalProfile(data.profile);
      setProfileForm({
        email: data.profile.email || '',
        phone: data.profile.phone || '',
        specialties: data.profile.specialties || '',
        certifications: data.profile.certifications || '',
        bio: data.profile.bio || '',
      });
      setProfileMessage('Your professional profile has been saved.');
    } catch (requestError) {
      setProfileError(requestError.message || 'Unable to save your profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  useEffect(() => {
    fetch('/api/booking?view=therapist-session')
      .then(async (response) => {
        if (response.ok) await loadAppointments();
      })
      .catch(() => {});
  }, [calendarView, calendarDate]);

  const signIn = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/booking?view=therapist-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Sign-in failed');
      setTherapist(data.therapist);
      await loadAppointments();
    } catch (signInError) {
      setError(signInError.message || 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSignupComplete('');
    try {
      const response = await fetch('/api/booking?view=therapist-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Registration failed');
      setSignupComplete(data.message);
      setPassword('');
    } catch (signupError) {
      setError(signupError.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (!therapist) {
    return (
      <div className="max-w-md mx-auto my-10 bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
        <h1 className="text-xl font-bold text-stone-900">{isSignup ? 'Create therapist account' : 'Therapist sign in'}</h1>
        <p className="text-sm text-stone-500 mt-1 mb-5">{isSignup ? 'Register once. An administrator must approve your account before access is enabled.' : 'Sign in to view your upcoming appointments and limited patient safety notes.'}</p>
        <form onSubmit={isSignup ? signUp : signIn} className="space-y-3">
          {isSignup && <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name (for example, Kanya S.)" className="w-full p-3 rounded-xl border border-stone-300" />}
          <input required value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Username" className="w-full p-3 rounded-xl border border-stone-300" />
          <input required minLength={12} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder={isSignup ? 'Password (at least 12 characters)' : 'Password'} className="w-full p-3 rounded-xl border border-stone-300" />
          {error && <p className="text-xs text-red-700">{error}</p>}
          {signupComplete && <p className="text-xs text-emerald-700">{signupComplete}</p>}
          <button disabled={loading} className="w-full py-3 bg-blue-700 text-white rounded-xl font-bold disabled:opacity-50">{loading ? (isSignup ? 'Registering...' : 'Signing in...') : (isSignup ? 'Register account' : 'Sign in')}</button>
        </form>
        <button type="button" onClick={() => { setIsSignup((current) => !current); setError(''); setSignupComplete(''); }} className="w-full mt-4 text-sm text-blue-700 underline">
          {isSignup ? 'Already registered? Sign in' : 'First time here? Create an account'}
        </button>
      </div>
    );
  }

  const hasProfessionalProfile = Boolean(
    professionalProfile.email || professionalProfile.phone || professionalProfile.specialties ||
    professionalProfile.certifications || professionalProfile.bio,
  );
  const treatmentCounts = Object.entries(appointments.reduce((counts, appointment) => {
    const label = appointment.serviceName || 'Other treatment';
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {})).sort((first, second) => second[1] - first[1]);
  const treatmentSegments = treatmentCounts.slice(0, 3)
    .map(([label, value], index) => ({
      label,
      value,
      color: ['#f59e0b', '#4f8fe8', '#18b77a', '#a84bd1'][index],
    }));
  const otherTreatmentCount = treatmentCounts.slice(3).reduce((sum, [, value]) => sum + value, 0);
  if (otherTreatmentCount) {
    treatmentSegments.push({ label: 'Other treatments', value: otherTreatmentCount, color: '#a84bd1' });
  }
  const pressureSegments = ['Light', 'Medium', 'Firm', 'Extra Firm'].map((label, index) => ({
    label,
    value: appointments.filter((appointment) => appointment.pressure?.toLowerCase() === label.toLowerCase()).length,
    color: ['#4f8fe8', '#f59e0b', '#18b77a', '#a84bd1'][index],
  })).concat([{
    label: 'Not recorded',
    value: appointments.filter((appointment) => !appointment.pressure).length,
    color: '#94a3b8',
  }]);
  const notesSegments = [
    { label: 'Notes recorded', value: appointments.filter((appointment) => appointment.painAreas || appointment.additionalDetails || appointment.bodyAreas).length, color: '#4f8fe8' },
    { label: 'No notes recorded', value: appointments.filter((appointment) => !appointment.painAreas && !appointment.additionalDetails && !appointment.bodyAreas).length, color: '#a84bd1' },
  ];
  const patientRecords = [...new Map(
    [...appointments, ...attendedClients].map((patient) => [patient.bookingId, patient]),
  ).values()];
  const selectedNotePatient = patientRecords.find((patient) => patient.bookingId === noteForm.bookingId);
  const pageTitle = {
    dashboard: 'Dashboard',
    appointments: 'Upcoming appointments',
    notes: 'Patient notes',
    reminders: 'Rebooking reminders',
    profile: 'My profile',
  }[workspaceView] || 'Dashboard';

  return (
    <div className="min-h-[calc(100vh-7rem)] bg-slate-100">
      <header className="flex min-h-14 items-center justify-between gap-4 bg-black px-4 py-2 text-white shadow-sm sm:px-6">
        <div className="flex items-center gap-3">
          <BusinessPhoto businessName={businessName} photoUrl={photoUrl} className="h-9 w-9 rounded-lg border border-white/40 object-cover text-xs" />
          <div><p className="text-sm font-black tracking-wide">{businessName}</p><p className="text-[9px] uppercase tracking-[0.18em] text-blue-100">Therapist portal</p>{brandingError && <p role="status" className="text-[9px] text-amber-200">{brandingError}</p>}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-blue-100 sm:inline">{new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</span>
          <button type="button" onClick={async () => { setRefreshing(true); try { await loadAppointments(); } catch (refreshError) { setError(refreshError.message || 'Unable to refresh therapist data'); } finally { setRefreshing(false); } }} disabled={refreshing} aria-label="Refresh dashboard" className="rounded-lg p-2 transition hover:bg-slate-800 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={() => { setWorkspaceView('profile'); setProfileMenuOpen(true); }} aria-label="Open therapist profile" className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/70 bg-slate-800 text-sm font-semibold">
            {(therapist.name || 'T').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
          </button>
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-10.5rem)] flex-col lg:flex-row">
      <aside className="w-full shrink-0 bg-black px-3 py-3 text-white lg:min-h-[calc(100vh-10.5rem)] lg:w-60 lg:px-3">
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-900 px-3 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-sm font-black text-emerald-200">
            {(therapist.name || 'T').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{therapist.name}</p>
            <p className="text-xs text-slate-400">Therapist account</p>
          </div>
        </div>
        <nav aria-label="Therapist workspace" className="flex gap-1 overflow-x-auto lg:flex-col">
          <button
            type="button"
            onClick={() => setWorkspaceView('dashboard')}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition lg:w-full ${workspaceView === 'dashboard' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-white'}`}
          >
            <Home className="h-4 w-4" />
            <span className="flex-1 whitespace-nowrap">Dashboard</span>
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceView('appointments')}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition lg:w-full ${workspaceView === 'appointments' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-white'}`}
          >
            <CalendarDays className="h-4 w-4" />
            <span className="flex-1">Appointments</span>
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceView('notes')}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition lg:w-full ${workspaceView === 'notes' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-white'}`}
          >
            <Stethoscope className="h-4 w-4" />
            <span className="flex-1 whitespace-nowrap">Patient notes</span>
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceView('reminders')}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition lg:w-full ${workspaceView === 'reminders' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-white'}`}
          >
            <Clock className="h-4 w-4" />
            <span className="flex-1 whitespace-nowrap">Rebooking reminders</span>
            {rebookingReminders.length > 0 && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">{rebookingReminders.length}</span>}
          </button>
          <div className={`relative rounded-lg ${workspaceView === 'profile' ? 'bg-slate-800' : ''}`}>
            <button
              type="button"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((open) => !open)}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition lg:w-full ${workspaceView === 'profile' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-900 hover:text-white'}`}
            >
              <UserRound className="h-4 w-4" />
              <span className="flex-1 whitespace-nowrap">My profile</span>
              <ChevronRight className={`h-4 w-4 transition-transform ${profileMenuOpen ? 'rotate-90' : ''}`} />
            </button>
            {profileMenuOpen && (
              <div className="absolute z-20 mt-1 rounded-xl bg-slate-900 p-2 shadow-lg lg:static lg:mb-2 lg:ml-5 lg:border-l lg:border-slate-700 lg:bg-transparent lg:pl-3 lg:shadow-none">
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceView('profile');
                    setProfileError('');
                    setProfileMessage('');
                  }}
                  className={`w-full whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm font-medium ${workspaceView === 'profile' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                >
                  {hasProfessionalProfile ? 'Edit professional profile' : 'Create professional profile'}
                </button>
                <p className="px-3 pt-2 text-xs leading-5 text-slate-400">
                  {hasProfessionalProfile ? 'Update your contact and practice details.' : 'Add your contact and practice details.'}
                </p>
              </div>
            )}
          </div>
        </nav>
        <div className="mt-3 hidden border-t border-slate-800 px-3 pt-3 lg:block">
          <div className={`text-[10px] font-bold uppercase tracking-wide ${hasProfessionalProfile ? 'text-emerald-200' : 'text-amber-200'}`}>
            {hasProfessionalProfile ? 'Profile added' : 'Profile setup needed'}
          </div>
          <p className="mt-1 truncate text-xs text-slate-400">{professionalProfile.specialties || 'Add your professional details'}</p>
        </div>
        <button type="button" onClick={async () => { await fetch('/api/booking?view=therapist-logout', { method: 'POST' }); setTherapist(null); setAppointments([]); setPatientNotes([]); }} className="mt-1 flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-slate-300 transition hover:bg-slate-900 hover:text-white lg:mt-5 lg:w-full">
          <X className="h-4 w-4" /><span>Sign out</span>
        </button>
      </aside>
      <div className="min-w-0 flex-1 space-y-5 p-3 sm:p-5 lg:p-6">
      {workspaceView === 'profile' ? (
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-emerald-900 px-6 py-6 text-white sm:px-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10"><UserRound className="h-6 w-6" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Therapist profile</p>
                <h1 className="mt-1 text-2xl font-black">{hasProfessionalProfile ? 'Update your profile' : 'Create your profile'}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Share your professional contact information and treatment experience with your clinic team. Your account name and sign-in details are managed separately.</p>
              </div>
            </div>
          </div>
          <form onSubmit={saveProfessionalProfile} className="space-y-6 p-5 sm:p-8">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Account name</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{therapist.name}</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-700">
                Professional email
                <input
                  type="email"
                  maxLength={254}
                  value={profileForm.email}
                  onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="name@example.com"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm font-normal outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Phone number
                <input
                  type="tel"
                  maxLength={40}
                  value={profileForm.phone}
                  onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="+1 416 555 0123"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm font-normal outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700 sm:col-span-2">
                Specialties
                <input
                  maxLength={300}
                  value={profileForm.specialties}
                  onChange={(event) => setProfileForm((current) => ({ ...current, specialties: event.target.value }))}
                  placeholder="Thai massage, deep tissue, hot stone"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm font-normal outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700 sm:col-span-2">
                Certifications and credentials
                <input
                  maxLength={300}
                  value={profileForm.certifications}
                  onChange={(event) => setProfileForm((current) => ({ ...current, certifications: event.target.value }))}
                  placeholder="RMT registration, training, professional credentials"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm font-normal outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700 sm:col-span-2">
                About you
                <textarea
                  rows={5}
                  maxLength={1200}
                  value={profileForm.bio}
                  onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))}
                  placeholder="Describe your experience and approach to care."
                  className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3.5 py-3 text-sm font-normal leading-6 outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                />
                <span className="mt-1 block text-right text-[10px] font-normal text-slate-400">{profileForm.bio.length}/1200</span>
              </label>
            </div>
            {profileError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{profileError}</p>}
            {profileMessage && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{profileMessage}</p>}
            {professionalProfile.updatedAt && <p className="text-[11px] text-slate-400">Last updated {new Date(professionalProfile.updatedAt).toLocaleString()}</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 pt-5">
              <button type="button" onClick={() => { setWorkspaceView('dashboard'); setProfileError(''); setProfileMessage(''); }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={profileSaving} className="rounded-xl bg-emerald-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">{profileSaving ? 'Saving…' : hasProfessionalProfile ? 'Save profile' : 'Create profile'}</button>
            </div>
          </form>
        </section>
      ) : workspaceView === 'notes' ? (
        <section className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Clinical workspace</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Patient notes</h1>
            <p className="mt-1 text-sm text-slate-600">Create and review private notes linked to an appointment assigned to you.</p>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <form onSubmit={savePatientNote} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-800"><FileText className="h-5 w-5" /></span>
                <div><h2 className="text-base font-semibold text-slate-900">Add a patient note</h2><p className="text-xs text-slate-500">Saved to your therapist record for this appointment.</p></div>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Patient / appointment
                <select
                  required
                  value={noteForm.bookingId}
                  onChange={(event) => setNoteForm((current) => ({ ...current, bookingId: event.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Select an assigned patient</option>
                  {patientRecords.map((patient) => (
                    <option key={patient.bookingId} value={patient.bookingId}>
                      {patient.patientName} — {patient.date} {patient.time} ({patient.bookingId})
                    </option>
                  ))}
                </select>
              </label>
              {selectedNotePatient && (
                <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">{selectedNotePatient.serviceName}</span>
                  <span> · {selectedNotePatient.branchName || 'Branch not recorded'}</span>
                </div>
              )}
              <label className="block text-sm font-medium text-slate-700">
                Note type
                <select
                  value={noteForm.category}
                  onChange={(event) => setNoteForm((current) => ({ ...current, category: event.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
                >
                  {['Treatment note', 'Progress update', 'Follow-up', 'Rebooking'].map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Note
                <textarea
                  required
                  rows={7}
                  maxLength={3000}
                  value={noteForm.note}
                  onChange={(event) => setNoteForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Add relevant treatment observations or follow-up details."
                  className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm leading-6 outline-none focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
                />
                <span className="mt-1 block text-right text-xs text-slate-400">{noteForm.note.length}/3000</span>
              </label>
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">Keep notes professional and relevant to care. Do not include information that is not needed for treatment.</p>
              {noteError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{noteError}</p>}
              {noteMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{noteMessage}</p>}
              <button type="submit" disabled={noteSaving || !patientRecords.length} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                <Plus className="h-4 w-4" />{noteSaving ? 'Saving note…' : 'Save patient note'}
              </button>
              {!patientRecords.length && <p className="text-xs text-slate-500">No assigned appointments are available to attach a note to.</p>}
            </form>
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div><h2 className="text-base font-semibold text-slate-900">Recent notes</h2><p className="mt-1 text-xs text-slate-500">Notes you have saved for your assigned patients.</p></div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{patientNotes.length}</span>
              </div>
              {patientNotes.length ? (
                <div className="max-h-[700px] divide-y divide-slate-100 overflow-y-auto">
                  {patientNotes.map((patientNote) => (
                    <article key={patientNote.noteId} className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><h3 className="text-sm font-semibold text-slate-900">{patientNote.patientName}</h3><p className="mt-1 text-xs text-slate-500">{patientNote.category} · {patientNote.bookingId}</p></div>
                        <time className="text-xs text-slate-400">{patientNote.createdAt ? new Date(patientNote.createdAt).toLocaleString() : 'Date not recorded'}</time>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{patientNote.note}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <FileText className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-700">No therapist notes yet</p>
                  <p className="mt-1 text-xs text-slate-500">Notes you save will appear here.</p>
                </div>
              )}
            </section>
          </div>
        </section>
      ) : workspaceView === 'reminders' ? (
        <section className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Patient retention</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Rebooking reminders</h1>
            <p className="mt-1 text-sm text-slate-600">Patients last seen at least 30 days ago who do not have another upcoming appointment.</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-5 text-blue-900">
            These are suggested follow-ups based on appointment history. No message is sent automatically.
          </div>
          {rebookingReminders.length ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Patient</span><span>Last appointment</span><span>Contact</span><span>Action</span>
              </div>
              <div className="divide-y divide-slate-100">
                {rebookingReminders.map((reminder) => (
                  <article key={reminder.bookingId} className="grid grid-cols-1 items-center gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <div><h2 className="text-sm font-semibold text-slate-900">{reminder.patientName}</h2><p className="mt-1 text-xs text-slate-500">{reminder.serviceName} · {reminder.branchName}</p><span className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">{reminder.daysSinceLastVisit} days since visit</span></div>
                    <p className="text-sm text-slate-700">{reminder.date}<span className="block text-xs text-slate-500">{reminder.time}</span></p>
                    <div className="space-y-1 text-sm">
                      {reminder.phone ? <a className="block text-slate-700 underline decoration-slate-300 underline-offset-2" href={`tel:${reminder.phone}`}>{reminder.phone}</a> : <span className="block text-xs text-slate-400">No phone recorded</span>}
                      {reminder.email ? <a className="block break-all text-xs text-slate-600 underline decoration-slate-300 underline-offset-2" href={`mailto:${reminder.email}`}>{reminder.email}</a> : <span className="block text-xs text-slate-400">No email recorded</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNoteForm({ bookingId: reminder.bookingId, category: 'Rebooking', note: '' });
                        setNoteMessage('');
                        setNoteError('');
                        setWorkspaceView('notes');
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
                    >
                      <FileText className="h-3.5 w-3.5" />Add follow-up note
                    </button>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <Clock className="mx-auto h-8 w-8 text-slate-300" />
              <h2 className="mt-3 text-sm font-semibold text-slate-800">No follow-ups due</h2>
              <p className="mt-1 text-sm text-slate-500">Patients with a visit at least 30 days ago and no future booking will appear here.</p>
            </div>
          )}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-900">Recent patient history</h2><p className="mt-1 text-xs text-slate-500">Past appointments assigned to you.</p></div>
            {attendedClients.length ? (
              <div className="divide-y divide-slate-100">
                {attendedClients.slice(0, 8).map((patient) => (
                  <div key={`history-${patient.bookingId}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div><p className="text-sm font-medium text-slate-800">{patient.patientName}</p><p className="mt-1 text-xs text-slate-500">{patient.date} · {patient.serviceName}</p></div>
                    <span className="text-xs text-slate-500">{patient.branchName} · {patient.durationMinutes} min</span>
                  </div>
                ))}
              </div>
            ) : <p className="p-5 text-sm text-slate-500">No past appointments are available.</p>}
          </section>
        </section>
      ) : (
        <>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Therapist workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{pageTitle}</h1>
        </div>
        {workspaceView === 'dashboard' && <button type="button" onClick={() => setWorkspaceView('appointments')} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"><CalendarDays className="h-4 w-4" /> View schedule</button>}
      </div>
      {workspaceView === 'dashboard' && (
      <>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-indigo-900">This week's branch rotation</h2>
          <span className="rounded-full bg-indigo-900 px-3 py-1 text-[11px] font-bold text-white">Today: {therapistProfile.todayBranchName || 'Not scheduled'}</span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
          {(therapistProfile.weeklySchedule || []).map((entry) => (
            <div key={entry.day} className="rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-center">
              <p className="text-[10px] font-bold uppercase text-indigo-500">{entry.day}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-800 leading-tight">{entry.branchName || 'Off'}</p>
            </div>
          ))}
          {(!therapistProfile.weeklySchedule || therapistProfile.weeklySchedule.length === 0) && (
            <p className="col-span-full text-xs text-indigo-800">No weekly rotation has been configured for you yet by the owner dashboard.</p>
          )}
        </div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[270px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center gap-4 border-b border-slate-100 p-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-slate-100">
              <div className="grid h-12 w-12 place-items-center rounded-full border-[5px] border-blue-600 bg-white text-blue-700"><CalendarDays className="h-5 w-5" /></div>
            </div>
            <div><p className="text-2xl font-bold text-blue-700">{appointments.length}</p><p className="text-xs font-semibold leading-4 text-slate-700">Appointments in your queue</p></div>
          </header>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Upcoming patients</h2>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800">{appointments.length}</span>
          </div>
          <div className="max-h-[390px] divide-y divide-slate-100 overflow-y-auto">
            {appointments.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">No upcoming appointments assigned to you.</p>
            ) : appointments.map((appointment, index) => (
              <button
                key={`rail-${appointment.bookingId}`}
                type="button"
                onClick={() => { setSelectedAppointment(appointment); setWorkspaceView('appointments'); }}
                className={`flex w-full items-start gap-3 p-3 text-left transition hover:bg-blue-50 ${selectedAppointment?.bookingId === appointment.bookingId ? 'bg-blue-50' : ''}`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${['bg-rose-500', 'bg-slate-800', 'bg-purple-600', 'bg-blue-700'][index % 4]}`}>
                  {(appointment.patientName || 'P').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-slate-900">{appointment.patientName}</span>
                    <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-800">{appointment.time}</span>
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-slate-500">{appointment.serviceName}</span>
                  <span className="mt-1 block text-[10px] text-slate-400">{appointment.date} · {appointment.branchName}</span>
                  {(appointment.hasReportedConditions || appointment.allergiesToOil) && <span className="mt-2 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-700">Review patient notes</span>}
                </span>
              </button>
            ))}
          </div>
          <footer className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[10px] text-slate-500">
            Schedule data from your assigned appointments.
          </footer>
        </section>
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Upcoming', summary.upcomingCount, 'Appointments', 'text-blue-700'],
              ['Review flags', summary.flaggedCount, 'Safety preparation', 'text-rose-600'],
              ['Hours served', therapistProfile.attendedHours.toFixed(1), 'Past appointments', 'text-emerald-700'],
              ['Patients seen', therapistProfile.attendedClientCount, 'Past appointments', 'text-purple-700'],
            ].map(([label, value, caption, color]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
                <p className="mt-1 text-[10px] text-slate-400">{caption}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TherapistDonutCard
              title="Treatment mix"
              subtitle="Upcoming assigned appointments"
              segments={treatmentSegments}
              centerValue={appointments.length}
              centerLabel="appointments"
            />
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div><h3 className="text-sm font-semibold text-slate-900">Treatment preparation</h3><p className="mt-1 text-xs text-slate-500">Patient-reported pressure preferences</p></div>
                <Stethoscope className="h-4 w-4 text-slate-500" />
              </div>
              <div className="mt-4 space-y-3">
                {pressureSegments.map((segment) => (
                  <div key={segment.label}>
                    <div className="mb-1 flex justify-between text-xs"><span className="text-slate-600">{segment.label}</span><span className="font-medium text-slate-800">{segment.value}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${appointments.length ? (segment.value / appointments.length) * 100 : 0}%`, backgroundColor: segment.color }} /></div>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="flex justify-between text-xs"><span className="text-slate-600">Intake details recorded</span><span className="font-semibold text-slate-800">{notesSegments[0].value}/{appointments.length}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${appointments.length ? (notesSegments[0].value / appointments.length) * 100 : 0}%` }} /></div>
              </div>
            </section>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] text-amber-900">
            <span>Patient information is private. Review only what you need for treatment preparation.</span>
            <span className="font-semibold">{therapistProfile.branchNames.length ? therapistProfile.branchNames.join(' · ') : 'No branch recorded'}</span>
          </div>
        </div>
      </div>
      </>
      )}
      {workspaceView === 'appointments' && (
      <>
      <div id="therapist-calendar" className="scroll-mt-5 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="bg-black px-5 py-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-bold">Google Calendar</h2><p className="text-xs text-blue-200 mt-1">Live schedule for {therapist.name}</p></div>
            <div className="flex rounded-xl bg-white/10 p-1">
              {['agenda', 'day', 'week', 'month'].map((mode) => (
                <button key={mode} onClick={() => setCalendarView(mode)} className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${calendarView === mode ? 'bg-white text-blue-900' : 'text-white'}`}>{mode}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={() => { const date = new Date(`${calendarDate}T12:00:00`); date.setDate(date.getDate() - (calendarView === 'month' ? 30 : calendarView === 'week' ? 7 : 1)); setCalendarDate(date.toISOString().slice(0, 10)); }} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm">‹</button>
            <input type="date" value={calendarDate} onChange={(event) => setCalendarDate(event.target.value)} className="rounded-lg px-2 py-1 text-xs text-stone-900" />
            <button onClick={() => { const date = new Date(`${calendarDate}T12:00:00`); date.setDate(date.getDate() + (calendarView === 'month' ? 30 : calendarView === 'week' ? 7 : 1)); setCalendarDate(date.toISOString().slice(0, 10)); }} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm">›</button>
            <button onClick={() => setCalendarDate(new Date().toISOString().slice(0, 10))} className="px-3 py-1 rounded-lg bg-emerald-400 text-emerald-950 text-xs font-bold">Today</button>
          </div>
        </div>
        <div className="p-5">
          {calendarEvents.length === 0 ? (
            <div className="py-12 text-center text-sm text-stone-500">No Google Calendar appointments in this view.</div>
          ) : calendarView === 'agenda' || calendarView === 'day' ? (
            <div className="space-y-3">
              {calendarEvents.map((event) => (
                <div key={event.id} className="grid grid-cols-[90px_1fr] gap-4 border-l-4 border-blue-600 bg-blue-50/60 rounded-r-xl p-4">
                  <div className="text-xs font-bold text-blue-900">{event.start ? new Date(event.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}<div className="text-[10px] text-stone-500 mt-1">{event.start ? new Date(event.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : ''}</div></div>
                  <div><div className="font-bold text-stone-900">{event.title}</div><div className="text-xs text-stone-600 mt-1">{event.location || 'Clinic location not recorded'}</div></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {calendarEvents.map((event) => (
                <div key={event.id} className="min-h-28 rounded-xl bg-blue-50 border border-blue-100 p-3">
                  <div className="text-[10px] font-bold text-blue-800">{event.start ? new Date(event.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : ''}</div>
                  <div className="text-xs font-bold text-stone-900 mt-2">{event.start ? new Date(event.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</div>
                  <div className="text-xs text-stone-700 mt-1">{event.title}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div><h2 className="text-base font-semibold text-slate-900">Upcoming appointments</h2><p className="mt-1 text-xs text-slate-500">Select a patient to review their treatment preparation details.</p></div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{appointments.length} scheduled</span>
        </div>
        {appointments.length ? (
          <div className="divide-y divide-slate-100">
            {appointments.map((appointment) => (
              <button
                key={`appointment-list-${appointment.bookingId}`}
                type="button"
                onClick={() => setSelectedAppointment(appointment)}
                className={`grid w-full grid-cols-1 gap-2 px-5 py-3 text-left transition hover:bg-slate-50 sm:grid-cols-[120px_minmax(0,1.1fr)_minmax(0,1.4fr)_auto] sm:items-center ${selectedAppointment?.bookingId === appointment.bookingId ? 'bg-slate-50' : ''}`}
              >
                <span className="text-sm font-semibold text-slate-900">{appointment.date}<span className="ml-2 text-slate-500">{appointment.time}</span></span>
                <span className="text-sm font-medium text-slate-800">{appointment.patientName}<span className="block text-xs font-normal text-slate-500">{appointment.branchName}</span></span>
                <span className="text-sm text-slate-600">{appointment.serviceName}<span className="block text-xs text-slate-400">{appointment.durationMinutes || '—'} minutes</span></span>
                <span className="flex flex-wrap gap-1.5 sm:justify-end">
                  {appointment.hasReportedConditions && <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-semibold text-rose-800">Health flags</span>}
                  {appointment.allergiesToOil && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">Oil allergy</span>}
                  {!appointment.hasReportedConditions && !appointment.allergiesToOil && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800">Ready to review</span>}
                </span>
              </button>
            ))}
          </div>
        ) : <p className="p-8 text-center text-sm text-slate-500">No upcoming appointments assigned to you.</p>}
      </section>
      {appointments.length > 0 && (
        <div id="therapist-patient-notes" className="scroll-mt-5 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="min-h-[360px]">
              {selectedAppointment && (
                <div className="p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-4">
                    <div><div className="text-xs uppercase tracking-wide text-stone-500">Patient preparation</div><h2 className="text-2xl font-black text-stone-900 mt-1">{selectedAppointment.patientName}</h2><p className="text-sm text-stone-500 mt-1">{selectedAppointment.date} at {selectedAppointment.time} · {selectedAppointment.serviceName}</p><div className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-500"><span>{selectedAppointment.patientPhone || 'Phone not recorded'}</span><span>•</span><span>{selectedAppointment.patientEmail || 'Email not recorded'}</span></div></div>
                    <span className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">{selectedAppointment.branchName}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                    <div className="rounded-xl bg-amber-50 p-3"><div className="text-[10px] uppercase font-bold text-amber-800">Pressure</div><div className="font-black mt-1">{selectedAppointment.pressure || 'Not recorded'}</div></div>
                    <div className="rounded-xl bg-red-50 p-3"><div className="text-[10px] uppercase font-bold text-red-800">Conditions</div><div className="font-black mt-1">{selectedAppointment.hasReportedConditions ? `${selectedAppointment.reportedConditionCount} flagged` : 'None flagged'}</div></div>
                    <div className="rounded-xl bg-purple-50 p-3"><div className="text-[10px] uppercase font-bold text-purple-800">Oil allergy</div><div className="font-black mt-1">{selectedAppointment.allergiesToOil ? 'Yes' : 'No'}</div></div>
                    <div className="rounded-xl bg-blue-50 p-3"><div className="text-[10px] uppercase font-bold text-blue-800">Duration</div><div className="font-black mt-1">{selectedAppointment.durationMinutes || '—'} min</div></div>
                  </div>
                  <div className="mt-5">
                    <h3 className="text-sm font-bold text-stone-800 mb-2">Affected body areas</h3>
                    <BodyAreaMap value={selectedAppointment.bodyAreas} readOnly />
                  </div>
                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-stone-50 p-4 text-xs"><div className="font-bold text-stone-700 mb-1">Pain / discomfort notes</div><p className="leading-5 text-stone-600">{selectedAppointment.painAreas || 'No pain or discomfort notes recorded.'}</p></div>
                    <div className="rounded-xl bg-stone-50 p-4 text-xs"><div className="font-bold text-stone-700 mb-1">Patient notes</div><p className="leading-5 text-stone-600">{selectedAppointment.additionalDetails || 'No additional notes recorded.'}</p></div>
                    <div className="rounded-xl bg-stone-50 p-4 text-xs"><div className="font-bold text-stone-700 mb-1">Medical history flags</div><div className="flex flex-wrap gap-1.5">{selectedAppointment.conditionFlags?.length ? selectedAppointment.conditionFlags.map((flag) => <span key={flag} className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-800">{flag}</span>) : <span className="text-stone-600">No conditions reported.</span>}</div></div>
                    <div className="rounded-xl bg-stone-50 p-4 text-xs"><div className="font-bold text-stone-700 mb-1">Patient profile</div><p className="leading-5 text-stone-600">{[selectedAppointment.gender, selectedAppointment.dateOfBirth ? `DOB ${selectedAppointment.dateOfBirth}` : '', selectedAppointment.medications ? `Medication: ${selectedAppointment.medications}` : ''].filter(Boolean).join(' · ') || 'Profile details not recorded.'}</p></div>
                  </div>
                  <div className="mt-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">Use this summary to prepare. Review the complete patient history only through the authorized clinical workflow.</div>
                </div>
              )}
            </div>
        </div>
      )}
      </>
      )}
        </>
      )}
      </div>
      </div>
    </div>
  );
}

function AdminGate({ children }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/booking?view=owner-session')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Owner sign-in is unavailable.');
        setAuthenticated(Boolean(data.authenticated));
      })
      .catch((requestError) => setError(requestError.message || 'Unable to verify owner session.'))
      .finally(() => setIsCheckingSession(false));
  }, []);

  const signOut = async () => {
    try {
      const response = await fetch('/api/booking?view=owner-logout', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to sign out.');
      setAuthenticated(false);
      setPassword('');
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign out.');
    }
  };

  if (authenticated) {
    return (
      <div>
        <div className="flex justify-end mb-2">
          <button
            onClick={signOut}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
        {children}
      </div>
    );
  }

  if (isCheckingSession) {
    return (
      <div className="mx-auto my-16 max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-800" />
        <p className="text-sm font-medium text-slate-600">Verifying secure owner access…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto my-14 max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
      <div className="bg-gradient-to-br from-slate-950 via-emerald-950 to-emerald-800 px-8 py-7 text-white">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
          <Building className="h-6 w-6" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">MY THAI THAI</p>
        <h1 className="mt-2 text-2xl font-bold">Owner sign in</h1>
        <p className="mt-2 text-sm leading-6 text-emerald-50/80">Sign in to manage your business profile and practice dashboard.</p>
      </div>
      <form onSubmit={async (event) => {
        event.preventDefault();
        setIsSigningIn(true);
        setError('');
        try {
          const response = await fetch('/api/booking?view=owner-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || 'Unable to sign in.');
          setAuthenticated(true);
          setPassword('');
        } catch (requestError) {
          setError(requestError.message || 'Unable to sign in.');
        } finally {
          setIsSigningIn(false);
        }
      }} className="space-y-4 p-8">
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <label htmlFor="owner-password" className="block text-sm font-semibold text-slate-700">Owner password</label>
        <input
          id="owner-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
          placeholder="Enter your password"
        />
        <button type="submit" disabled={isSigningIn} className="w-full rounded-xl bg-emerald-900 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-950/15 transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">
          {isSigningIn ? 'Signing in…' : 'Sign in securely'}
        </button>
        <p className="text-center text-xs leading-5 text-slate-500">Your secure session expires after 8 hours.</p>
      </form>
    </div>
  );
}

function CustomerPortal({ branches, services, therapists, sheetsWebhookUrl, onNewBooking }) {
  const [step, setStep] = useState(1);
  const { businessName, photoUrl, error: brandingError } = useBusinessBranding();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sheetsSyncStatus, setSheetsSyncStatus] = useState(null);
  const [sheetsSyncReason, setSheetsSyncReason] = useState('');
  const [loyaltyCompanyEmailNotified, setLoyaltyCompanyEmailNotified] = useState(false);
  const [showExistingPatientChoice, setShowExistingPatientChoice] = useState(false);
  const [loyaltyProgram, setLoyaltyProgram] = useState(null);
  const [loyaltyProgramError, setLoyaltyProgramError] = useState('');
  const [membershipBenefit, setMembershipBenefit] = useState(null);
  const [membershipCheckMessage, setMembershipCheckMessage] = useState('');
  const [squareEnabled, setSquareEnabled] = useState(false);
  const [squareCheckoutLoading, setSquareCheckoutLoading] = useState(false);
  const [squareCheckoutError, setSquareCheckoutError] = useState('');
  
  const [bookingData, setBookingData] = useState({
    branch: branches[0],
    service: null,
    therapist: null,
    therapist2: null,
    date: new Date().toISOString().split('T')[0],
    time: null,
    marketingOptIn: false,
    loyaltyOptIn: false,
    platinumEnrollment: false,
    companyName: '',
    companyId: '',
    guestTwoName: '',
    customer: { firstName: '', lastName: '', email: '', phone: '' },
    intake: {
      pressure: 'Medium',
      focusAreas: '',
      injuries: '',
      agreeTerms: false,
      dateOfBirth: '',
      gender: '',
      address: '',
      city: '',
      postalCode: '',
      heardAbout: '',
      conditions: {
        heart: '', bloodPressure: '', diabetes: '', cancer: '', headaches: '',
        boneJoint: '', brokenBones: '', osteoporosis: '', allergies: '',
        surgeries: '', numbness: '', skinSensitivity: '', pregnant: '', medications: '',
      },
      details: '',
      painAreas: '',
      bodyAreas: [],
      signature: '',
      signatureDate: new Date().toISOString().split('T')[0],
      consent: false,
      reuseExisting: false,
      historyMode: 'new',
      preCollectionConsent: false,
      consentTimestamp: '',
    },
    paymentOption: 'deposit', // 'clinic', 'deposit', 'full'
    confirmationCode: ''
  });

  // Keep the selected branch in sync if the owner updates or removes branches while this page is open.
  useEffect(() => {
    if (branches.length === 0) return;
    setBookingData((prev) => {
      const stillExists = branches.some((branch) => branch.id === prev.branch?.id);
      return stillExists ? prev : { ...prev, branch: branches[0] };
    });
  }, [branches]);


  const categories = ['All', 'Thai Traditional', 'Thai Combo Swedish', 'Hot Stone Combo', 'Add-On & Packages', 'RMT Healthcare'];

  useEffect(() => {
    let isCurrent = true;
    fetch('/api/booking?view=loyalty-program')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
        if (isCurrent) setLoyaltyProgram(data);
      })
      .catch((error) => {
        if (isCurrent) setLoyaltyProgramError(error.message || 'Loyalty program information is unavailable.');
      });
    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    fetch('/api/booking?view=square-config')
      .then((response) => response.json())
      .then((data) => { if (isCurrent) setSquareEnabled(Boolean(data.enabled)); })
      .catch(() => { if (isCurrent) setSquareEnabled(false); });
    return () => { isCurrent = false; };
  }, []);

  const payWithSquare = async (amount) => {
    setSquareCheckoutError('');
    setSquareCheckoutLoading(true);
    try {
      const response = await fetch('/api/booking?view=square-create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingData.confirmationCode, amount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to start the Square payment.');
      if (data.url) window.location.href = data.url;
    } catch (requestError) {
      setSquareCheckoutError(requestError.message || 'Unable to start the Square payment.');
    } finally {
      setSquareCheckoutLoading(false);
    }
  };

  const filteredServices = useMemo(() => {
    if (selectedCategory === 'All') return services;
    return services.filter(s => s.category === selectedCategory);
  }, [services, selectedCategory]);

  const isCoupleService = /couple/i.test(bookingData.service?.name || '');

  // Only offer therapists actually rotated into the selected branch on the selected date;
  // falls back to full branch list if that therapist has no per-weekday rotation configured.
  const branchTherapists = useMemo(
    () => therapists.filter((therapist) => isTherapistScheduledAtBranch(therapist, bookingData.branch?.id, bookingData.date)),
    [therapists, bookingData.branch, bookingData.date]
  );

  useEffect(() => {
    if (bookingData.therapist?.id && bookingData.therapist2?.id && bookingData.therapist.id === bookingData.therapist2.id) {
      setBookingData((prev) => ({ ...prev, therapist2: null }));
    }
  }, [bookingData.therapist, bookingData.therapist2]);

  // Clear any therapist selection that is no longer rotated into this branch/date combination
  useEffect(() => {
    setBookingData((prev) => {
      const stillValid = (therapist) => !therapist || branchTherapists.some((t) => t.id === therapist.id);
      if (stillValid(prev.therapist) && stillValid(prev.therapist2)) return prev;
      return {
        ...prev,
        therapist: stillValid(prev.therapist) ? prev.therapist : null,
        therapist2: stillValid(prev.therapist2) ? prev.therapist2 : null,
      };
    });
  }, [branchTherapists]);

  const updateBooking = (field, val) => {
    setBookingData(prev => ({ ...prev, [field]: val }));
  };

  const updateCustomer = (field, val) => {
    if (field === 'email') {
      setMembershipBenefit(null);
      setMembershipCheckMessage('');
    }
    setBookingData(prev => ({
      ...prev,
      customer: { ...prev.customer, [field]: val }
    }));
  };

  const checkMembershipEligibility = async () => {
    const email = bookingData.customer.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setMembershipCheckMessage('Checking membership eligibility…');
    try {
      const response = await fetch(`/api/booking?view=loyalty-eligibility&email=${encodeURIComponent(email)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not check membership.');
      if (data.eligible) {
        setMembershipBenefit(data);
        const planName = data.membershipType === 'gold' ? 'Gold' : data.membershipType === 'platinum' ? 'Platinum' : 'Silver';
        const benefits = data.membershipType === 'platinum'
          ? `${data.discountPercent}% off services, $${data.hotStoneDiscount} off Hot Stone add-ons, ${Number(data.hoursBalance).toFixed(2)} prepaid hours remain`
          : `${data.discountPercent}% off services${data.membershipType === 'gold' ? `, ${data.pointsMultiplier}x points and ${data.freeHotStonePerMonth} free Hot Stone add-on(s) per month${data.freeHotStoneAvailable ? ' available now' : ''}` : ''}`;
        setMembershipCheckMessage(`${planName} membership active: ${benefits}.`);
      } else {
        setMembershipBenefit(null);
        setMembershipCheckMessage('No active paid membership found. Regular points rewards remain available.');
      }
    } catch (error) {
      setMembershipBenefit(null);
      setMembershipCheckMessage(error.message || 'Could not check membership eligibility.');
    }
  };

  const updateIntake = (field, val) => {
    setBookingData(prev => ({
      ...prev,
      intake: { ...prev.intake, [field]: val }
    }));
  };

  const updateCondition = (field, val) => {
    setBookingData(prev => ({
      ...prev,
      intake: { ...prev.intake, conditions: { ...prev.intake.conditions, [field]: val } }
    }));
  };

  const calculateFinancials = () => {
    if (!bookingData.service) return { base: 0, discountPercent: 0, discountAmount: 0, tax: 0, total: 0, deposit: 0, balanceDue: 0 };
    const base = bookingData.service.price;
    const isPlatinumHotStoneAddon = membershipBenefit?.type === 'platinum' &&
      bookingData.service.name.toLowerCase().includes('hot stone add-on');
    const isGoldFreeHotStoneAddon = membershipBenefit?.type === 'gold' &&
      membershipBenefit.freeHotStoneAvailable &&
      bookingData.service.name.toLowerCase().includes('hot stone add-on');
    const isPlatinumPrepaidSession = membershipBenefit?.type === 'platinum' &&
      !isPlatinumHotStoneAddon &&
      Number(membershipBenefit.hoursBalance) >= Number(bookingData.service.duration) / 60;
    const discountAmount = isGoldFreeHotStoneAddon
      ? base
      : isPlatinumPrepaidSession
        ? base
        : isPlatinumHotStoneAddon
          ? Math.min(base, Number(membershipBenefit.hotStoneDiscount) || 0)
          : Math.round(base * (membershipBenefit?.discountPercent || 0)) / 100;
    const discountPercent = base > 0 ? discountAmount * 100 / base : 0;
    const discountedBase = base - discountAmount;
    const tax = discountedBase * (bookingData.service.taxRate || 0);
    const total = discountedBase + tax;
    let deposit = 0;
    if (bookingData.paymentOption === 'deposit') {
      deposit = Math.min(bookingData.service.deposit, total);
    } else if (bookingData.paymentOption === 'full') {
      deposit = total;
    } else {
      deposit = 0; // clinic
    }
    const balanceDue = Math.max(0, total - deposit);
    return { base, discountPercent, discountAmount, tax, total, deposit, balanceDue };
  };

  const financials = calculateFinancials();

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSheetsSyncStatus('pending');
    setSheetsSyncReason('');

    const code = 'MTT-' + Math.floor(100000 + Math.random() * 900000);
    const customerFullName = `${bookingData.customer.firstName} ${bookingData.customer.lastName}`;
    const combinedCustomerName = isCoupleService && bookingData.guestTwoName.trim()
      ? `${customerFullName} & ${bookingData.guestTwoName.trim()}`
      : customerFullName;

    const payloadForSheets = {
      id: code,
      customerName: combinedCustomerName,
      phone: bookingData.customer.phone,
      email: bookingData.customer.email,
      marketingOptIn: bookingData.marketingOptIn,
      loyaltyOptIn: bookingData.loyaltyOptIn,
      platinumEnrollment: bookingData.platinumEnrollment,
      companyName: bookingData.companyName,
      companyId: bookingData.companyId,
      subtotalAmount: financials.base.toFixed(2),
      taxRate: bookingData.service.taxRate || 0,
      expectedDiscountPercent: financials.discountPercent,
      branchName: bookingData.branch.name,
      serviceName: bookingData.service.name,
      therapistName: bookingData.therapist?.name || 'Any Available',
      therapistName2: isCoupleService ? (bookingData.therapist2?.name || 'Any Available') : undefined,
      therapistCandidates: branchTherapists.map((therapist) => therapist.name),
      date: bookingData.date,
      time: bookingData.time,
      durationMinutes: bookingData.service.duration,
      branchAddress: `${bookingData.branch.address}, ${bookingData.branch.city}`,
      intakeNotes: [
        `Pressure: ${bookingData.intake.pressure}`,
        bookingData.intake.focusAreas ? `Focus areas: ${bookingData.intake.focusAreas}` : '',
        bookingData.intake.injuries ? `Injuries: ${bookingData.intake.injuries}` : '',
        isCoupleService && bookingData.guestTwoName.trim() ? `Guest 2: ${bookingData.guestTwoName.trim()}` : '',
      ].filter(Boolean).join('; '),
      patientHistory: {
        ...bookingData.intake,
        conditions: bookingData.intake.conditions,
        signatureDate: bookingData.intake.signatureDate || new Date().toISOString().split('T')[0],
        bodyAreas: bookingData.intake.bodyAreas.join(', '),
        reuseExisting: bookingData.intake.historyMode === 'reuse',
        preCollectionConsent: bookingData.intake.preCollectionConsent,
        consentTimestamp: bookingData.intake.consentTimestamp,
      },
      paymentOption: bookingData.paymentOption,
      paidAmount: financials.deposit.toFixed(2),
      totalAmount: financials.total.toFixed(2)
    };

    // Use the Vercel route by default; retain support for a configured webhook.
    const syncResult = await sendBookingToGoogleSheets(
      bookingData.marketingOptIn || bookingData.loyaltyOptIn || bookingData.platinumEnrollment || membershipBenefit ? '' : sheetsWebhookUrl,
      payloadForSheets,
    );
    const syncSuccess = syncResult.success;
    setLoyaltyCompanyEmailNotified(syncResult.loyaltyCompanyEmailNotified === true);
    const hasLoyaltyRequest = bookingData.loyaltyOptIn || bookingData.platinumEnrollment;
    if (!syncSuccess || syncResult.emailSent === false || syncResult.patientHistorySaved === false || (bookingData.marketingOptIn && syncResult.marketingConsentSaved === false) || (hasLoyaltyRequest && syncResult.loyaltyEnrollmentSaved === false) || (hasLoyaltyRequest && syncResult.loyaltyEnrollmentEmailSent === false)) {
      setSheetsSyncReason(syncResult.reason || syncResult.emailReason || syncResult.patientHistoryReason || syncResult.marketingConsentReason || syncResult.loyaltyEnrollmentReason || syncResult.loyaltyEnrollmentEmailError || 'The booking sync failed.');
    }

    const newRecord = {
      id: code,
      customerName: combinedCustomerName,
      phone: bookingData.customer.phone,
      email: bookingData.customer.email,
      serviceId: bookingData.service.id,
      serviceName: bookingData.service.name,
      branchId: bookingData.branch.id,
      therapistId: therapists.find((therapist) => therapist.name === syncResult.data?.therapistName)?.id || bookingData.therapist?.id || 0,
      therapistName: syncResult.data?.therapistName || bookingData.therapist?.name || 'Any Available',
      date: bookingData.date,
      time: bookingData.time,
      status: 'Confirmed',
      paidAmount: Number(syncResult.data?.paidAmount ?? financials.deposit),
      total: Number(syncResult.data?.totalAmount ?? financials.total),
      syncedToSheets: syncSuccess
    };

    onNewBooking(newRecord);
    setBookingData(prev => ({ ...prev, confirmationCode: code }));
    setSheetsSyncStatus(syncSuccess
      ? (syncResult.emailSent === false ? 'email_failed' : (syncResult.patientHistorySaved === false ? 'patient_history_failed' : (bookingData.marketingOptIn && syncResult.marketingConsentSaved === false ? 'marketing_consent_failed' : (hasLoyaltyRequest && (syncResult.loyaltyEnrollmentSaved === false || syncResult.loyaltyEnrollmentEmailSent === false) ? 'loyalty_enrollment_failed' : 'success'))))
      : 'failed');
    setIsSubmitting(false);
    setStep(5);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden max-w-6xl mx-auto my-2 sm:my-6">
      {/* Clinic Header Banner */}
      <div className="bg-slate-950 text-white p-6 sm:p-8 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 w-40 h-40 bg-slate-700 rounded-full opacity-30 pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-center gap-3">
            <BusinessPhoto businessName={businessName} photoUrl={photoUrl} className="h-12 w-12 rounded-xl object-cover shadow-md" />
            <h1 className="text-3xl sm:text-4xl font-serif tracking-tight font-bold text-amber-200">{businessName}</h1>
          </div>
          <p className="text-slate-300 font-medium text-sm sm:text-base mt-1">Thai Massage & Wellness • Ontario, Canada</p>
          {brandingError && <p role="status" className="mt-2 text-xs text-amber-200">{brandingError}</p>}
          
          <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:text-sm bg-white/5 backdrop-blur px-5 py-2 rounded-full border border-white/10">
            <a href="tel:+14378987424" className="flex items-center text-slate-200 hover:text-white transition">
              <Phone className="w-3.5 h-3.5 mr-1.5 text-amber-300" />
              +1 437 898 7424
            </a>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <a href="https://Mythaithaimassage.com" target="_blank" rel="noreferrer" className="flex items-center text-slate-200 hover:text-white transition">
              <Globe className="w-3.5 h-3.5 mr-1.5 text-amber-300" />
              Mythaithaimassage.com
            </a>
          </div>
        </div>
      </div>

      {/* 5-Step Progress Stepper */}
      <div className="bg-white border-b border-stone-200 px-4 py-4 sm:px-8">
        <div className="flex items-center justify-between text-xs sm:text-sm font-medium">
          {[
            { num: 1, label: "Branch & Service" },
            { num: 2, label: "Therapist & Time" },
            { num: 3, label: "Your Info" },
            { num: 4, label: "Payment & Review" },
            { num: 5, label: "Confirmed" }
          ].map((s) => (
            <div key={s.num} className={`flex items-center space-x-1.5 ${step === s.num ? 'text-slate-950 font-bold' : step > s.num ? 'text-stone-700' : 'text-stone-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === s.num 
                  ? 'bg-slate-950 text-white ring-2 ring-slate-200'
                  : step > s.num 
                  ? 'bg-stone-800 text-white' 
                  : 'bg-stone-200 text-stone-500'
              }`}>
                {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
              </span>
              <span className="hidden md:inline">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-stone-50/70 p-4 sm:p-8">
        {/* STEP 1: Branch & Service */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-stone-900 mb-1">1. Choose Location</h2>
              <p className="text-xs text-stone-500 mb-3">Select your preferred {businessName} spa location</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {branches.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => updateBooking('branch', b)}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      bookingData.branch?.id === b.id 
                        ? 'border-emerald-600 ring-2 ring-emerald-600/20 bg-emerald-50/50 shadow-sm' 
                        : 'border-stone-200 hover:border-emerald-300 bg-white'
                    }`}
                  >
                    <div className="font-bold text-stone-900 text-sm">{b.name}</div>
                    <div className="text-xs text-stone-500 mt-1 flex items-center">
                      <MapPin className="w-3.5 h-3.5 mr-1 text-emerald-600 shrink-0" />
                      {b.city}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-stone-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-xl font-bold text-stone-900">2. Select Service or Package</h2>
                  <p className="text-xs text-stone-500">Official rates & treatments list</p>
                </div>
              </div>

              {/* Category Filters */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                      selectedCategory === cat 
                        ? 'bg-emerald-800 text-white shadow' 
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Service Cards Grid */}
              <div className="grid gap-3 sm:grid-cols-2 max-h-[420px] overflow-y-auto pr-1">
                {filteredServices.map(s => (
                  <div
                    key={s.id}
                    onClick={() => updateBooking('service', s)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      bookingData.service?.id === s.id 
                        ? 'border-emerald-600 ring-2 ring-emerald-600/20 bg-emerald-50/70' 
                        : 'border-stone-200 hover:border-emerald-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-stone-900 text-sm">{s.name}</span>
                        <span className="text-base font-extrabold text-emerald-800 ml-2">${s.price}</span>
                      </div>
                      <p className="text-xs text-stone-600 mt-1">{s.description}</p>
                    </div>
                    
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-stone-100 text-xs">
                      <span className="text-stone-500 font-medium">{s.duration} min</span>
                      {s.isRmt ? (
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold text-[10px]">
                          RMT Tax Exempt
                        </span>
                      ) : (
                        <span className="text-stone-400 text-[11px]">Deposit: ${s.deposit}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="button"
                disabled={!bookingData.service}
                onClick={() => setStep(2)}
                className="px-6 py-2.5 bg-emerald-800 text-white font-semibold rounded-xl hover:bg-emerald-900 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm flex items-center"
              >
                Continue to Date & Therapist <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Therapist, Date & Time */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-stone-900 mb-1">Select Therapist{isCoupleService ? 's' : ''}</h2>
              <p className="text-xs text-stone-500 mb-3">
                {isCoupleService
                  ? 'This is a couple session for 2 people. Pick a specific practitioner for each guest, or request any available therapist — we will always assign 2 different therapists.'
                  : 'Choose a specific practitioner or request any available therapist'}
              </p>
              <p className="text-[11px] text-stone-400 mb-3">Showing therapists rotated into {bookingData.branch?.name || 'this branch'} on {bookingData.date}. Change the date below to see who is scheduled on a different day.</p>
              {branchTherapists.length === 0 && (
                <p role="status" className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">No therapist is specifically rotated to this branch on the selected date — choose "Any Available Practitioner" and the clinic will confirm staffing.</p>
              )}

              {isCoupleService && <p className="text-xs font-bold text-emerald-800 mb-2">Guest 1 therapist</p>}
              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => updateBooking('therapist', null)}
                  className={`p-3.5 rounded-xl border text-center transition ${
                    bookingData.therapist === null 
                      ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20' 
                      : 'border-stone-200 bg-white hover:border-emerald-300'
                  }`}
                >
                  <div className="font-bold text-stone-900 text-sm">Any Available Practitioner</div>
                  <p className="text-xs text-stone-500 mt-1">First available specialist</p>
                </button>

                {branchTherapists.map(t => {
                  const disabled = isCoupleService && bookingData.therapist2?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => updateBooking('therapist', t)}
                      className={`p-3.5 rounded-xl border text-left transition ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${
                        bookingData.therapist?.id === t.id 
                          ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20' 
                          : 'border-stone-200 bg-white hover:border-emerald-300'
                      }`}
                    >
                      <div className="font-bold text-stone-900 text-sm flex items-center justify-between">
                        {t.name}
                        <span className="text-amber-500 text-xs font-bold">★ {t.rating}</span>
                      </div>
                      <p className="text-xs text-stone-500 mt-1 line-clamp-1">{t.bio}</p>
                      {disabled && <p className="text-[10px] text-red-500 mt-1 font-semibold">Already assigned to Guest 2</p>}
                    </button>
                  );
                })}
              </div>

              {isCoupleService && (
                <>
                  <p className="text-xs font-bold text-emerald-800 mt-5 mb-2">Guest 2 therapist</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => updateBooking('therapist2', null)}
                      className={`p-3.5 rounded-xl border text-center transition ${
                        bookingData.therapist2 === null 
                          ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20' 
                          : 'border-stone-200 bg-white hover:border-emerald-300'
                      }`}
                    >
                      <div className="font-bold text-stone-900 text-sm">Any Available Practitioner</div>
                      <p className="text-xs text-stone-500 mt-1">First available specialist</p>
                    </button>

                    {branchTherapists.map(t => {
                      const disabled = bookingData.therapist?.id === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => updateBooking('therapist2', t)}
                          className={`p-3.5 rounded-xl border text-left transition ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${
                            bookingData.therapist2?.id === t.id 
                              ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20' 
                              : 'border-stone-200 bg-white hover:border-emerald-300'
                          }`}
                        >
                          <div className="font-bold text-stone-900 text-sm flex items-center justify-between">
                            {t.name}
                            <span className="text-amber-500 text-xs font-bold">★ {t.rating}</span>
                          </div>
                          <p className="text-xs text-stone-500 mt-1 line-clamp-1">{t.bio}</p>
                          {disabled && <p className="text-[10px] text-red-500 mt-1 font-semibold">Already assigned to Guest 1</p>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="pt-4 border-t border-stone-200">
              <h2 className="text-xl font-bold text-stone-900 mb-3">Select Date & Appointment Slot</h2>
              
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="w-full sm:w-1/2">
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Date</label>
                  <input 
                    type="date"
                    value={bookingData.date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => updateBooking('date', e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <label className="block text-xs font-semibold text-stone-700 mb-2">Available Time Slots</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {AVAILABLE_TIMES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => updateBooking('time', t)}
                    className={`py-2.5 px-3 rounded-xl border text-sm font-semibold transition ${
                      bookingData.time === t 
                        ? 'bg-emerald-800 text-white border-emerald-800 shadow' 
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-2.5 border border-stone-300 font-semibold rounded-xl text-stone-600 hover:bg-stone-100 transition"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!bookingData.time}
                onClick={() => setStep(3)}
                className="px-6 py-2.5 bg-emerald-800 text-white font-semibold rounded-xl hover:bg-emerald-900 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm flex items-center"
              >
                Enter Contact Details <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Contact Details */}
        {step === 3 && (
          <div className="space-y-6">
            {!bookingData.intake.preCollectionConsent && (
              <div className="p-5 rounded-2xl bg-blue-50 border border-blue-200 space-y-4 max-h-[70vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-blue-950 text-center">Consent and Waiver Form</h2>
                <p className="text-sm text-blue-900">
                  I confirm that I have fully disclosed all known physical and medical conditions, as well as any medications I am currently taking, to my Massage Therapist. I agree to keep my Massage Therapist informed of any future changes in my health history.
                </p>
                <p className="text-sm font-bold text-blue-950">I understand and acknowledge the following:</p>
                <ul className="list-disc pl-5 space-y-2 text-xs text-blue-950">
                  <li>A complete and accurate health history is required prior to receiving massage therapy.</li>
                  <li>I may ask questions about the information being collected and the proposed therapy at any time.</li>
                  <li>All client information is strictly confidential and will only be released to other health professionals with my written authorization or as required by law.</li>
                  <li>I understand the general benefits of massage therapy as well as the potential contraindications and necessary precautions.</li>
                  <li>I have been informed of the assessment, treatment techniques, and remedial exercises that may be used during my session.</li>
                  <li>Draping will be used at all times to ensure modesty and expose only the areas being treated.</li>
                  <li>I may withdraw or modify my consent to treatment at any time, without penalty.</li>
                  <li>I have been informed of the duration and cost of my massage therapy treatment.</li>
                  <li>I acknowledge that massage therapy is not a replacement for medical treatment or medication.</li>
                  <li>I understand that I should consult my primary healthcare provider for any medical condition I may have.</li>
                  <li>I understand that my Massage Therapist does not diagnose illness or disease and does not prescribe medications.</li>
                  <li>I consent to treatment that may include massage of the following areas, if applicable: chest wall muscles, gluteal (buttocks) muscles, and inner upper thighs.</li>
                </ul>
                <p className="text-xs font-bold text-blue-950">
                  Important Note: Deep tissue massage may cause temporary soreness or discomfort following the session. In rare cases, localized bruising may occur.
                </p>
                <p className="text-xs text-blue-900">
                  My Thai Thai Massage is committed to providing professional, safe, and respectful care. Some sessions may exceed their scheduled time due to individual client needs. We appreciate your understanding and patience.
                </p>
                <label className="flex items-start gap-2 text-xs text-blue-950">
                  <input
                    type="checkbox"
                    checked={bookingData.intake.preCollectionConsent}
                    onChange={(event) => updateIntake('preCollectionConsent', event.target.checked
                      ? true
                      : false)}
                    className="mt-0.5"
                  />
                  <span>I have read and understood this Consent and Waiver Form. I understand the nature of massage treatment and give my voluntary consent. I release the Massage Therapist from liability for complications that may arise from any undisclosed or inaccurate health information.</span>
                </label>
                <button
                  type="button"
                  disabled={!bookingData.intake.preCollectionConsent}
                  onClick={() => updateIntake('consentTimestamp', new Date().toISOString())}
                  className="px-5 py-2.5 bg-emerald-800 text-white rounded-xl text-sm font-bold disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            )}
            {bookingData.intake.preCollectionConsent && <>
            <div>
              <h2 className="text-xl font-bold text-stone-900 mb-1">Contact Information</h2>
              <p className="text-xs text-stone-500 mb-4">No registration or password required</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">First Name *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Jane"
                    value={bookingData.customer.firstName}
                    onChange={(e) => updateCustomer('firstName', e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Last Name *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Doe"
                    value={bookingData.customer.lastName}
                    onChange={(e) => updateCustomer('lastName', e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Email Address *</label>
                  <input 
                    type="email" 
                    required
                    placeholder="jane.doe@example.com"
                    value={bookingData.customer.email}
                    onChange={(e) => updateCustomer('email', e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Phone Number *</label>
                  <input 
                    type="tel" 
                    required
                    placeholder="(416) 555-0199"
                    value={bookingData.customer.phone}
                    onChange={(e) => updateCustomer('phone', e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>
              </div>
              {isCoupleService && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                  <label className="block text-xs font-bold text-emerald-900 mb-1">Guest 2 Full Name *</label>
                  <p className="text-[11px] text-emerald-800 mb-2">This is a couple session for 2 people. The booking is under the primary guest above; please also provide the second guest's name so both therapists have the correct client on file.</p>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Doe"
                    value={bookingData.guestTwoName}
                    onChange={(e) => updateBooking('guestTwoName', e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-emerald-300 bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>
              )}
              <label className="mt-3 flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs leading-5 text-stone-700">
                <input
                  type="checkbox"
                  checked={bookingData.marketingOptIn}
                  onChange={(event) => updateBooking('marketingOptIn', event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-stone-300 text-emerald-800 focus:ring-emerald-700"
                />
                <span>I agree to receive occasional promotional emails from {businessName}. I can unsubscribe at any time. This is optional and is not required for booking or treatment.</span>
              </label>
              {loyaltyProgram?.enabled && (
                <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 text-xs leading-5 text-indigo-950">
                  <input
                    type="checkbox"
                    checked={bookingData.loyaltyOptIn}
                    disabled={bookingData.platinumEnrollment}
                    onChange={(event) => updateBooking('loyaltyOptIn', event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-700 focus:ring-indigo-600"
                  />
                  <span>
                    <strong className="block text-sm">Join {businessName} Rewards</strong>
                    <span className="block mt-0.5">Earn {loyaltyProgram.pointsPerDollar} points per $1 actually paid, with {loyaltyProgram.firstSessionMultiplier}x points on your first single-session purchase. Redeem {loyaltyProgram.redemptionPoints.toLocaleString()} points for ${Number(loyaltyProgram.redemptionValue).toFixed(2)} off in clinic. Membership is optional and separate from marketing emails.</span>
                    <span className="mt-1 block">Gold: ${loyaltyProgram.membershipPlans.gold.monthlyFee}/month, {loyaltyProgram.membershipPlans.gold.discountPercent}% off, {loyaltyProgram.membershipPlans.gold.pointsMultiplier}x points and {loyaltyProgram.membershipPlans.gold.freeHotStonePerMonth} free Hot Stone add-on(s) monthly. Platinum: ${loyaltyProgram.membershipPlans.platinum.topUpPrice} for {loyaltyProgram.membershipPlans.platinum.includedHours} prepaid hours, {loyaltyProgram.membershipPlans.platinum.discountPercent}% off and ${loyaltyProgram.membershipPlans.platinum.hotStoneDiscount} off Hot Stone add-ons.</span>
                    <span className="mt-1 block text-indigo-700">Tiers: {loyaltyProgram.tiers.map((tier) => tier.name).join(' · ')}</span>
                  </span>
                </label>
              )}
              {loyaltyProgram?.enabled && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs leading-5 text-amber-950">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={bookingData.platinumEnrollment}
                      onChange={(event) => {
                        updateBooking('platinumEnrollment', event.target.checked);
                        if (event.target.checked) updateBooking('loyaltyOptIn', false);
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-700 focus:ring-amber-600"
                    />
                    <span>
                      <strong className="block text-sm">Request company Platinum</strong>
                      <span>For employees of a participating company. Use your work email in the contact field. The clinic will verify your details and confirm the ${loyaltyProgram.membershipPlans.platinum.topUpPrice} top-up before activating {loyaltyProgram.membershipPlans.platinum.includedHours} hours and Platinum booking benefits.</span>
                    </span>
                  </label>
                  {bookingData.platinumEnrollment && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="font-semibold">Company name *
                        <input
                          required
                          maxLength={120}
                          value={bookingData.companyName}
                          onChange={(event) => updateBooking('companyName', event.target.value)}
                          className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-normal text-stone-900"
                          placeholder="Your employer"
                        />
                      </label>
                      <label className="font-semibold">Employee/company ID (optional)
                        <input
                          maxLength={120}
                          value={bookingData.companyId}
                          onChange={(event) => updateBooking('companyId', event.target.value)}
                          className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-normal text-stone-900"
                          placeholder="Employee or company ID"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
              {loyaltyProgramError && <p role="status" className="mt-2 text-xs text-amber-800">Rewards enrollment details are temporarily unavailable. You can still complete your booking.</p>}
            </div>

            <div className="pt-4 border-t border-stone-200">
              <h2 className="text-xl font-bold text-stone-900 mb-1">Patient Health History</h2>
              <p className="text-xs text-stone-500 mb-4">Please complete this confidential form so we can provide treatment safely.</p>
              <button
                type="button"
                onClick={() => setShowExistingPatientChoice(true)}
                className="w-full text-left p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 hover:bg-blue-100"
              >
                <strong>Returning patient?</strong> Click here to choose whether to reuse your previous profile or review and update your medical information.
              </button>

              {bookingData.intake.historyMode !== 'reuse' && <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Date of Birth</label>
                    <input type="date" value={bookingData.intake.dateOfBirth} onChange={(e) => updateIntake('dateOfBirth', e.target.value)} className="w-full p-2.5 rounded-xl border border-stone-300 text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Gender</label>
                    <select value={bookingData.intake.gender} onChange={(e) => updateIntake('gender', e.target.value)} className="w-full p-2.5 rounded-xl border border-stone-300 text-xs">
                      <option value="">Select</option><option>Female</option><option>Male</option><option>Other</option><option>Prefer not to say</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">How did you hear about us?</label>
                    <input value={bookingData.intake.heardAbout} onChange={(e) => updateIntake('heardAbout', e.target.value)} className="w-full p-2.5 rounded-xl border border-stone-300 text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-bold text-stone-700 mb-1">Address</label>
                    <input value={bookingData.intake.address} onChange={(e) => updateIntake('address', e.target.value)} className="w-full p-2.5 rounded-xl border border-stone-300 text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">City</label>
                    <input value={bookingData.intake.city} onChange={(e) => updateIntake('city', e.target.value)} className="w-full p-2.5 rounded-xl border border-stone-300 text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Postal Code</label>
                    <input value={bookingData.intake.postalCode} onChange={(e) => updateIntake('postalCode', e.target.value)} className="w-full p-2.5 rounded-xl border border-stone-300 text-xs" />
                  </div>
                </div>
                <div className="border border-stone-200 rounded-xl overflow-hidden">
                  <div className="bg-stone-100 px-3 py-2 text-xs font-bold text-stone-700">Please indicate whether any of these apply</div>
                  {[
                    ['heart', 'Heart condition / heart disease / stroke'],
                    ['bloodPressure', 'High or low blood pressure'],
                    ['diabetes', 'Diabetes'],
                    ['cancer', 'History of cancer / precancerous lesions'],
                    ['headaches', 'Headaches / migraines / dizziness'],
                    ['boneJoint', 'Bone or joint disorder / spinal injury / herniated disc'],
                    ['brokenBones', 'Broken bones / metal implants / plates / pins'],
                    ['osteoporosis', 'Osteoporosis / arthritis / rheumatoid arthritis'],
                    ['allergies', 'Allergies to oil'],
                    ['surgeries', 'Past surgeries or recent surgeries'],
                    ['numbness', 'Numbness or loss of sensation'],
                    ['skinSensitivity', 'Skin sensitivity / easy bruising'],
                    ['pregnant', 'Pregnant or recently gave birth'],
                    ['medications', 'Taking medication, blood thinners, painkillers, or supplements'],
                  ].map(([field, label]) => (
                    <div key={field} className="grid grid-cols-[1fr_auto] gap-2 items-center px-3 py-2 border-t border-stone-200 text-xs">
                      <span>{label}</span>
                      <div className="flex gap-3">
                        {['Yes', 'No'].map((answer) => (
                          <label key={answer} className="flex items-center gap-1">
                            <input type="radio" name={`condition-${field}`} value={answer} checked={bookingData.intake.conditions[field] === answer} onChange={() => updateCondition(field, answer)} />
                            {answer}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">If yes, please specify</label>
                  <textarea rows="2" value={bookingData.intake.details} onChange={(e) => updateIntake('details', e.target.value)} className="w-full p-2.5 rounded-xl border border-stone-300 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Areas of pain, discomfort, swelling, or numbness</label>
                  <textarea rows="2" value={bookingData.intake.painAreas} onChange={(e) => updateIntake('painAreas', e.target.value)} placeholder="Please describe the area(s)" className="w-full p-2.5 rounded-xl border border-stone-300 text-xs" />
                </div>
                <div>
                  <BodyAreaMap value={bookingData.intake.bodyAreas} onChange={(areas) => updateIntake('bodyAreas', areas)} />
                </div>
                <div className="border-t border-stone-200 pt-4">
                  <label className="block text-xs font-bold text-stone-700 mb-2">Preferred Pressure Level</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['Light', 'Medium', 'Firm', 'Extra Firm'].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => updateIntake('pressure', p)}
                        className={`py-2 text-xs font-semibold rounded-lg border transition ${
                          bookingData.intake.pressure === p ? 'bg-amber-100 border-amber-600 text-amber-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-600'
                        }`}
                      >{p}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Target / Focus Areas (Optional)</label>
                  <input type="text" placeholder="e.g. Lower back stiffness, shoulders, neck tension" value={bookingData.intake.focusAreas} onChange={(e) => updateIntake('focusAreas', e.target.value)} className="w-full p-2.5 rounded-xl border border-stone-300 text-xs" />
                </div>
                <div className="border-t border-stone-200 pt-4">
                  <label className="flex items-start gap-2 text-xs text-stone-700">
                    <input type="checkbox" required checked={bookingData.intake.consent} onChange={(e) => updateIntake('consent', e.target.checked)} className="mt-0.5" />
                    <span>I confirm that I have answered these questions truthfully and consent to massage treatment. I understand I may withdraw consent at any time.</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                    <input required placeholder="Typed signature" value={bookingData.intake.signature} onChange={(e) => updateIntake('signature', e.target.value)} className="w-full p-2.5 rounded-xl border border-stone-300 text-xs" />
                    <input required type="date" value={bookingData.intake.signatureDate} onChange={(e) => updateIntake('signatureDate', e.target.value)} className="w-full p-2.5 rounded-xl border border-stone-300 text-xs" />
                  </div>
                </div>
              </div>}
              {bookingData.intake.historyMode === 'reuse' && (
                <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  Your previous health history will be looked up securely when this booking is submitted. Make sure your email or phone number matches your previous profile.
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2.5 border border-stone-300 font-semibold rounded-xl text-stone-600 hover:bg-stone-100 transition"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!bookingData.customer.firstName || !bookingData.customer.phone || (isCoupleService && !bookingData.guestTwoName.trim()) || (!bookingData.intake.preCollectionConsent || (bookingData.intake.historyMode !== 'reuse' && (!bookingData.intake.consent || !bookingData.intake.signature)))}
                onClick={() => setStep(4)}
                className="px-6 py-2.5 bg-emerald-800 text-white font-semibold rounded-xl hover:bg-emerald-900 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm flex items-center"
              >
                Review Payment & Finalize <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
            </>}
            {showExistingPatientChoice && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
                  <h3 className="text-lg font-bold text-stone-900">Returning patient options</h3>
                  <p className="text-sm text-stone-600">Would you like to use your previous medical history, or review it and provide updates?</p>
                  <div className="grid gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        updateIntake('historyMode', 'reuse');
                        updateIntake('reuseExisting', true);
                        setShowExistingPatientChoice(false);
                      }}
                      className="p-4 text-left rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                    >
                      <strong className="block text-emerald-900">Use existing medical history</strong>
                      <span className="text-xs text-emerald-800">We will match it using your email or phone number.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateIntake('historyMode', 'update');
                        updateIntake('reuseExisting', false);
                        setShowExistingPatientChoice(false);
                      }}
                      className="p-4 text-left rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100"
                    >
                      <strong className="block text-amber-900">Review and update medical history</strong>
                      <span className="text-xs text-amber-800">The full form will remain available so you can report changes.</span>
                    </button>
                  </div>
                  <button type="button" onClick={() => setShowExistingPatientChoice(false)} className="w-full py-2 text-sm text-stone-600 underline">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Review & Final Submit */}
        {step === 4 && (
          <form onSubmit={handleFinalSubmit} className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-stone-900 mb-3">Booking Summary</h2>
              
              <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 space-y-3">
                <div className="flex justify-between items-start pb-3 border-b border-stone-200">
                  <div>
                    <div className="font-bold text-stone-900">{bookingData.service?.name}</div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {bookingData.branch?.name} • {bookingData.date} at {bookingData.time}
                    </div>
                  </div>
                  <span className="text-stone-900 font-bold">${bookingData.service?.price.toFixed(2)}</span>
                </div>

                <div className="space-y-1.5 text-xs text-stone-600">
                  <div className="flex justify-between">
                    <span>{isCoupleService ? 'Guest 1 therapist:' : 'Therapist:'}</span>
                    <span className="font-semibold text-stone-800">{bookingData.therapist?.name || 'Any Available'}</span>
                  </div>
                  {isCoupleService && (
                    <div className="flex justify-between">
                      <span>Guest 2 therapist:</span>
                      <span className="font-semibold text-stone-800">{bookingData.therapist2?.name || 'Any Available'}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Ontario HST (13%):</span>
                    <span>${financials.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-stone-900 pt-2 border-t border-stone-200">
                    <span>Total Service Amount:</span>
                    <span>${financials.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-stone-900 mb-3">Select Payment Option</h3>
              
              <div className="grid gap-3 sm:grid-cols-3">
                <div 
                  onClick={() => updateBooking('paymentOption', 'clinic')}
                  className={`p-4 rounded-xl border cursor-pointer transition ${
                    bookingData.paymentOption === 'clinic'
                      ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20'
                      : 'border-stone-200 hover:border-emerald-300'
                  }`}
                >
                  <div className="font-bold text-stone-900 text-sm">Option A: Pay at Clinic</div>
                  <p className="text-xs text-stone-500 mt-1">Book now, pay full amount after treatment</p>
                  <div className="mt-3 text-xs font-bold text-emerald-800">$0.00 Online Due</div>
                </div>

                <div 
                  onClick={() => updateBooking('paymentOption', 'deposit')}
                  className={`p-4 rounded-xl border cursor-pointer transition ${
                    bookingData.paymentOption === 'deposit'
                      ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20'
                      : 'border-stone-200 hover:border-emerald-300'
                  }`}
                >
                  <div className="font-bold text-stone-900 text-sm">Option B: Pay Deposit</div>
                  <p className="text-xs text-stone-500 mt-1">Hold slot with partial deposit online</p>
                  <div className="mt-3 text-xs font-bold text-emerald-800">
                    ${financials.deposit.toFixed(2)} Online Due
                  </div>
                </div>

                <div 
                  onClick={() => updateBooking('paymentOption', 'full')}
                  className={`p-4 rounded-xl border cursor-pointer transition ${
                    bookingData.paymentOption === 'full'
                      ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20'
                      : 'border-stone-200 hover:border-emerald-300'
                  }`}
                >
                  <div className="font-bold text-stone-900 text-sm">Option C: Full Prepayment</div>
                  <p className="text-xs text-stone-500 mt-1">Pay 100% online in advance</p>
                  <div className="mt-3 text-xs font-bold text-emerald-800">
                    ${financials.total.toFixed(2)} Online Due
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={isSubmitting}
                className="px-5 py-2.5 border border-stone-300 font-semibold rounded-xl text-stone-600 hover:bg-stone-100 transition"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-8 py-3 bg-emerald-800 text-white font-bold rounded-xl hover:bg-emerald-900 shadow-md transition flex items-center disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving & Syncing to Google Sheets...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Confirm & Complete Booking
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 5: Confirmation Success */}
        {step === 5 && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-bold text-stone-900">Booking Confirmed!</h2>
            <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto">
              We have received your appointment. A confirmation email summary has been queued for <span className="font-semibold">{bookingData.customer.email}</span>.
            </p>

            {/* Sync Badge */}
            {sheetsSyncStatus === 'success' && (
              <div className="inline-flex items-center space-x-2 bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-1.5 rounded-full text-xs font-semibold">
                <Database className="w-4 h-4 text-emerald-600" />
                <span>Saved to Google Sheets, Google Calendar, and confirmation email sent</span>
              </div>
            )}
            {sheetsSyncStatus === 'not_configured' && (
              <div className="inline-flex items-center space-x-2 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-1.5 rounded-full text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Saved locally. Google Sheets and Calendar sync is not configured.</span>
              </div>
            )}
            {sheetsSyncStatus === 'failed' && (
              <div className="inline-flex flex-col items-center space-y-1 bg-red-50 border border-red-300 text-red-800 px-4 py-2 rounded-xl text-xs">
                <span className="font-semibold">Saved locally, but Google Sheets and Calendar sync failed.</span>
                {sheetsSyncReason && <span>{sheetsSyncReason}</span>}
              </div>
            )}
            {sheetsSyncStatus === 'email_failed' && (
              <div className="inline-flex flex-col items-center space-y-1 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2 rounded-xl text-xs">
                <span className="font-semibold">Saved to Google Sheets and Calendar, but confirmation email failed.</span>
                {sheetsSyncReason && <span>{sheetsSyncReason}</span>}
              </div>
            )}
            {sheetsSyncStatus === 'patient_history_failed' && (
              <div className="inline-flex flex-col items-center space-y-1 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2 rounded-xl text-xs">
                <span className="font-semibold">Saved to the booking sheet and Calendar, but patient history could not be saved.</span>
                {sheetsSyncReason && <span>{sheetsSyncReason}</span>}
              </div>
            )}
            {sheetsSyncStatus === 'marketing_consent_failed' && (
              <div className="inline-flex flex-col items-center space-y-1 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2 rounded-xl text-xs">
                <span className="font-semibold">Booking saved, but your optional marketing preference could not be recorded.</span>
                {sheetsSyncReason && <span>{sheetsSyncReason}</span>}
              </div>
            )}
            {sheetsSyncStatus === 'loyalty_enrollment_failed' && (
              <div role="alert" className="inline-flex flex-col items-center space-y-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                <span className="font-semibold">Booking saved, but your Rewards enrollment or confirmation email could not be completed. Please contact the clinic to finish enrollment.</span>
                {sheetsSyncReason && <span>{sheetsSyncReason}</span>}
              </div>
            )}
            {bookingData.platinumEnrollment && sheetsSyncStatus === 'success' && (
              <div className="inline-flex flex-col items-center space-y-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-950">
                <span className="font-semibold">Company Platinum request saved.</span>
                <span>The clinic will verify your company and confirm payment before activating prepaid hours and booking benefits. We emailed {bookingData.customer.email}{loyaltyCompanyEmailNotified ? ' and copied the registered company contact' : ''} with the claim details.</span>
              </div>
            )}

            {squareEnabled && bookingData.paymentOption !== 'clinic' && sheetsSyncStatus !== 'failed' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 max-w-md mx-auto text-left space-y-3">
                <p className="text-sm font-semibold text-emerald-900">Pay online now with Square</p>
                <p className="text-xs text-emerald-800">
                  Securely pay your {bookingData.paymentOption === 'full' ? 'full balance' : 'deposit'} of{' '}
                  <span className="font-bold">${(bookingData.paymentOption === 'full' ? financials.total : financials.deposit).toFixed(2)}</span> using Square.
                </p>
                {squareCheckoutError && <p role="alert" className="text-xs text-red-700">{squareCheckoutError}</p>}
                <button
                  type="button"
                  disabled={squareCheckoutLoading}
                  onClick={() => payWithSquare(bookingData.paymentOption === 'full' ? financials.total : financials.deposit)}
                  className="w-full px-4 py-2.5 bg-emerald-700 text-white text-sm font-semibold rounded-xl hover:bg-emerald-800 transition disabled:opacity-60"
                >
                  {squareCheckoutLoading ? 'Preparing secure checkout…' : 'Pay with Square'}
                </button>
              </div>
            )}

            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 max-w-md mx-auto text-left space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-stone-500">Booking Reference:</span>
                <span className="font-mono font-bold text-stone-900">{bookingData.confirmationCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Location:</span>
                <span className="font-semibold text-stone-800">{bookingData.branch.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Service:</span>
                <span className="font-semibold text-stone-800">{bookingData.service?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Date & Time:</span>
                <span className="font-semibold text-stone-800">{bookingData.date} at {bookingData.time}</span>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={() => {
                  setStep(1);
                  setBookingData({
                    branch: branches[0],
                    service: null,
                    therapist: null,
                    therapist2: null,
                    date: new Date().toISOString().split('T')[0],
                    time: null,
                    marketingOptIn: false,
                    loyaltyOptIn: false,
                    platinumEnrollment: false,
                    companyName: '',
                    companyId: '',
                    guestTwoName: '',
                    customer: { firstName: '', lastName: '', email: '', phone: '' },
                    intake: {
                      pressure: 'Medium', focusAreas: '', injuries: '', agreeTerms: false,
                      dateOfBirth: '', gender: '', address: '', city: '', postalCode: '',
                      heardAbout: '', conditions: {
                        heart: '', bloodPressure: '', diabetes: '', cancer: '', headaches: '',
                        boneJoint: '', brokenBones: '', osteoporosis: '', allergies: '',
                        surgeries: '', numbness: '', skinSensitivity: '', pregnant: '', medications: '',
                      }, details: '', painAreas: '', bodyAreas: [], signature: '',
                      signatureDate: new Date().toISOString().split('T')[0], consent: false, reuseExisting: false,
                    },
                    paymentOption: 'deposit',
                    confirmationCode: ''
                  });
                  setLoyaltyCompanyEmailNotified(false);
                }}
                className="px-6 py-2.5 bg-stone-900 text-white font-semibold rounded-xl hover:bg-stone-800 transition"
              >
                Book Another Appointment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminPortal({ 
  branches, 
  onBranchesChange,
  branchesError,
  services, 
  onServicesChange,
  servicesError,
  therapists, 
  onTherapistsChange,
  therapistsError,
  bookings, 
  setBookings, 
  selectedBranchId, 
  setSelectedBranchId,
  lang,
  setLang
}) {
  const [activeTab, setActiveTab] = useState('schedule');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [branchForm, setBranchForm] = useState(() => branches.map((branch) => ({ ...branch })));
  const [isSavingBranches, setIsSavingBranches] = useState(false);
  const [branchSaveError, setBranchSaveError] = useState('');
  const [branchSaveMessage, setBranchSaveMessage] = useState('');

  useEffect(() => {
    setBranchForm(branches.map((branch) => ({ ...branch })));
  }, [branches]);

  const updateBranchField = (id, field, value) => {
    setBranchForm((prev) => prev.map((branch) => (branch.id === id ? { ...branch, [field]: value } : branch)));
  };

  const addBranchRow = () => {
    setBranchForm((prev) => [...prev, { id: -Date.now(), name: '', address: '', city: '', phone: '', active: true }]);
  };

  const removeBranchRow = (id) => {
    setBranchForm((prev) => prev.filter((branch) => branch.id !== id));
  };

  const saveBranchForm = async () => {
    setIsSavingBranches(true);
    setBranchSaveError('');
    setBranchSaveMessage('');
    try {
      const payload = branchForm.map((branch) => ({
        ...branch,
        id: branch.id > 0 ? branch.id : undefined,
      }));
      const response = await fetch('/api/booking?view=branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branches: payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      onBranchesChange(data.branches);
      setBranchSaveMessage('Branches saved. The booking portal will reflect these changes immediately.');
    } catch (error) {
      setBranchSaveError(error.message || 'Unable to save branches');
    } finally {
      setIsSavingBranches(false);
    }
  };

  const [serviceForm, setServiceForm] = useState(() => services.map((service) => ({ ...service })));
  const [isSavingServices, setIsSavingServices] = useState(false);
  const [serviceSaveError, setServiceSaveError] = useState('');
  const [serviceSaveMessage, setServiceSaveMessage] = useState('');

  useEffect(() => {
    setServiceForm(services.map((service) => ({ ...service })));
  }, [services]);

  const updateServiceField = (id, field, value) => {
    setServiceForm((prev) => prev.map((service) => (service.id === id ? { ...service, [field]: value } : service)));
  };

  const addServiceRow = () => {
    setServiceForm((prev) => [
      { id: -Date.now(), name: '', category: 'Thai Traditional', duration: 60, price: 100, deposit: 20, isRmt: false, taxRate: 0.13, description: '', active: true },
      ...prev,
    ]);
  };

  const removeServiceRow = (id) => {
    setServiceForm((prev) => prev.filter((service) => service.id !== id));
  };

  const saveServiceForm = async () => {
    setIsSavingServices(true);
    setServiceSaveError('');
    setServiceSaveMessage('');
    try {
      const payload = serviceForm.map((service) => ({
        ...service,
        id: service.id > 0 ? service.id : undefined,
        duration: Number(service.duration),
        price: Number(service.price),
        deposit: Number(service.deposit),
        taxRate: Number(service.taxRate),
      }));
      const response = await fetch('/api/booking?view=services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      onServicesChange(data.services);
      setServiceSaveMessage('Services saved. The booking portal will reflect these changes immediately.');
    } catch (error) {
      setServiceSaveError(error.message || 'Unable to save services');
    } finally {
      setIsSavingServices(false);
    }
  };

  const [businessProfile, setBusinessProfile] = useState(DEFAULT_BUSINESS_PROFILE);
  const [hasLoadedBusinessProfile, setHasLoadedBusinessProfile] = useState(false);
  const [isLoadingBusinessProfile, setIsLoadingBusinessProfile] = useState(false);
  const [isSavingBusinessProfile, setIsSavingBusinessProfile] = useState(false);
  const [businessProfileError, setBusinessProfileError] = useState('');
  const [businessProfileMessage, setBusinessProfileMessage] = useState('');
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState(null);
  const [issuedReceipt, setIssuedReceipt] = useState(null);
  const [isIssuingReceipt, setIsIssuingReceipt] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [isLinkingEvent, setIsLinkingEvent] = useState(false);
  const [linkEventForm, setLinkEventForm] = useState(null);
  const [receiptError, setReceiptError] = useState('');
  const [receiptNotice, setReceiptNotice] = useState('');
  const [reportStartDate, setReportStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return date.toISOString().slice(0, 10);
  });
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [googleAdsReport, setGoogleAdsReport] = useState(null);
  const [isLoadingGoogleAds, setIsLoadingGoogleAds] = useState(false);
  const [googleAdsError, setGoogleAdsError] = useState('');
  const [googleAdsStartDate, setGoogleAdsStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return date.toISOString().slice(0, 10);
  });
  const [googleAdsEndDate, setGoogleAdsEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [googleAdsCampaignSearch, setGoogleAdsCampaignSearch] = useState('');
  const [googleAdsCampaignStatus, setGoogleAdsCampaignStatus] = useState('all');
  const [googleAdsCampaignSort, setGoogleAdsCampaignSort] = useState('impressions');
  const [loyaltyDashboard, setLoyaltyDashboard] = useState(null);
  const [loyaltySettings, setLoyaltySettings] = useState({
    enabled: true,
    pointsPerDollar: 10,
    firstSessionMultiplier: 5,
    redemptionPoints: 10000,
    redemptionValue: 10,
    membershipPlans: {
      gold: { monthlyFee: 39, discountPercent: 10, pointsMultiplier: 1.5, freeHotStonePerMonth: 1 },
      platinum: { topUpPrice: 1500, includedHours: 50, discountPercent: 30, hotStoneDiscount: 10 },
      silver: { monthlyFee: 250, discountPercent: 5, maxEmployees: 50 },
    },
    tiers: [
      { name: 'Member', threshold: 0 },
      { name: 'Silver', threshold: 500 },
      { name: 'Gold', threshold: 1500 },
    ],
  });
  const [isLoadingLoyalty, setIsLoadingLoyalty] = useState(false);
  const [isSavingLoyalty, setIsSavingLoyalty] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState('');
  const [loyaltyNotice, setLoyaltyNotice] = useState('');
  const [loyaltyActionId, setLoyaltyActionId] = useState('');
  const [loyaltyMemberSearch, setLoyaltyMemberSearch] = useState('');
  const [loyaltyMemberTypeFilter, setLoyaltyMemberTypeFilter] = useState('all');
  const [loyaltyOnboardingSearch, setLoyaltyOnboardingSearch] = useState('');
  const [newLoyaltyMember, setNewLoyaltyMember] = useState({
    name: '', email: '', phone: '', membershipType: 'gold', organization: '', companyId: '', companyContactEmail: '', paidThrough: '', initialTopUpPaid: false, isPrimaryOwner: false,
  });
  const [isOnboardingLoyaltyMember, setIsOnboardingLoyaltyMember] = useState(false);
  const [selectedTopUpMember, setSelectedTopUpMember] = useState(null);
  const [selectedMembershipPayment, setSelectedMembershipPayment] = useState(null);
  const [membershipPaidThrough, setMembershipPaidThrough] = useState('');
  const [memberPendingRemoval, setMemberPendingRemoval] = useState(null);
  const [companyPendingRemoval, setCompanyPendingRemoval] = useState('');
  const [isRemovingLoyaltyEntry, setIsRemovingLoyaltyEntry] = useState(false);
  const [copyingPortalFor, setCopyingPortalFor] = useState('');
  const [selectedLoyaltyMember, setSelectedLoyaltyMember] = useState(null);
  const [loyaltyRedeemPoints, setLoyaltyRedeemPoints] = useState('');
  const [loyaltyRedeemBookingId, setLoyaltyRedeemBookingId] = useState('');
  const [campaignSubject, setCampaignSubject] = useState('');
  const [campaignPreview, setCampaignPreview] = useState('');
  const [campaignMessage, setCampaignMessage] = useState('');
  const [campaignGoal, setCampaignGoal] = useState('');
  const [campaignChatInput, setCampaignChatInput] = useState('');
  const [campaignConversation, setCampaignConversation] = useState([
    { role: 'assistant', text: 'Describe a group, or choose “All active opted-in subscribers” to include everyone. Branch, weekday, and recent-booking filters only match customers with corresponding booking history.' },
  ]);
  const [campaignAudience, setCampaignAudience] = useState(null);
  const [isBuildingCampaignAudience, setIsBuildingCampaignAudience] = useState(false);
  const [isGeneratingCampaignCopy, setIsGeneratingCampaignCopy] = useState(false);
  const [isSendingCampaign, setIsSendingCampaign] = useState(false);
  const [campaignDrafts, setCampaignDrafts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('medbook_email_campaign_drafts') || '[]');
    } catch {
      return [];
    }
  });
  const [campaignError, setCampaignError] = useState('');
  const [campaignNotice, setCampaignNotice] = useState('');
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [bookingLoadError, setBookingLoadError] = useState('');
  const [calendarDate, setCalendarDate] = useState(new Date().toISOString().split('T')[0]);
  const [calendarBranch, setCalendarBranch] = useState('all');
  const [calendarTherapist, setCalendarTherapist] = useState('all');
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
  const [calendarLoadError, setCalendarLoadError] = useState('');
  const [calendarUrl, setCalendarUrl] = useState('');
  const [calendarWarnings, setCalendarWarnings] = useState([]);
  const [patientHistory, setPatientHistory] = useState([]);
  const [selectedPatientHistory, setSelectedPatientHistory] = useState(null);
  const [isLoadingPatientHistory, setIsLoadingPatientHistory] = useState(false);
  const [patientHistoryLoadError, setPatientHistoryLoadError] = useState('');
  const [patientHistorySearch, setPatientHistorySearch] = useState('');

  const loadBusinessProfile = async () => {
    setIsLoadingBusinessProfile(true);
    setBusinessProfileError('');
    setBusinessProfileMessage('');
    try {
      const response = await fetch('/api/booking?view=business-profile');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setBusinessProfile({ ...DEFAULT_BUSINESS_PROFILE, ...data.profile });
      setHasLoadedBusinessProfile(true);
    } catch (error) {
      setBusinessProfileError(error.message || 'Unable to load the business profile');
    } finally {
      setIsLoadingBusinessProfile(false);
    }
  };

  useEffect(() => {
    loadBusinessProfile();
  }, []);

  useEffect(() => {
    if (activeTab === 'business-profile') loadBusinessProfile();
  }, [activeTab]);

  const loadGoogleAdsReport = async (startDate = googleAdsStartDate, endDate = googleAdsEndDate) => {
    setIsLoadingGoogleAds(true);
    setGoogleAdsError('');
    try {
      const query = new URLSearchParams({
        view: 'google-ads-report',
        startDate,
        endDate,
      });
      const response = await fetch(`/api/booking?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Google Ads returned status ${response.status}`);
      setGoogleAdsReport(data);
    } catch (error) {
      setGoogleAdsError(error.message || 'Unable to load Google Ads campaign data.');
    } finally {
      setIsLoadingGoogleAds(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'google-ads') loadGoogleAdsReport();
  }, [activeTab]);

  const loadLoyaltyDashboard = async () => {
    setIsLoadingLoyalty(true);
    setLoyaltyError('');
    try {
      const response = await fetch('/api/booking?view=loyalty-dashboard');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setLoyaltyDashboard(data);
      setLoyaltySettings(data.settings);
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to load the loyalty program.');
    } finally {
      setIsLoadingLoyalty(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'loyalty') loadLoyaltyDashboard();
  }, [activeTab]);

  const saveLoyaltySettings = async (event) => {
    event.preventDefault();
    setIsSavingLoyalty(true);
    setLoyaltyError('');
    setLoyaltyNotice('');
    try {
      const response = await fetch('/api/booking?view=loyalty-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: loyaltySettings }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setLoyaltySettings(data.settings);
      setLoyaltyNotice('Rewards program settings saved.');
      await loadLoyaltyDashboard();
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to save loyalty settings.');
    } finally {
      setIsSavingLoyalty(false);
    }
  };

  const awardLoyaltyPoints = async (booking) => {
    setLoyaltyActionId(booking.id);
    setLoyaltyError('');
    setLoyaltyNotice('');
    try {
      const response = await fetch('/api/booking?view=loyalty-award', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setLoyaltyNotice(data.alreadyAwarded
        ? 'Points or prepaid hours were already recorded for this booking.'
        : `${data.points ? `${data.points} points awarded to ${booking.customerName}` : `${booking.customerName}'s visit recorded`}${data.hoursUsed ? `; ${data.hoursUsed} prepaid hours used.` : '.'}${data.balanceEmailSent === false ? ` Balance email failed: ${data.balanceEmailError || 'check Gmail configuration.'}` : ' Loyalty balance email sent.'}`);
      await loadLoyaltyDashboard();
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to award loyalty points.');
    } finally {
      setLoyaltyActionId('');
    }
  };

  const redeemLoyaltyPoints = async (event) => {
    event.preventDefault();
    if (!selectedLoyaltyMember) return;
    setLoyaltyActionId(selectedLoyaltyMember.email);
    setLoyaltyError('');
    setLoyaltyNotice('');
    try {
      const response = await fetch('/api/booking?view=loyalty-redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: selectedLoyaltyMember.email,
          points: Number(loyaltyRedeemPoints),
          bookingId: loyaltyRedeemBookingId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setLoyaltyNotice(`${data.redeemedPoints.toLocaleString()} points redeemed for $${Number(data.rewardValue).toFixed(2)} off and linked to booking ${data.bookingId}. Remaining balance: ${data.remainingPoints.toLocaleString()} points.${data.emailSent ? ' Confirmation emailed; the receipt number will be linked and emailed when the receipt is issued.' : ` Redemption saved, but confirmation email failed: ${data.emailError || 'check Gmail configuration.'}`}`);
      setSelectedLoyaltyMember(null);
      setLoyaltyRedeemPoints('');
      setLoyaltyRedeemBookingId('');
      await loadLoyaltyDashboard();
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to redeem loyalty points.');
    } finally {
      setLoyaltyActionId('');
    }
  };

  const onboardLoyaltyMember = async (event) => {
    event.preventDefault();
    setIsOnboardingLoyaltyMember(true);
    setLoyaltyError('');
    setLoyaltyNotice('');
    try {
      const response = await fetch('/api/booking?view=loyalty-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLoyaltyMember),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to onboard member.');
      const platinumNextStep = data.member.membershipType === 'platinum' && !newLoyaltyMember.initialTopUpPaid
        ? ' The company request is pending; use the member row to record the top-up after payment is confirmed.'
        : newLoyaltyMember.initialTopUpPaid
          ? ` ${Number(data.hoursBalance).toFixed(2)} prepaid hours were added after confirming payment.`
          : '';
      setLoyaltyNotice(`${data.emailSent
        ? `Membership saved and eligibility details emailed to ${data.member.email}.`
        : `Membership saved, but the email could not be sent: ${data.emailError || 'check Gmail configuration and retry.'}`}${platinumNextStep}`);
      setNewLoyaltyMember({ name: '', email: '', phone: '', membershipType: 'gold', organization: '', companyId: '', companyContactEmail: '', paidThrough: '', initialTopUpPaid: false, isPrimaryOwner: false });
      setLoyaltyOnboardingSearch('');
      await loadLoyaltyDashboard();
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to onboard member.');
    } finally {
      setIsOnboardingLoyaltyMember(false);
    }
  };

  const recordPlatinumTopUp = async () => {
    if (!selectedTopUpMember) return;
    setLoyaltyActionId(selectedTopUpMember.email);
    setLoyaltyError('');
    setLoyaltyNotice('');
    try {
      const response = await fetch('/api/booking?view=loyalty-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: selectedTopUpMember.email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to record Platinum top-up.');
      setLoyaltyNotice(`Recorded $${Number(loyaltySettings.membershipPlans.platinum.topUpPrice).toFixed(2)} payment; ${data.hoursAdded} prepaid hours added. New balance: ${Number(data.hoursBalance).toFixed(2)} hours.${data.emailSent ? ' Balance email sent.' : ` Balance email failed: ${data.emailError || 'check Gmail configuration.'}`}`);
      setSelectedTopUpMember(null);
      await loadLoyaltyDashboard();
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to record Platinum top-up.');
    } finally {
      setLoyaltyActionId('');
    }
  };

  const makePrimaryContact = async (member) => {
    setLoyaltyActionId(member.email);
    setLoyaltyError('');
    setLoyaltyNotice('');
    try {
      const response = await fetch('/api/booking?view=loyalty-set-primary-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: member.email, isPrimaryOwner: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to update the primary contact.');
      setLoyaltyNotice(`${member.name || member.email} is now the primary owner/contact for ${member.organization || 'this company'} — only they can top up the shared balance.`);
      await loadLoyaltyDashboard();
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to update the primary contact.');
    } finally {
      setLoyaltyActionId('');
    }
  };

  const recordMembershipPayment = async (event) => {
    event.preventDefault();
    if (!selectedMembershipPayment || !membershipPaidThrough) return;
    setLoyaltyActionId(selectedMembershipPayment.email);
    setLoyaltyError('');
    setLoyaltyNotice('');
    try {
      const response = await fetch('/api/booking?view=loyalty-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: selectedMembershipPayment.email,
          organization: selectedMembershipPayment.membershipType === 'silver' ? selectedMembershipPayment.organization : '',
          paidThrough: membershipPaidThrough,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to record membership payment.');
      const emailStatus = data.emailFailures?.length
        ? ` ${data.emailFailures.length} payment notification(s) failed.`
        : ` Payment confirmations emailed to ${data.emailsSent} member(s).`;
      setLoyaltyNotice(`Payment recorded through ${data.paidThrough} for ${data.updatedCount} member(s).${emailStatus}`);
      setSelectedMembershipPayment(null);
      setMembershipPaidThrough('');
      await loadLoyaltyDashboard();
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to record membership payment.');
    } finally {
      setLoyaltyActionId('');
    }
  };

  const removeLoyaltyMember = async () => {
    if (!memberPendingRemoval) return;
    setIsRemovingLoyaltyEntry(true);
    setLoyaltyError('');
    setLoyaltyNotice('');
    try {
      const response = await fetch('/api/booking?view=loyalty-remove-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: memberPendingRemoval.email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to remove this member.');
      setLoyaltyNotice(`${memberPendingRemoval.name || memberPendingRemoval.email} was removed from the loyalty program.${data.emailSent ? ' Removal notice emailed.' : data.emailError ? ` Removal notice failed: ${data.emailError}` : ''}`);
      setMemberPendingRemoval(null);
      await loadLoyaltyDashboard();
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to remove this member.');
    } finally {
      setIsRemovingLoyaltyEntry(false);
    }
  };

  const removeLoyaltyCompany = async () => {
    if (!companyPendingRemoval) return;
    setIsRemovingLoyaltyEntry(true);
    setLoyaltyError('');
    setLoyaltyNotice('');
    try {
      const response = await fetch('/api/booking?view=loyalty-remove-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization: companyPendingRemoval }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to remove this company.');
      setLoyaltyNotice(`Removed ${data.removedCount} member(s) from ${data.organization}.${data.emailsSent ? ` ${data.emailsSent} removal notice(s) emailed.` : ''}${data.emailsFailed ? ` ${data.emailsFailed} notice(s) failed.` : ''}`);
      setCompanyPendingRemoval('');
      await loadLoyaltyDashboard();
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to remove this company.');
    } finally {
      setIsRemovingLoyaltyEntry(false);
    }
  };

  const copyCompanyPortalLink = async (member) => {
    setLoyaltyError('');
    setLoyaltyNotice('');
    setCopyingPortalFor(member.organization);
    try {
      const response = await fetch('/api/booking?view=company-portal-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization: member.organization, companyId: member.companyId, companyContactEmail: member.companyContactEmail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to create a company portal link.');
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(data.portalUrl);
      setLoyaltyNotice(navigator.clipboard?.writeText
        ? `Company portal link for ${member.organization} copied to clipboard.`
        : `Company portal link for ${member.organization}: ${data.portalUrl}`);
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to create a company portal link.');
    } finally {
      setCopyingPortalFor('');
    }
  };

  const applyGoogleAdsPreset = (days) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    const formatDate = (date) => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    const startDate = formatDate(start);
    const endDate = formatDate(end);
    setGoogleAdsStartDate(startDate);
    setGoogleAdsEndDate(endDate);
    loadGoogleAdsReport(startDate, endDate);
  };

  const visibleGoogleAdsCampaigns = useMemo(() => {
    const campaigns = [...(googleAdsReport?.campaigns || [])]
      .filter((campaign) => googleAdsCampaignStatus === 'all' || campaign.status === googleAdsCampaignStatus)
      .filter((campaign) => campaign.name.toLowerCase().includes(googleAdsCampaignSearch.trim().toLowerCase()));
    campaigns.sort((a, b) => googleAdsCampaignSort === 'name'
      ? a.name.localeCompare(b.name)
      : Number(b[googleAdsCampaignSort] || 0) - Number(a[googleAdsCampaignSort] || 0));
    return campaigns;
  }, [googleAdsReport, googleAdsCampaignSearch, googleAdsCampaignStatus, googleAdsCampaignSort]);

  const recentLoyaltyTransactions = useMemo(() => (loyaltyDashboard?.members || [])
    .flatMap((member) => member.transactions.map((transaction) => ({
      ...transaction,
      memberName: member.name || member.email,
    })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10), [loyaltyDashboard]);

  const saveBusinessProfile = async (event) => {
    event.preventDefault();
    setIsSavingBusinessProfile(true);
    setBusinessProfileError('');
    setBusinessProfileMessage('');
    try {
      const response = await fetch('/api/booking?view=business-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: businessProfile }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setBusinessProfile({ ...DEFAULT_BUSINESS_PROFILE, ...data.profile });
      setBusinessProfileMessage('Business profile saved and synced for your owner account.');
    } catch (error) {
      setBusinessProfileError(error.message || 'Unable to save the business profile');
    } finally {
      setIsSavingBusinessProfile(false);
    }
  };

  // Staff management state — therapist roster with per-weekday branch rotation, synced with the backend
  const [therapistForm, setTherapistForm] = useState(() => therapists.map((therapist) => ({ ...therapist, schedule: { ...therapist.schedule } })));
  const [isSavingTherapists, setIsSavingTherapists] = useState(false);
  const [therapistSaveError, setTherapistSaveError] = useState('');
  const [therapistSaveMessage, setTherapistSaveMessage] = useState('');

  useEffect(() => {
    setTherapistForm(therapists.map((therapist) => ({ ...therapist, schedule: { ...therapist.schedule } })));
  }, [therapists]);

  const updateTherapistField = (id, field, value) => {
    setTherapistForm((prev) => prev.map((therapist) => (therapist.id === id ? { ...therapist, [field]: value } : therapist)));
  };

  const updateTherapistScheduleDay = (id, dayKey, branchIdRaw) => {
    const branchId = branchIdRaw === '' ? null : Number(branchIdRaw);
    setTherapistForm((prev) => prev.map((therapist) => (
      therapist.id === id ? { ...therapist, schedule: { ...therapist.schedule, [dayKey]: branchId } } : therapist
    )));
  };

  const addTherapistRow = () => {
    setTherapistForm((prev) => [
      { id: -Date.now(), name: '', bio: '', rating: 4.9, thaiCertified: true, rmtCertified: false, branches: [], schedule: {}, active: true },
      ...prev,
    ]);
  };

  const removeTherapistRow = (id) => {
    setTherapistForm((prev) => prev.filter((therapist) => therapist.id !== id));
  };

  const saveTherapistForm = async () => {
    setIsSavingTherapists(true);
    setTherapistSaveError('');
    setTherapistSaveMessage('');
    try {
      const payload = therapistForm.map((therapist) => ({
        ...therapist,
        id: therapist.id > 0 ? therapist.id : undefined,
        rating: Number(therapist.rating),
      }));
      const response = await fetch('/api/booking?view=therapists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ therapists: payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      onTherapistsChange(data.therapists);
      setTherapistSaveMessage('Therapist roster and branch rotation saved. This syncs to the booking portal and therapist portal immediately.');
    } catch (error) {
      setTherapistSaveError(error.message || 'Unable to save therapists');
    } finally {
      setIsSavingTherapists(false);
    }
  };

  const WEEKDAYS = [
    { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
    { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
  ];

  const t = TRANSLATIONS[lang];

  const totalRevenue = useMemo(() => bookings.reduce((sum, b) => sum + b.total, 0), [bookings]);
  const hstCollected = useMemo(() => bookings.reduce((sum, b) => sum + (b.total - (b.total / 1.13)), 0), [bookings]);

  const loadBookingsFromBackend = async () => {
    setIsLoadingBookings(true);
    setBookingLoadError('');
    try {
      const response = await fetch('/api/booking');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setBookings(data.bookings || []);
    } catch (error) {
      setBookingLoadError(error.message || 'Unable to load bookings from Google Sheets');
    } finally {
      setIsLoadingBookings(false);
    }
  };

  useEffect(() => {
    if (['schedule', 'reports'].includes(activeTab)) loadBookingsFromBackend();
  }, [activeTab]);

  const issueReceipt = async (bookingId) => {
    setIsIssuingReceipt(true);
    setReceiptError('');
    setReceiptNotice('');
    try {
      const response = await fetch('/api/booking?view=issue-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setIssuedReceipt(data);
      setReceiptNotice(data.alreadyIssued ? `Receipt ${data.receipt.number} was already emailed.` : `Receipt ${data.receipt.number} was emailed to ${data.booking.email}.`);
      await loadCalendar();
    } catch (error) {
      setReceiptError(error.message || 'Unable to issue receipt');
    } finally {
      setIsIssuingReceipt(false);
    }
  };

  const markBookingPaid = async (booking) => {
    setIsMarkingPaid(true);
    setReceiptError('');
    setReceiptNotice('');
    try {
      const response = await fetch('/api/booking?view=mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setSelectedCalendarEvent((current) => current ? {
        ...current,
        booking: { ...current.booking, ...data.booking },
      } : current);
      setBookings((current) => current.map((item) => item.id === data.booking.id
        ? { ...item, paidAmount: data.booking.paidAmount }
        : item));
      setReceiptNotice(data.alreadyPaid
        ? 'This appointment was already marked as paid.'
        : `Payment of $${Number(data.booking.paidAmount).toFixed(2)} recorded. You can now issue the receipt.`);
      await loadCalendar();
    } catch (error) {
      setReceiptError(error.message || 'Unable to record payment');
    } finally {
      setIsMarkingPaid(false);
    }
  };

  useEffect(() => {
    const booking = selectedCalendarEvent?.booking;
    if (booking?.autoLinked) {
      setLinkEventForm({
        email: booking.email || '',
        phone: booking.phone || '',
        paymentOption: booking.paymentOption || 'Cash',
        paidAmount: booking.paidAmount ? String(booking.paidAmount) : '',
        total: booking.total ? String(booking.total) : '',
      });
    } else {
      setLinkEventForm(null);
    }
  }, [selectedCalendarEvent?.id, selectedCalendarEvent?.booking?.autoLinked]);

  const completeBookingDetails = async (event) => {
    event.preventDefault();
    const booking = selectedCalendarEvent?.booking;
    if (!booking || !linkEventForm) return;
    setIsLinkingEvent(true);
    setReceiptError('');
    setReceiptNotice('');
    try {
      const response = await fetch('/api/booking?view=complete-booking-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          email: linkEventForm.email,
          phone: linkEventForm.phone,
          paymentOption: linkEventForm.paymentOption,
          paidAmount: linkEventForm.paidAmount,
          total: linkEventForm.total,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setSelectedCalendarEvent((current) => current ? { ...current, booking: data.booking } : current);
      setBookings((current) => current.map((item) => item.id === data.booking.id ? { ...item, ...data.booking } : item));
      setReceiptNotice('Booking details saved.');
    } catch (error) {
      setReceiptError(error.message || 'Unable to save these booking details');
    } finally {
      setIsLinkingEvent(false);
    }
  };

  const saveCampaignDraft = (event) => {
    event.preventDefault();
    setCampaignError('');
    setCampaignNotice('');
    if (!campaignSubject.trim() || !campaignMessage.trim()) {
      setCampaignError('Add a subject and message before saving the campaign draft.');
      return;
    }
    const draft = {
      id: crypto.randomUUID(),
      subject: campaignSubject.trim(),
      preview: campaignPreview.trim(),
      message: campaignMessage.trim(),
      updatedAt: new Date().toISOString(),
    };
    const nextDrafts = [draft, ...campaignDrafts];
    try {
      localStorage.setItem('medbook_email_campaign_drafts', JSON.stringify(nextDrafts));
      setCampaignDrafts(nextDrafts);
      setCampaignNotice('Campaign saved as a draft on this device. It has not been sent.');
    } catch {
      setCampaignError('Could not save the draft in this browser. Check available browser storage and try again.');
    }
  };

  const removeCampaignDraft = (draftId) => {
    const nextDrafts = campaignDrafts.filter((draft) => draft.id !== draftId);
    try {
      localStorage.setItem('medbook_email_campaign_drafts', JSON.stringify(nextDrafts));
      setCampaignDrafts(nextDrafts);
    } catch {
      setCampaignError('Could not update saved drafts in this browser.');
    }
  };

  const askCampaignAudience = async (query = campaignChatInput) => {
    const cleanQuery = query.trim();
    if (!cleanQuery || isBuildingCampaignAudience || isSendingCampaign) return;
    setCampaignError('');
    setCampaignNotice('');
    setCampaignChatInput('');
    setCampaignAudience(null);
    setCampaignConversation((current) => [...current, { role: 'user', text: cleanQuery }]);
    setIsBuildingCampaignAudience(true);
    try {
      const response = await fetch('/api/booking?view=campaign-audience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuery }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setCampaignAudience({ query: cleanQuery, ...data });
      const readinessMessage = data.sendReady ? '' : ` ${data.sendBlockReason}`;
      const filterMessage = data.count < data.subscriberCount
        ? ' A filter can exclude subscribers who do not have matching booking history. Choose “All active opted-in subscribers” to include everyone.'
        : '';
      setCampaignConversation((current) => [...current, {
        role: 'assistant',
        text: `${data.description} I found ${data.count} matching ${data.count === 1 ? 'person' : 'people'} from ${data.subscriberCount} active opted-in subscribers.${filterMessage}${readinessMessage}`,
      }]);
    } catch (error) {
      setCampaignAudience(null);
      setCampaignConversation((current) => [...current, {
        role: 'assistant',
        text: error.message || 'I could not build that audience. Try one of the example requests.',
      }]);
    } finally {
      setIsBuildingCampaignAudience(false);
    }
  };

  const generateCampaignCopy = async () => {
    if (!campaignAudience || isGeneratingCampaignCopy || isBuildingCampaignAudience || isSendingCampaign) return;
    if (!campaignGoal.trim()) {
      setCampaignError('Describe what this campaign should communicate before generating a draft.');
      return;
    }
    setCampaignError('');
    setCampaignNotice('');
    setIsGeneratingCampaignCopy(true);
    try {
      const response = await fetch('/api/booking?view=campaign-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: campaignAudience.query,
          goal: campaignGoal,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setCampaignSubject(data.draft.subject);
      setCampaignPreview(data.draft.preview);
      setCampaignMessage(data.draft.message);
      setCampaignNotice(`AI drafted a message for ${data.audienceCount} matching opted-in recipients. Review and edit it before saving or sending.`);
    } catch (error) {
      setCampaignError(error.message || 'Unable to generate a campaign draft');
    } finally {
      setIsGeneratingCampaignCopy(false);
    }
  };

  const sendCampaign = async () => {
    if (isBuildingCampaignAudience || isSendingCampaign || !campaignAudience || !campaignAudience.sendReady || campaignAudience.count < 1 || campaignAudience.count > 50) return;
    if (!campaignSubject.trim() || !campaignMessage.trim()) {
      setCampaignError('Add a subject and message before sending.');
      return;
    }
    const confirmed = window.confirm(
      `Send “${campaignSubject.trim()}” to ${campaignAudience.count} opted-in recipients?\n\nAudience: ${campaignAudience.description}\n\nThis sends immediately from ${campaignAudience.senderEmail || 'mythaithaimassage@gmail.com'}.`,
    );
    if (!confirmed) return;
    setIsSendingCampaign(true);
    setCampaignError('');
    setCampaignNotice('');
    try {
      const response = await fetch('/api/booking?view=campaign-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: campaignAudience.query,
          subject: campaignSubject,
          preview: campaignPreview,
          message: campaignMessage,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setCampaignNotice(`Campaign sent to ${data.sent} of ${data.audienceCount} opted-in recipients.${data.failed ? ` ${data.failed} message${data.failed === 1 ? '' : 's'} failed; check server logs before retrying to avoid duplicate emails.` : ''}`);
      setCampaignAudience(null);
      if (data.failed) setCampaignError('Some campaign emails failed to send. Do not resend until you have checked which messages were delivered.');
      setCampaignConversation((current) => [...current, {
        role: 'assistant',
        text: `Campaign delivery finished: ${data.sent} sent and ${data.failed} failed.`,
      }]);
    } catch (error) {
      setCampaignError(error.message || 'Unable to send campaign');
    } finally {
      setIsSendingCampaign(false);
    }
  };

  const printIssuedReceipt = (data) => {
    const popup = window.open('', '_blank', 'width=800,height=900');
    if (!popup) {
      setReceiptError('Allow pop-ups to print the receipt.');
      return;
    }
    const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
    const { receipt, booking, businessProfile: profile } = data;
    popup.document.write(`<!doctype html><html><head><title>Receipt ${safe(receipt.number)}</title><meta charset="utf-8"><style>body{font:15px Arial,sans-serif;color:#17231e;max-width:760px;margin:48px auto;padding:32px}header{display:flex;justify-content:space-between;border-bottom:3px solid #087765;padding-bottom:20px}h1{font-size:28px;margin:0}small,.muted{color:#65716b}.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #e5ebe7}.total{font-size:20px;font-weight:bold;border-top:2px solid #087765;margin-top:18px;padding-top:18px}.balance{margin-top:20px;padding:12px;background:#eff6f3;border-radius:8px}button{margin:24px 0;padding:10px 18px;background:#073d32;color:white;border:0;border-radius:8px}@media print{button{display:none}body{margin:0 auto}}</style></head><body><header><div><h1>${safe(profile.businessName)}</h1><p class="muted">${safe(profile.legalName)}</p><p class="muted">${safe(profile.address)}</p><p class="muted">${safe(profile.phone)} · ${safe(profile.email)}</p>${profile.taxRegistrationNumber ? `<p class="muted">GST/HST No.: ${safe(profile.taxRegistrationNumber)}</p>` : ''}</div><h1>RECEIPT</h1></header><p><strong>Receipt No.</strong> ${safe(receipt.number)}<br><strong>Issued</strong> ${safe(receipt.issuedAt.slice(0, 10))}</p><p><strong>Client</strong> ${safe(booking.customerName)}<br>${safe(booking.email)}<br>${safe(booking.phone)}</p><p><strong>Service date</strong> ${safe(booking.date)}<br><strong>Payment method</strong> ${safe(booking.paymentOption)}</p><div class="row"><strong>${safe(booking.serviceName)}</strong><span>$${receipt.subtotal.toFixed(2)}</span></div>${receipt.loyaltyDiscount > 0 ? `<div class="row"><span>Loyalty discount · ${receipt.pointsRedeemed.toLocaleString()} points</span><span>-$${receipt.loyaltyDiscount.toFixed(2)}</span></div>` : ''}<div class="row"><span>${safe(receipt.taxLabel)}</span><span>$${receipt.tax.toFixed(2)}</span></div><div class="row total"><span>Total paid</span><span>$${receipt.total.toFixed(2)}</span></div>${receipt.loyaltyMember ? `<p class="balance"><strong>Loyalty points balance:</strong> ${receipt.pointsBalance.toLocaleString()}</p>` : ''}<p class="muted" style="text-align:center;margin-top:64px">Thank you for choosing ${safe(profile.businessName)}.</p><button onclick="window.print()">Print receipt</button></body></html>`);
    popup.document.close();
    popup.focus();
  };

  const loadCalendar = async () => {
    setIsLoadingCalendar(true);
    setCalendarLoadError('');
    try {
      const branch = calendarBranch === 'all' ? '' : branches.find((item) => String(item.id) === calendarBranch)?.address || '';
      const therapist = calendarTherapist === 'all' ? '' : therapists.find((item) => String(item.id) === calendarTherapist)?.name || '';
      const response = await fetch(`/api/booking?view=calendar&date=${encodeURIComponent(calendarDate)}&branch=${encodeURIComponent(branch)}&therapist=${encodeURIComponent(therapist)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setCalendarEvents(data.events || []);
      setCalendarUrl(data.calendarUrl || '');
      setCalendarWarnings(data.errors || []);
    } catch (error) {
      setCalendarLoadError(error.message || 'Unable to load Google Calendar events');
    } finally {
      setIsLoadingCalendar(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'calendar') loadCalendar();
  }, [activeTab, calendarDate, calendarBranch, calendarTherapist]);

  const loadPatientHistory = async () => {
    setIsLoadingPatientHistory(true);
    setPatientHistoryLoadError('');
    try {
      const response = await fetch('/api/booking?view=patient-history');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setPatientHistory(data.patientHistory || []);
      setSelectedPatientHistory((current) => current || data.patientHistory?.[0] || null);
    } catch (error) {
      setPatientHistoryLoadError(error.message || 'Unable to load patient history');
    } finally {
      setIsLoadingPatientHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'patient-history') loadPatientHistory();
  }, [activeTab]);

  const filteredPatientHistory = patientHistory.filter((profile) => {
    const query = patientHistorySearch.trim().toLowerCase();
    return !query || [profile.patientName, profile.bookingId, profile.email, profile.phone]
      .some((value) => value.toLowerCase().includes(query));
  });

  const selectedConditionFlags = selectedPatientHistory
    ? Object.entries(selectedPatientHistory.conditions).filter(([, value]) => value.toLowerCase() === 'yes')
    : [];

  const adminNavigation = [
    { id: 'schedule', label: 'Home', icon: Home, section: 'Workspace' },
    { id: 'calendar', label: 'Booking Calendar', icon: CalendarDays, section: 'Workspace' },
    { id: 'schedule', label: 'Events & bookings', icon: CalendarIcon, section: 'Workspace' },
    { id: 'reports', label: 'Sales & reports', icon: BarChart3, section: 'Workspace' },
    { id: 'services', label: 'Service catalogue', icon: Layers, section: 'Manage' },
    { id: 'staff', label: 'Staff', icon: Users, section: 'Manage' },
    { id: 'branches', label: 'Branches', icon: MapPin, section: 'Manage' },
    { id: 'patient-history', label: 'Patients', icon: UserRound, section: 'Manage' },
    { id: 'business-profile', label: 'Business profile', icon: Building, section: 'Manage' },
    { id: 'loyalty', label: 'Loyalty program', icon: Award, section: 'Grow' },
    { id: 'marketing', label: 'Email marketing', icon: Megaphone, section: 'Grow' },
    { id: 'google-ads', label: 'Google Ads', icon: TrendingUp, section: 'Grow' },
  ];
  const navigationSections = ['Workspace', 'Manage', 'Grow'];
  const pageTitle = {
    schedule: t.schedule,
    calendar: 'Booking Calendar',
    reports: 'Sales & reports',
    loyalty: 'Loyalty program',
    marketing: 'Email marketing',
    'google-ads': 'Google Ads',
    services: t.services,
    staff: t.staff,
    branches: 'Branches',
    'patient-history': 'Patient Summary',
    'business-profile': 'Business profile',
  }[activeTab] || 'Owner dashboard';

  return (
    <div className="min-h-[calc(100vh-58px)] bg-[#f1f3f7] lg:flex">
      <aside className="sticky top-[58px] hidden h-[calc(100vh-58px)] w-64 shrink-0 flex-col bg-[#111722] text-slate-300 lg:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-sm font-black text-slate-950">M</div>
          <div>
            <div className="text-base font-bold tracking-tight text-white">MedBook</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Practice manager</div>
          </div>
        </div>
        <div className="px-4 py-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quick actions <ChevronRightIcon className="float-right h-3.5 w-3.5 rotate-90" /></div>
        </div>
        <nav aria-label="Owner dashboard navigation" className="flex-1 overflow-y-auto px-3 pb-4">
          {navigationSections.map((section) => (
            <div key={section} className="mb-5">
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{section}</p>
              <div className="space-y-1">
                {adminNavigation.filter((item) => item.section === section).map((item, index) => {
                  const Icon = item.icon;
                  const selected = activeTab === item.id && !adminNavigation.slice(0, adminNavigation.indexOf(item)).some((prior) => prior.id === item.id && prior.section === section);
                  return (
                    <button
                      key={`${item.section}-${item.label}-${index}`}
                      onClick={() => { setActiveTab(item.id); setMobileNavOpen(false); }}
                      aria-current={selected ? 'page' : undefined}
                      className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition ${selected ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-emerald-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
                      <span className="flex-1">{item.label}</span>
                      {selected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.05] p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-950">MT</div>
            <div className="min-w-0"><div className="truncate text-xs font-semibold text-white">Practice owner</div><div className="text-[10px] text-slate-500">Owner account</div></div>
            <ShieldCheck className="ml-auto h-4 w-4 shrink-0 text-emerald-300" />
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-[58px] z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:top-[58px]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" aria-label="Toggle dashboard menu" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"><Menu className="h-4 w-4" /></button>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{businessProfile.businessName || 'MY THAI THAI'}</p>
                <p className="hidden text-[11px] text-slate-500 sm:block">{pageTitle} <span className="px-1 text-slate-300">/</span> Owner workspace</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden items-center gap-1.5 text-[11px] font-medium text-slate-500 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Workspace active</span>
              <div className="flex items-center rounded-lg border border-slate-200 p-0.5">
                <button onClick={() => setLang('en')} className={`rounded-md px-2 py-1 text-[10px] font-bold ${lang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>EN</button>
                <button onClick={() => setLang('th')} className={`rounded-md px-2 py-1 text-[10px] font-bold ${lang === 'th' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>ไทย</button>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-950">MT</div>
            </div>
          </div>
          {mobileNavOpen && (
            <nav aria-label="Mobile owner dashboard navigation" className="mt-3 grid grid-cols-2 gap-1 border-t border-slate-100 pt-3 sm:grid-cols-3">
              {adminNavigation.map((item, index) => {
                const Icon = item.icon;
                return <button key={`${item.label}-${index}`} onClick={() => { setActiveTab(item.id); setMobileNavOpen(false); }} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold ${activeTab === item.id ? 'bg-emerald-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" />{item.label}</button>;
              })}
            </nav>
          )}
        </div>

        <main className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 xl:p-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-emerald-950 to-emerald-800 px-5 py-6 text-white shadow-xl shadow-emerald-950/10 sm:px-8 sm:py-8">
        <div aria-hidden="true" className="absolute -right-16 -top-28 h-72 w-72 rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute -right-2 -top-14 h-48 w-48 rounded-full border border-white/10" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Owner dashboard
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{businessProfile.businessName || 'MY THAI THAI'}</h1>
            <p className="mt-2 max-w-2xl text-sm text-emerald-50/75">{businessProfile.tagline || t.subTitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-xl border border-white/15 bg-white/10 p-1">
              <Globe className="ml-2 mr-1 h-3.5 w-3.5 text-emerald-100" />
              <button onClick={() => setLang('en')} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${lang === 'en' ? 'bg-white text-emerald-950' : 'text-white hover:bg-white/10'}`}>EN</button>
              <button onClick={() => setLang('th')} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${lang === 'th' ? 'bg-white text-emerald-950' : 'text-white hover:bg-white/10'}`}>ไทย</button>
            </div>
            <button
              onClick={() => setActiveTab('business-profile')}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-emerald-950 shadow-lg transition hover:bg-emerald-50"
            >
              <Settings className="h-4 w-4" />
              Edit business profile
            </button>
          </div>
        </div>
        <div className="relative z-10 mt-6 flex flex-wrap items-center gap-2 border-t border-white/15 pt-5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100/70">Location</span>
          <button onClick={() => setSelectedBranchId('all')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${selectedBranchId === 'all' ? 'bg-white text-emerald-950' : 'text-white/80 hover:bg-white/10'}`}>{t.allBranches}</button>
          {branches.map((branch) => (
            <button key={branch.id} onClick={() => setSelectedBranchId(branch.id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${selectedBranchId === branch.id ? 'bg-white text-emerald-950' : 'text-white/80 hover:bg-white/10'}`}>{branch.name}</button>
          ))}
          <span className="ml-auto hidden text-xs text-emerald-100/70 sm:inline">Practice & branch management</span>
        </div>
      </section>

      {/* Admin KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-500">{t.revenueToday}</div><span className="rounded-xl bg-emerald-50 p-2 text-emerald-800"><TrendingUp className="h-4 w-4" /></span></div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-emerald-900">${totalRevenue.toFixed(2)}</div>
          <div className="mt-1 text-[11px] text-slate-400">Across current bookings</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-500">{t.appointmentsToday}</div><span className="rounded-xl bg-blue-50 p-2 text-blue-800"><CalendarIcon className="h-4 w-4" /></span></div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{bookings.length}</div>
          <div className="mt-1 text-[11px] text-slate-400">Appointments on record</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-500">{t.activeStaff}</div><span className="rounded-xl bg-amber-50 p-2 text-amber-800"><Users className="h-4 w-4" /></span></div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{therapists.length}</div>
          <div className="mt-1 text-[11px] text-slate-400">Therapists & practitioners</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-500">{t.hstCollected}</div><span className="rounded-xl bg-violet-50 p-2 text-violet-800"><DollarSign className="h-4 w-4" /></span></div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">${hstCollected.toFixed(2)}</div>
          <div className="mt-1 text-[11px] text-slate-400">Estimated Ontario HST</div>
        </div>
      </div>

      {/* TAB CONTENT: SCHEDULE */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-stone-900">{t.schedule}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={loadBookingsFromBackend}
                disabled={isLoadingBookings}
                className="px-3 py-2 border border-stone-300 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-50 disabled:opacity-50"
              >
                {isLoadingBookings ? 'Loading...' : 'Refresh from Google Sheets'}
              </button>
              <button
              onClick={() => {
                const customerName = prompt(lang === 'th' ? "ชื่อลูกค้า (Walk-in / Phone):" : "Customer Name:");
                if (!customerName) return;
                const newB = {
                  id: 'MTT-' + Math.floor(100000 + Math.random() * 900000),
                  customerName,
                  phone: 'Walk-in',
                  email: 'N/A',
                  serviceId: services[0].id,
                  serviceName: services[0].name,
                  branchId: selectedBranchId === 'all' ? 1 : selectedBranchId,
                  therapistId: 1,
                  therapistName: 'Kanya S.',
                  date: new Date().toISOString().split('T')[0],
                  time: '02:00 PM',
                  status: 'Confirmed',
                  paidAmount: services[0].price,
                  total: services[0].price * 1.13,
                  syncedToSheets: false
                };
                setBookings(prev => [newB, ...prev]);
              }}
              className="px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold hover:bg-emerald-900 transition flex items-center"
              >
                <Plus className="w-4 h-4 mr-1" /> {t.addBooking}
              </button>
            </div>
          </div>
          {bookingLoadError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs">
              {bookingLoadError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-stone-50 text-stone-600 font-bold border-b">
                <tr>
                  <th className="p-3">Ref ID</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Service</th>
                  <th className="p-3">Therapist</th>
                  <th className="p-3">Time</th>
                  <th className="p-3">Google Sheet</th>
                  <th className="p-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {bookings.map(b => (
                  <tr key={b.id} className="hover:bg-stone-50 transition">
                    <td className="p-3 font-mono font-bold text-stone-900">{b.id}</td>
                    <td className="p-3">
                      <div className="font-bold text-stone-800">{b.customerName}</div>
                      <div className="text-stone-400 text-[11px]">{b.phone}</div>
                    </td>
                    <td className="p-3 font-medium text-stone-700">{b.serviceName}</td>
                    <td className="p-3 text-stone-600">{b.therapistName}</td>
                    <td className="p-3 font-semibold text-stone-800">{b.time}</td>
                    <td className="p-3">
                      {b.syncedToSheets ? (
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-1 rounded-md text-[10px] inline-flex items-center">
                          <Check className="w-3 h-3 mr-1" /> Synced
                        </span>
                      ) : (
                        <span className="bg-stone-100 text-stone-600 font-bold px-2 py-1 rounded-md text-[10px]">
                          Local Only
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold text-stone-900">${b.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-stone-900">Live Google Calendar</h2>
              <p className="text-xs text-stone-500">Google Calendar view and live appointment list.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="text-xs font-semibold text-stone-600">
                Date
                <input type="date" value={calendarDate} onChange={(event) => setCalendarDate(event.target.value)} className="block mt-1 p-2 rounded-lg border border-stone-300" />
              </label>
              <label className="text-xs font-semibold text-stone-600">
                Branch
                <select value={calendarBranch} onChange={(event) => setCalendarBranch(event.target.value)} className="block mt-1 p-2 rounded-lg border border-stone-300">
                  <option value="all">All branches</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-stone-600">
                Therapist
                <select value={calendarTherapist} onChange={(event) => setCalendarTherapist(event.target.value)} className="block mt-1 p-2 rounded-lg border border-stone-300">
                  <option value="all">All therapists</option>
                  {therapists.map((therapist) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}
                </select>
              </label>
              <button onClick={loadCalendar} disabled={isLoadingCalendar} className="h-9 px-3 bg-emerald-800 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                {isLoadingCalendar ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
          {calendarLoadError && <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs">{calendarLoadError}</div>}
          {calendarWarnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs">
              Calendar access warning: {calendarWarnings.join(' · ')}
            </div>
          )}
          {calendarUrl && (
            <a href={calendarUrl} target="_blank" rel="noreferrer" className="inline-flex text-xs font-semibold text-emerald-800 underline">
              Open the primary Google Calendar
            </a>
          )}
          <div className="rounded-xl overflow-hidden border border-stone-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3 bg-stone-50 border-b border-stone-200">
              <div>
                <p className="font-bold text-stone-900">{new Date(`${calendarDate}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                <p className="text-xs text-stone-500">MY THAI THAI · live primary calendar view</p>
              </div>
              <CalendarIcon className="w-5 h-5 text-emerald-700" />
            </div>
            <div className="max-h-[620px] overflow-y-auto">
              {Array.from({ length: 12 }, (_, index) => index + 8).map((hour) => {
                const hourLabel = new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: 'numeric' });
                const hourEvents = calendarEvents.filter((event) => Number(event.localTime?.split(':')[0]) === hour);
                return (
                  <div key={hour} className="grid grid-cols-[72px_1fr] min-h-[58px] border-b border-stone-100">
                    <div className="p-2 text-[11px] text-stone-400 text-right border-r border-stone-100">{hourLabel}</div>
                    <div className="p-1.5 space-y-1">
                      {hourEvents.map((event) => (
                        <button key={event.id} type="button" onClick={() => { setSelectedCalendarEvent(event); setIssuedReceipt(null); setReceiptError(''); setReceiptNotice(''); }} className={`block w-full rounded-lg border-l-4 px-3 py-2 text-left text-xs transition hover:brightness-95 ${getTherapistCalendarColor(event.therapistName, therapists).event}`}>
                          <div className={`font-bold ${getTherapistCalendarColor(event.therapistName, therapists).text}`}>{event.summary}</div>
                          <div className={getTherapistCalendarColor(event.therapistName, therapists).text}>{event.localTime} · {event.therapistName || event.calendarName.replace(' - MY THAI THAI', '')}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-stone-500">
            This live visual uses the same Google Calendar events and the same date, branch, and therapist filters as the appointment list below.
          </p>
          <div className="flex flex-wrap gap-3 items-center rounded-xl bg-stone-50 border border-stone-200 px-3 py-2">
            <span className="text-xs font-bold text-stone-700">Therapists:</span>
            {(calendarTherapist === 'all' ? therapists : therapists.filter((therapist) => String(therapist.id) === calendarTherapist)).map((therapist) => {
              const color = getTherapistCalendarColor(therapist.name, therapists);
              return (
                <span key={therapist.id} className="inline-flex items-center gap-1.5 text-xs text-stone-700">
                  <span className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
                  {therapist.name}
                </span>
              );
            })}
            {calendarTherapist === 'all' && (
              <span className="inline-flex items-center gap-1.5 text-xs text-stone-500">
                <span className="w-2.5 h-2.5 rounded-full bg-stone-400" />
                Any Available
              </span>
            )}
          </div>
          {calendarEvents.length === 0 && !isLoadingCalendar ? (
            <p className="py-8 text-center text-sm text-stone-500">No appointments found for this date and branch.</p>
          ) : (
            <div className="space-y-3">
              {calendarEvents.map((event) => (
                <div key={event.id} className={`p-4 rounded-xl border border-stone-200 ${getTherapistCalendarColor(event.therapistName, therapists).event}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button type="button" onClick={() => { setSelectedCalendarEvent(event); setIssuedReceipt(null); setReceiptError(''); setReceiptNotice(''); }} className="min-w-0 text-left">
                      <span className="font-bold text-stone-900">{event.summary}</span>
                      <span className="mt-1 block text-xs text-stone-500">{event.therapistName || event.calendarName} · {event.location}</span>
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-sm font-semibold text-emerald-800">{event.localTime}</span>
                      <button type="button" onClick={() => { setSelectedCalendarEvent(event); setIssuedReceipt(null); setReceiptError(''); setReceiptNotice(''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-emerald-900 transition hover:bg-emerald-50"><ReceiptText className="h-3.5 w-3.5" />Open appointment</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: SERVICES CATALOGUE MANAGER */}
      {activeTab === 'services' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{t.services}</h2>
              <p className="text-xs text-stone-500">Add, edit, deactivate, or remove services. Changes appear on the booking portal immediately after saving.</p>
            </div>
            <button
              onClick={addServiceRow}
              className="px-4 py-2 bg-amber-700 text-white rounded-xl text-xs font-bold hover:bg-amber-800 transition flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" /> {t.addService}
            </button>
          </div>

          {servicesError && (
            <p role="alert" className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{servicesError}</p>
          )}
          {serviceSaveError && (
            <p role="alert" className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{serviceSaveError}</p>
          )}
          {serviceSaveMessage && (
            <p role="status" className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{serviceSaveMessage}</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-stone-50 text-stone-600 font-bold border-b">
                <tr>
                  <th className="p-2">{t.name}</th>
                  <th className="p-2">{t.category}</th>
                  <th className="p-2">{t.duration}</th>
                  <th className="p-2">{t.price}</th>
                  <th className="p-2">{t.deposit}</th>
                  <th className="p-2">Tax rate</th>
                  <th className="p-2">{t.isRmt}</th>
                  <th className="p-2">Active</th>
                  <th className="p-2">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {serviceForm.map((s) => (
                  <tr key={s.id} className="hover:bg-stone-50 transition align-top">
                    <td className="p-2 w-56">
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => updateServiceField(s.id, 'name', e.target.value)}
                        className="w-full p-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none font-bold"
                      />
                      <input
                        type="text"
                        placeholder="Description"
                        value={s.description}
                        onChange={(e) => updateServiceField(s.id, 'description', e.target.value)}
                        className="mt-1 w-full p-1.5 text-[11px] rounded-lg border border-stone-200 focus:ring-2 focus:ring-emerald-600 focus:outline-none text-stone-500"
                      />
                    </td>
                    <td className="p-2 w-36">
                      <select
                        value={s.category}
                        onChange={(e) => updateServiceField(s.id, 'category', e.target.value)}
                        className="w-full p-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                      >
                        {['Thai Traditional', 'Thai Combo Swedish', 'Hot Stone Combo', 'Add-On & Packages', 'RMT Healthcare'].map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 w-20">
                      <input
                        type="number"
                        min="1"
                        value={s.duration}
                        onChange={(e) => updateServiceField(s.id, 'duration', e.target.value)}
                        className="w-full p-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                      />
                    </td>
                    <td className="p-2 w-24">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={s.price}
                        onChange={(e) => updateServiceField(s.id, 'price', e.target.value)}
                        className="w-full p-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none font-bold text-emerald-800"
                      />
                    </td>
                    <td className="p-2 w-24">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={s.deposit}
                        onChange={(e) => updateServiceField(s.id, 'deposit', e.target.value)}
                        className="w-full p-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                      />
                    </td>
                    <td className="p-2 w-20">
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={s.taxRate}
                        onChange={(e) => updateServiceField(s.id, 'taxRate', e.target.value)}
                        className="w-full p-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                      />
                    </td>
                    <td className="p-2 w-16 text-center">
                      <input
                        type="checkbox"
                        checked={s.isRmt}
                        onChange={(e) => updateServiceField(s.id, 'isRmt', e.target.checked)}
                      />
                    </td>
                    <td className="p-2 w-16 text-center">
                      <input
                        type="checkbox"
                        checked={s.active !== false}
                        onChange={(e) => updateServiceField(s.id, 'active', e.target.checked)}
                      />
                    </td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => removeServiceRow(s.id)}
                        className="inline-flex items-center justify-center text-red-600 hover:text-red-800"
                        aria-label={`Remove ${s.name || 'service'}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={saveServiceForm}
              disabled={isSavingServices}
              className="px-5 py-2.5 bg-emerald-800 text-white font-semibold rounded-xl hover:bg-emerald-900 disabled:opacity-50 transition text-sm"
            >
              {isSavingServices ? 'Saving…' : 'Save services'}
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: BRANCHES MANAGER */}
      {activeTab === 'branches' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-stone-900">Branches</h2>
              <p className="text-xs text-stone-500">Add, edit, or deactivate locations. Changes appear on the booking portal immediately after saving.</p>
            </div>
            <button
              onClick={addBranchRow}
              className="px-4 py-2 bg-amber-700 text-white rounded-xl text-xs font-bold hover:bg-amber-800 transition flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" /> Add branch
            </button>
          </div>

          {branchesError && (
            <p role="alert" className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{branchesError}</p>
          )}
          {branchSaveError && (
            <p role="alert" className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{branchSaveError}</p>
          )}
          {branchSaveMessage && (
            <p role="status" className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{branchSaveMessage}</p>
          )}

          <div className="space-y-3">
            {branchForm.map((branch) => (
              <div key={branch.id} className="grid gap-2.5 sm:grid-cols-12 items-center border border-stone-200 rounded-xl p-3">
                <input
                  type="text"
                  placeholder="Branch name"
                  value={branch.name}
                  onChange={(e) => updateBranchField(branch.id, 'name', e.target.value)}
                  className="sm:col-span-3 p-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Street address"
                  value={branch.address}
                  onChange={(e) => updateBranchField(branch.id, 'address', e.target.value)}
                  className="sm:col-span-3 p-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="City, Province"
                  value={branch.city}
                  onChange={(e) => updateBranchField(branch.id, 'city', e.target.value)}
                  className="sm:col-span-2 p-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Phone"
                  value={branch.phone}
                  onChange={(e) => updateBranchField(branch.id, 'phone', e.target.value)}
                  className="sm:col-span-2 p-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <label className="sm:col-span-1 flex items-center gap-1.5 text-[11px] font-semibold text-stone-600">
                  <input
                    type="checkbox"
                    checked={branch.active !== false}
                    onChange={(e) => updateBranchField(branch.id, 'active', e.target.checked)}
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={() => removeBranchRow(branch.id)}
                  className="sm:col-span-1 inline-flex items-center justify-center text-red-600 hover:text-red-800"
                  aria-label={`Remove ${branch.name || 'branch'}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={saveBranchForm}
              disabled={isSavingBranches}
              className="px-5 py-2.5 bg-emerald-800 text-white font-semibold rounded-xl hover:bg-emerald-900 disabled:opacity-50 transition text-sm"
            >
              {isSavingBranches ? 'Saving…' : 'Save branches'}
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: STAFF & THERAPISTS */}
      {activeTab === 'staff' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{t.staff}</h2>
              <p className="text-xs text-stone-500">Manage registered therapists, credentials, and which branch each therapist works at on each day of the week — supports rotation between branches. Changes sync to the booking portal and the therapist portal.</p>
            </div>
            <button
              onClick={addTherapistRow}
              className="px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold hover:bg-emerald-900 transition flex items-center shadow-sm"
            >
              <Plus className="w-4 h-4 mr-1.5" /> {t.addTherapist}
            </button>
          </div>

          {therapistsError && (
            <p role="alert" className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{therapistsError}</p>
          )}
          {therapistSaveError && (
            <p role="alert" className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{therapistSaveError}</p>
          )}
          {therapistSaveMessage && (
            <p role="status" className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{therapistSaveMessage}</p>
          )}

          <div className="space-y-4">
            {therapistForm.map((th) => (
              <div key={th.id} className="p-4 rounded-xl border border-stone-200 bg-stone-50/50 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Somsak P., RMT"
                      value={th.name}
                      onChange={(e) => updateTherapistField(th.id, 'name', e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Rating (1.0 - 5.0)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="1.0"
                      max="5.0"
                      value={th.rating}
                      onChange={(e) => updateTherapistField(th.id, 'rating', e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Professional Bio / Specialty</label>
                  <input
                    type="text"
                    placeholder="e.g. 8+ years deep tissue and Wat Pho traditional practitioner"
                    value={th.bio}
                    onChange={(e) => updateTherapistField(th.id, 'bio', e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer font-medium text-stone-800">
                    <input
                      type="checkbox"
                      checked={th.thaiCertified}
                      onChange={(e) => updateTherapistField(th.id, 'thaiCertified', e.target.checked)}
                      className="rounded text-emerald-700 focus:ring-emerald-600 w-4 h-4"
                    />
                    <span>Traditional Thai Certified</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer font-medium text-stone-800">
                    <input
                      type="checkbox"
                      checked={th.rmtCertified}
                      onChange={(e) => updateTherapistField(th.id, 'rmtCertified', e.target.checked)}
                      className="rounded text-blue-700 focus:ring-blue-600 w-4 h-4"
                    />
                    <span>RMT Healthcare Certified (Ontario CMTO)</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer font-medium text-stone-800">
                    <input
                      type="checkbox"
                      checked={th.active !== false}
                      onChange={(e) => updateTherapistField(th.id, 'active', e.target.checked)}
                      className="rounded text-emerald-700 focus:ring-emerald-600 w-4 h-4"
                    />
                    <span>Active</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">Branch rotation — pick which branch this therapist works at on each day (leave "Off" if they don't work that day)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                    {WEEKDAYS.map((day) => (
                      <div key={day.key}>
                        <label className="block text-[10px] font-bold text-stone-500 mb-0.5 uppercase">{day.label}</label>
                        <select
                          value={th.schedule?.[day.key] ?? ''}
                          onChange={(e) => updateTherapistScheduleDay(th.id, day.key, e.target.value)}
                          className="w-full p-1.5 text-[11px] rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                        >
                          <option value="">Off</option>
                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>{branch.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-1 border-t border-stone-200">
                  <button
                    type="button"
                    onClick={() => removeTherapistRow(th.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition text-xs font-bold"
                  >
                    <Trash2 className="w-4 h-4" /> {t.removeTherapist}
                  </button>
                </div>
              </div>
            ))}

            {therapistForm.length === 0 && (
              <div className="col-span-full py-8 text-center text-stone-400 text-xs">
                No therapists listed. Click "{t.addTherapist}" above to register staff members.
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={saveTherapistForm}
              disabled={isSavingTherapists}
              className="px-5 py-2.5 bg-emerald-800 text-white font-semibold rounded-xl hover:bg-emerald-900 disabled:opacity-50 transition text-sm"
            >
              {isSavingTherapists ? 'Saving…' : 'Save therapists & rotation'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'loyalty' && (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-indigo-950 via-indigo-800 to-blue-700 px-5 py-6 text-white sm:px-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className="rounded-xl bg-white/10 p-3 text-indigo-100"><Award className="h-5 w-5" /></span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-200">Reward your regulars</p>
                    <h2 className="mt-1 text-xl font-bold">MY THAI THAI Rewards</h2>
                    <p className="mt-1 max-w-2xl text-sm text-indigo-100">Manage member tiers, award points for completed visits, and record in-clinic reward redemptions.</p>
                  </div>
                </div>
                <button type="button" onClick={loadLoyaltyDashboard} disabled={isLoadingLoyalty} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLoyalty ? 'animate-spin' : ''}`} />Refresh
                </button>
              </div>
            </div>
          </section>

          {loyaltyError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{loyaltyError}</div>}
          {loyaltyNotice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{loyaltyNotice}</div>}
          {isLoadingLoyalty && !loyaltyDashboard && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading loyalty members and rewards…</div>}

          {loyaltyDashboard && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ['Members', loyaltyDashboard.summary.members.toLocaleString(), Users, 'bg-blue-50 text-blue-700'],
                  ['Points outstanding', loyaltyDashboard.summary.availablePoints.toLocaleString(), Sparkles, 'bg-indigo-50 text-indigo-700'],
                  ['Visits ready to award', loyaltyDashboard.summary.pendingVisits.toLocaleString(), CheckCircle2, 'bg-emerald-50 text-emerald-700'],
                ].map(([label, value, Icon, style]) => (
                  <section key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{label}</span><span className={`rounded-lg p-2 ${style}`}><Icon className="h-4 w-4" /></span></div>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
                  </section>
                ))}
              </div>

              <form onSubmit={saveLoyaltySettings} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Program settings</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Configure Standard, Gold and Platinum benefits. Point awards use service amounts actually paid, and existing ledger entries are unchanged.</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                    <input type="checkbox" checked={loyaltySettings.enabled} onChange={(event) => setLoyaltySettings((current) => ({ ...current, enabled: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-600" />
                    Program accepting members
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs font-semibold text-slate-600">Standard points per $1 paid
                    <input type="number" min="0.01" max="100" step="0.01" required value={loyaltySettings.pointsPerDollar} onChange={(event) => setLoyaltySettings((current) => ({ ...current, pointsPerDollar: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">First single-session multiplier
                    <input type="number" min="1" max="100" step="0.1" required value={loyaltySettings.firstSessionMultiplier} onChange={(event) => setLoyaltySettings((current) => ({ ...current, firstSessionMultiplier: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Points per reward
                    <input type="number" min="1" max="1000000" step="1" required value={loyaltySettings.redemptionPoints} onChange={(event) => setLoyaltySettings((current) => ({ ...current, redemptionPoints: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Reward value ($)
                    <input type="number" min="0.01" max="10000" step="0.01" required value={loyaltySettings.redemptionValue} onChange={(event) => setLoyaltySettings((current) => ({ ...current, redemptionValue: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                  </label>
                </div>
                <section className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                  <h4 className="text-sm font-semibold text-indigo-950">Gold monthly</h4>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-xs font-semibold text-slate-700">Monthly fee ($)
                    <input type="number" min="0" max="100000" step="0.01" required value={loyaltySettings.membershipPlans.gold.monthlyFee} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, gold: { ...current.membershipPlans.gold, monthlyFee: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">Service discount (%)
                    <input type="number" min="0" max="100" step="0.1" required value={loyaltySettings.membershipPlans.gold.discountPercent} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, gold: { ...current.membershipPlans.gold, discountPercent: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">Points multiplier
                    <input type="number" min="0" max="100" step="0.1" required value={loyaltySettings.membershipPlans.gold.pointsMultiplier} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, gold: { ...current.membershipPlans.gold, pointsMultiplier: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">Free Hot Stone add-ons / month
                    <input type="number" min="0" max="100" step="1" required value={loyaltySettings.membershipPlans.gold.freeHotStonePerMonth} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, gold: { ...current.membershipPlans.gold, freeHotStonePerMonth: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                  </div>
                </section>
                <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <h4 className="text-sm font-semibold text-amber-950">Platinum company top-up</h4>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-xs font-semibold text-slate-700">Top-up price ($)
                      <input type="number" min="0" max="100000" step="0.01" required value={loyaltySettings.membershipPlans.platinum.topUpPrice} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, platinum: { ...current.membershipPlans.platinum, topUpPrice: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">Prepaid hours
                      <input type="number" min="0.01" max="10000" step="0.25" required value={loyaltySettings.membershipPlans.platinum.includedHours} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, platinum: { ...current.membershipPlans.platinum, includedHours: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">Service discount (%)
                      <input type="number" min="0" max="100" step="0.1" required value={loyaltySettings.membershipPlans.platinum.discountPercent} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, platinum: { ...current.membershipPlans.platinum, discountPercent: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">Hot Stone add-on discount ($)
                      <input type="number" min="0" max="10000" step="0.01" required value={loyaltySettings.membershipPlans.platinum.hotStoneDiscount} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, platinum: { ...current.membershipPlans.platinum, hotStoneDiscount: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                  </div>
                  <p className="text-[11px] leading-5 text-slate-600">Company employees are matched by their enrolled email and optional company ID. Record a confirmed top-up from the member row; completed visits consume their service duration from the hours balance.</p>
                </section>
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div><h4 className="text-sm font-semibold text-slate-900">Member tiers</h4><p className="mt-0.5 text-[11px] text-slate-500">Tier level is based on lifetime points earned. The first tier must begin at 0 points.</p></div>
                    <button type="button" disabled={loyaltySettings.tiers.length >= 6} onClick={() => setLoyaltySettings((current) => ({ ...current, tiers: [...current.tiers, { name: `Tier ${current.tiers.length + 1}`, threshold: Number(current.tiers[current.tiers.length - 1]?.threshold || 0) + 500 }] }))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Add tier</button>
                  </div>
                  <div className="space-y-2">
                    {loyaltySettings.tiers.map((tier, index) => (
                      <div key={`tier-${index}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                        <label className="sr-only" htmlFor={`loyalty-tier-name-${index}`}>Tier {index + 1} name</label>
                        <input id={`loyalty-tier-name-${index}`} required maxLength={40} value={tier.name} onChange={(event) => setLoyaltySettings((current) => ({ ...current, tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-xs" placeholder="Tier name" />
                        <label className="sr-only" htmlFor={`loyalty-tier-points-${index}`}>Tier {index + 1} points threshold</label>
                        <input id={`loyalty-tier-points-${index}`} type="number" min={index === 0 ? 0 : 1} step="1" required value={tier.threshold} disabled={index === 0} onChange={(event) => setLoyaltySettings((current) => ({ ...current, tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, threshold: event.target.value } : item) }))} className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:bg-slate-50" placeholder="Points threshold" />
                        <button type="button" aria-label={`Remove tier ${tier.name || index + 1}`} disabled={index === 0} onClick={() => setLoyaltySettings((current) => ({ ...current, tiers: current.tiers.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-lg border border-slate-200 px-3 text-slate-500 hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30"><X className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-[11px] leading-5 text-slate-500">Example reward: {loyaltySettings.redemptionPoints || 0} points = ${Number(loyaltySettings.redemptionValue || 0).toFixed(2)} off in clinic.</p>
                  <button type="submit" disabled={isSavingLoyalty || isLoadingLoyalty} className="inline-flex items-center gap-2 rounded-lg bg-indigo-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">{isSavingLoyalty ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Save program settings</button>
                </div>
              </form>

              <form onSubmit={onboardLoyaltyMember} className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm sm:p-6">
                <div><h3 className="text-base font-semibold text-slate-900">Onboard a member</h3><p className="mt-1 text-xs leading-5 text-slate-500">Find a recent customer by name, email or phone. For Platinum, use the employee's work email, add the company and ID, then optionally confirm the initial payment and add the configured hours in this same step.</p></div>
                <div className="relative max-w-xl">
                  <label className="relative block">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input type="search" value={loyaltyOnboardingSearch} onChange={(event) => setLoyaltyOnboardingSearch(event.target.value)} placeholder="Find a booking customer by name, email or phone" aria-label="Find a customer to enroll" className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                  {!!loyaltyOnboardingSearch.trim() && (() => {
                    const query = loyaltyOnboardingSearch.trim().toLowerCase();
                    const matches = (loyaltyDashboard.customerDirectory || [])
                      .filter((customer) => [customer.name, customer.email, customer.phone].some((value) => (value || '').toLowerCase().includes(query)))
                      .slice(0, 6);
                    return matches.length ? (
                      <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                        {matches.map((customer) => (
                          <button key={customer.email} type="button" onClick={() => {
                            setNewLoyaltyMember((current) => ({
                              ...current,
                              name: customer.name || current.name,
                              email: customer.email,
                              phone: customer.phone || current.phone,
                            }));
                            setLoyaltyOnboardingSearch('');
                          }} className="block w-full rounded-md px-3 py-2 text-left hover:bg-indigo-50">
                            <span className="block text-xs font-semibold text-slate-800">{customer.name || customer.email}</span>
                            <span className="block text-[11px] text-slate-500">{customer.email}{customer.phone ? ` · ${customer.phone}` : ''}</span>
                          </button>
                        ))}
                      </div>
                    ) : <p className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 shadow-lg">No booking customer matches that search.</p>;
                  })()}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-xs font-semibold text-slate-600">Member name<input required maxLength={120} value={newLoyaltyMember.name} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, name: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-600">Email<input required type="email" maxLength={254} value={newLoyaltyMember.email} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, email: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-600">Phone (optional)<input type="tel" maxLength={50} value={newLoyaltyMember.phone} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, phone: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-600">Membership type<select value={newLoyaltyMember.membershipType} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, membershipType: event.target.value, organization: event.target.value === 'platinum' ? current.organization : '', companyId: event.target.value === 'platinum' ? current.companyId : '', paidThrough: event.target.value === 'gold' ? current.paidThrough : '', initialTopUpPaid: event.target.value === 'platinum' ? current.initialTopUpPaid : false }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option value="regular">Standard · Free points</option><option value="gold">Gold · Monthly</option><option value="platinum">Platinum · Company top-up</option></select></label>
                  {newLoyaltyMember.membershipType === 'platinum' && <>
                    <label className="text-xs font-semibold text-slate-600">Company name<input required maxLength={120} value={newLoyaltyMember.organization} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, organization: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                    <label className="text-xs font-semibold text-slate-600">Company ID (optional if using work email)<input maxLength={120} value={newLoyaltyMember.companyId} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, companyId: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                    <label className="text-xs font-semibold text-slate-600">Company registration/contact email<input type="email" maxLength={254} value={newLoyaltyMember.companyContactEmail} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, companyContactEmail: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Company contact email" /></label>
                    <label className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs leading-5 text-indigo-950">
                      <input type="checkbox" checked={newLoyaltyMember.isPrimaryOwner} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, isPrimaryOwner: event.target.checked, initialTopUpPaid: event.target.checked ? current.initialTopUpPaid : false }))} className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-700" />
                      <span><strong>Primary owner/contact:</strong> this person's own top-ups fund the one shared prepaid-hour balance for {newLoyaltyMember.organization || 'this company'}. Every employee draws from that same pool — leave unchecked for a regular employee (they cannot be topped up directly).</span>
                    </label>
                    <label className={`sm:col-span-2 flex items-start gap-2 rounded-lg border p-3 text-xs leading-5 ${newLoyaltyMember.isPrimaryOwner ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                      <input type="checkbox" disabled={!newLoyaltyMember.isPrimaryOwner} checked={newLoyaltyMember.initialTopUpPaid} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, initialTopUpPaid: event.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-700" />
                      <span><strong>Payment confirmed:</strong> record the configured ${Number(loyaltySettings.membershipPlans.platinum.topUpPrice).toFixed(2)} top-up and add {loyaltySettings.membershipPlans.platinum.includedHours} hours now.{!newLoyaltyMember.isPrimaryOwner ? ' Only the primary owner/contact can be topped up.' : ' Leave unchecked for a pending company claim.'}</span>
                    </label>
                  </>}
                  {newLoyaltyMember.membershipType === 'gold' && <label className="text-xs font-semibold text-slate-600">Paid through<input type="date" value={newLoyaltyMember.paidThrough} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, paidThrough: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>}
                </div>
                <button type="submit" disabled={isOnboardingLoyaltyMember || !loyaltySettings.enabled} className="inline-flex items-center gap-2 rounded-lg bg-indigo-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">{isOnboardingLoyaltyMember ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}{isOnboardingLoyaltyMember ? 'Saving membership…' : newLoyaltyMember.membershipType === 'platinum' && newLoyaltyMember.initialTopUpPaid ? 'Enroll & record paid top-up' : 'Save member & email details'}</button>
              </form>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-900">Confirm completed visits</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Confirm completed, paid member visits, redeem a Gold monthly Hot Stone add-on, or consume Platinum prepaid hours. Each visit can only be recorded once.</p>
                </div>
                {loyaltyDashboard.eligibleBookings.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-5 py-3">Member</th><th className="px-4 py-3">Visit</th><th className="px-4 py-3 text-right">Paid</th><th className="px-5 py-3 text-right">Points</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {loyaltyDashboard.eligibleBookings.map((booking) => (
                          <tr key={booking.id}>
                            <td className="px-5 py-3 font-medium text-slate-900">{booking.customerName}<span className="mt-0.5 block text-[10px] font-normal text-slate-500">{booking.email}</span></td>
                            <td className="px-4 py-3 text-slate-700">{booking.date}<span className="mt-0.5 block text-[10px] text-slate-500">{booking.serviceName} · {booking.id}</span></td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-700">${booking.paidAmount.toFixed(2)}</td>
                            <td className="px-5 py-3 text-right font-semibold text-indigo-800">{booking.points ? `+${booking.points} pts` : booking.hoursToUse ? `${booking.hoursToUse.toFixed(2)} hrs` : booking.freeHotStone ? 'Free add-on' : '—'}{booking.firstSession && <span className="mt-0.5 block text-[10px] font-normal">First session · {booking.pointsMultiplier}x</span>}</td>
                            <td className="px-5 py-3 text-right"><button type="button" disabled={loyaltyActionId === booking.id || !loyaltySettings.enabled} onClick={() => awardLoyaltyPoints(booking)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-950 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />{loyaltyActionId === booking.id ? 'Awarding…' : 'Confirm & award'}</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="p-6 text-center text-sm text-slate-500">No completed member visits or benefits are waiting to be recorded.</p>}
              </section>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div><h3 className="text-base font-semibold text-slate-900">Members & balances</h3><p className="mt-1 text-xs text-slate-500">Search by member, email, phone, company or company ID; check eligibility, record top-ups and redeem points.</p></div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <label className="sr-only" htmlFor="loyalty-member-type-filter">Filter members by membership type</label>
                    <select id="loyalty-member-type-filter" value={loyaltyMemberTypeFilter} onChange={(event) => setLoyaltyMemberTypeFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <option value="all">All memberships</option><option value="gold">Gold</option><option value="platinum">Platinum company</option><option value="silver">Legacy Silver</option><option value="regular">Standard points</option>
                    </select>
                    <label className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input type="search" value={loyaltyMemberSearch} onChange={(event) => setLoyaltyMemberSearch(event.target.value)} placeholder="Search member or company" aria-label="Search loyalty members" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
                  </div>
                </div>
                {(() => {
                  const filteredMembers = loyaltyDashboard.members
                    .filter((member) => loyaltyMemberTypeFilter === 'all' || member.membershipType === loyaltyMemberTypeFilter)
                    .filter((member) => [member.name, member.email, member.phone, member.organization, member.companyId, member.companyContactEmail].some((value) => (value || '').toLowerCase().includes(loyaltyMemberSearch.trim().toLowerCase())));
                  return filteredMembers.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[920px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-5 py-3">Member</th><th className="px-4 py-3">Membership</th><th className="px-4 py-3">Eligibility</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3 text-right">Lifetime earned</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredMembers.map((member) => (
                            <tr key={member.email} className="hover:bg-slate-50">
                              <td className="px-5 py-3 font-medium text-slate-900">{member.name || 'Member'}<span className="mt-0.5 block text-[10px] font-normal text-slate-500">{member.email}{member.phone ? ` · ${member.phone}` : ''}</span></td>
                              <td className="px-4 py-3"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-800">{member.membershipType === 'gold' ? 'Gold' : member.membershipType === 'platinum' ? 'Platinum · Company' : member.membershipType === 'silver' ? 'Legacy Silver · Corporate' : `Standard · ${member.tier}`}</span>{member.membershipType === 'platinum' && member.isPrimaryContact && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Primary contact</span>}{member.organization && <span className="mt-1 block text-[10px] text-slate-500">{member.organization}{member.companyId ? ` · ID ${member.companyId}` : ''}{member.companyContactEmail ? ` · Contact: ${member.companyContactEmail}` : ''}</span>}</td>
                              <td className="px-4 py-3 text-xs">{member.membershipType === 'regular' ? <span className="text-slate-500">Points program</span> : member.membershipType === 'platinum' ? <><span className={member.membershipActive ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{member.membershipActive ? `${member.membershipDiscountPercent}% off active` : 'Top-up required'}</span><span className="mt-1 block text-[10px] text-slate-500">{member.prepaidHoursBalance.toFixed(2)} shared prepaid hours remain · ${loyaltySettings.membershipPlans.platinum.hotStoneDiscount} off Hot Stone add-on</span></> : <><span className={member.membershipActive ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{member.membershipActive ? `${member.membershipDiscountPercent}% off active` : 'Payment required'}</span><span className="mt-1 block text-[10px] text-slate-500">Paid through: {member.paidThrough || 'not recorded'}{member.membershipType === 'gold' ? ` · Hot Stone add-on ${member.freeHotStoneAvailable ? 'available' : 'used'} this month` : ''}</span></>}</td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{member.pointsBalance.toLocaleString()} pts{member.membershipType === 'platinum' && <span className="mt-1 block text-[10px] font-normal text-slate-500">{member.prepaidHoursBalance.toFixed(2)} hrs shared</span>}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-600">{member.lifetimePoints.toLocaleString()} pts</td>
                              <td className="space-y-1 px-5 py-3 text-right">
                                <button type="button" disabled={!loyaltySettings.enabled || member.pointsBalance < loyaltySettings.redemptionPoints || !member.receiptCandidates?.length} onClick={() => { setSelectedLoyaltyMember(member); setLoyaltyRedeemPoints(String(loyaltySettings.redemptionPoints)); setLoyaltyRedeemBookingId(member.receiptCandidates?.[0]?.bookingId || ''); }} className="rounded-lg border border-indigo-200 px-3 py-2 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40">Redeem points</button>
                                {member.membershipType === 'platinum' && member.isPrimaryContact && <button type="button" disabled={!loyaltySettings.enabled} onClick={() => setSelectedTopUpMember(member)} className="block ml-auto rounded-lg border border-amber-200 px-3 py-2 text-[11px] font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-40">Record top-up</button>}
                                {member.membershipType === 'platinum' && !member.isPrimaryContact && <button type="button" disabled={loyaltyActionId === member.email} onClick={() => makePrimaryContact(member)} className="block ml-auto rounded-lg border border-indigo-200 px-3 py-2 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-40">Make primary contact</button>}
                                {['gold', 'silver'].includes(member.membershipType) && <button type="button" onClick={() => { setSelectedMembershipPayment(member); setMembershipPaidThrough(member.paidThrough || ''); }} className="block ml-auto rounded-lg border border-emerald-200 px-3 py-2 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50">Record payment</button>}
                                {member.membershipType === 'platinum' && member.organization && member.companyContactEmail && <button type="button" disabled={copyingPortalFor === member.organization} onClick={() => copyCompanyPortalLink(member)} className="block ml-auto rounded-lg border border-sky-200 px-3 py-2 text-[11px] font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-40">{copyingPortalFor === member.organization ? 'Copying…' : 'Copy portal link'}</button>}
                                <button type="button" onClick={() => setMemberPendingRemoval(member)} className="block ml-auto rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50">Remove member</button>
                                {['silver', 'platinum'].includes(member.membershipType) && member.organization && <button type="button" onClick={() => setCompanyPendingRemoval(member.organization)} className="block ml-auto rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50">Remove company</button>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="p-8 text-center text-sm text-slate-500">{loyaltyDashboard.members.length ? 'No members match your search.' : 'No members yet. Customers can join Rewards during online booking.'}</p>;
                })()}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Recent rewards activity</h3>
                <div className="mt-3 divide-y divide-slate-100">
                  {recentLoyaltyTransactions.length ? (
                    recentLoyaltyTransactions.map((transaction) => (
                        <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                          <div><p className="font-semibold text-slate-800">{transaction.memberName}</p><p className="mt-0.5 text-slate-500">{transaction.description} · {transaction.createdAt ? new Date(transaction.createdAt).toLocaleDateString() : ''}{transaction.bookingId ? ` · Booking ${transaction.bookingId}` : ''}{transaction.receiptNumber ? ` · Receipt ${transaction.receiptNumber}` : ''}</p></div>
                          <span className={`font-bold tabular-nums ${transaction.points >= 0 && transaction.hours >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{transaction.hours ? `${transaction.hours > 0 ? '+' : ''}${transaction.hours.toFixed(2)} hrs` : `${transaction.points > 0 ? '+' : ''}${transaction.points} pts`}</span>
                        </div>
                      ))
                  ) : <p className="py-4 text-sm text-slate-500">No reward activity recorded yet.</p>}
                </div>
              </section>
            </>
          )}

          {selectedLoyaltyMember && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedLoyaltyMember(null); }}>
              <form onSubmit={redeemLoyaltyPoints} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="redeem-loyalty-title">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">In-clinic reward</p><h3 id="redeem-loyalty-title" className="mt-1 text-lg font-bold text-slate-900">Redeem points</h3><p className="mt-1 text-xs text-slate-500">{selectedLoyaltyMember.name} · {selectedLoyaltyMember.email}</p></div>
                  <button type="button" onClick={() => setSelectedLoyaltyMember(null)} aria-label="Close redemption dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                </div>
                <p className="rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">Available: <strong>{selectedLoyaltyMember.pointsBalance.toLocaleString()} points</strong>. Every {loyaltySettings.redemptionPoints.toLocaleString()} points gives ${Number(loyaltySettings.redemptionValue).toFixed(2)} off. Choose the paid booking below; the discount will be linked to its receipt number when staff issue the receipt.</p>
                <label className="block text-xs font-semibold text-slate-600">Points to redeem
                  <input type="number" min={loyaltySettings.redemptionPoints} max={selectedLoyaltyMember.pointsBalance} step={loyaltySettings.redemptionPoints} required value={loyaltyRedeemPoints} onChange={(event) => setLoyaltyRedeemPoints(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                </label>
                <label className="block text-xs font-semibold text-slate-600">Paid booking / receipt to apply the discount to
                  <select required value={loyaltyRedeemBookingId} onChange={(event) => setLoyaltyRedeemBookingId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900">
                    {(selectedLoyaltyMember.receiptCandidates || []).map((candidate) => (
                      <option key={candidate.bookingId} value={candidate.bookingId}>{candidate.date} · {candidate.serviceName} · ${candidate.total.toFixed(2)} · {candidate.bookingId}</option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-600">Discount to apply</span><strong className="text-lg text-indigo-900">${((Number(loyaltyRedeemPoints) / loyaltySettings.redemptionPoints) * loyaltySettings.redemptionValue || 0).toFixed(2)}</strong></div>
                <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setSelectedLoyaltyMember(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" disabled={!!loyaltyActionId || !loyaltyRedeemBookingId || !Number.isInteger(Number(loyaltyRedeemPoints)) || Number(loyaltyRedeemPoints) < loyaltySettings.redemptionPoints || Number(loyaltyRedeemPoints) > selectedLoyaltyMember.pointsBalance || Number(loyaltyRedeemPoints) % loyaltySettings.redemptionPoints !== 0} className="rounded-lg bg-indigo-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">{loyaltyActionId ? 'Recording…' : 'Confirm redemption'}</button></div>
              </form>
            </div>
          )}
          {selectedMembershipPayment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMembershipPayment(null); }}>
              <form onSubmit={recordMembershipPayment} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="membership-payment-title">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">External payment record</p><h3 id="membership-payment-title" className="mt-1 text-lg font-bold text-slate-900">Record membership payment</h3><p className="mt-1 text-xs text-slate-500">{selectedMembershipPayment.membershipType === 'silver' ? selectedMembershipPayment.organization : selectedMembershipPayment.email}</p></div>
                  <button type="button" onClick={() => setSelectedMembershipPayment(null)} aria-label="Close payment dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                </div>
                <p className="rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">Record the date through which the payment was received. {selectedMembershipPayment.membershipType === 'silver' ? 'This updates all employees onboarded under this corporate account and emails each one.' : 'This activates the member discount and emails a payment confirmation.'}</p>
                <label className="block text-xs font-semibold text-slate-600">Paid through
                  <input type="date" required value={membershipPaidThrough} onChange={(event) => setMembershipPaidThrough(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                </label>
                <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setSelectedMembershipPayment(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" disabled={!!loyaltyActionId || !membershipPaidThrough} className="rounded-lg bg-emerald-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{loyaltyActionId ? 'Recording…' : 'Record payment & notify'}</button></div>
              </form>
            </div>
          )}
          {selectedTopUpMember && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTopUpMember(null); }}>
              <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="platinum-topup-title">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Confirm external payment</p><h3 id="platinum-topup-title" className="mt-1 text-lg font-bold text-slate-900">Record Platinum top-up</h3><p className="mt-1 text-xs text-slate-500">{selectedTopUpMember.name} · {selectedTopUpMember.email}</p></div>
                  <button type="button" onClick={() => setSelectedTopUpMember(null)} aria-label="Close Platinum top-up dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                </div>
                <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-950">Only continue after confirming receipt of <strong>${Number(loyaltySettings.membershipPlans.platinum.topUpPrice).toFixed(2)}</strong>. This adds <strong>{loyaltySettings.membershipPlans.platinum.includedHours} prepaid hours</strong> to {selectedTopUpMember.organization || 'the employee account'}; completed sessions deduct their duration.</p>
                <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setSelectedTopUpMember(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="button" onClick={recordPlatinumTopUp} disabled={!!loyaltyActionId} className="rounded-lg bg-amber-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{loyaltyActionId ? 'Recording…' : 'Payment received · add hours'}</button></div>
              </div>
            </div>
          )}
          {memberPendingRemoval && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMemberPendingRemoval(null); }}>
              <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="remove-member-title">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Remove from loyalty program</p><h3 id="remove-member-title" className="mt-1 text-lg font-bold text-slate-900">Remove {memberPendingRemoval.name || memberPendingRemoval.email}?</h3><p className="mt-1 text-xs text-slate-500">{memberPendingRemoval.email} · {memberPendingRemoval.membershipType}</p></div>
                  <button type="button" onClick={() => setMemberPendingRemoval(null)} aria-label="Close remove member dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                </div>
                <p className="rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-950">This immediately removes the member from the loyalty program. Their points/hours balance and membership benefits will no longer apply. This does not affect past receipts. They will be emailed a notice.</p>
                <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setMemberPendingRemoval(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="button" onClick={removeLoyaltyMember} disabled={isRemovingLoyaltyEntry} className="rounded-lg bg-rose-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{isRemovingLoyaltyEntry ? 'Removing…' : 'Remove member'}</button></div>
              </div>
            </div>
          )}
          {companyPendingRemoval && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCompanyPendingRemoval(''); }}>
              <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="remove-company-title">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Remove corporate account</p><h3 id="remove-company-title" className="mt-1 text-lg font-bold text-slate-900">Remove all members from {companyPendingRemoval}?</h3></div>
                  <button type="button" onClick={() => setCompanyPendingRemoval('')} aria-label="Close remove company dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                </div>
                <p className="rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-950">This removes every Platinum or Legacy Silver employee enrolled under <strong>{companyPendingRemoval}</strong> from the loyalty program. Each employee will be emailed a removal notice (with the company contact copied, if one is on file). This does not affect past receipts.</p>
                <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setCompanyPendingRemoval('')} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="button" onClick={removeLoyaltyCompany} disabled={isRemovingLoyaltyEntry} className="rounded-lg bg-rose-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{isRemovingLoyaltyEntry ? 'Removing…' : 'Remove company'}</button></div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'google-ads' && (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 text-white sm:px-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className="rounded-xl bg-white/10 p-3 text-blue-200"><TrendingUp className="h-5 w-5" /></span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">Grow your practice</p>
                    <h2 className="mt-1 text-xl font-bold">Google Ads performance</h2>
                    <p className="mt-1 max-w-2xl text-sm text-slate-300">Explore campaign results over a date range you choose.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={loadGoogleAdsReport} disabled={isLoadingGoogleAds} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingGoogleAds ? 'animate-spin' : ''}`} />Refresh report
                  </button>
                  <a href="https://ads.google.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-blue-50">
                    Open Google Ads <Globe className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-[11px] font-semibold text-slate-500">From
                <input type="date" value={googleAdsStartDate} max={googleAdsEndDate} onChange={(event) => setGoogleAdsStartDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" />
              </label>
              <label className="block text-[11px] font-semibold text-slate-500">To
                <input type="date" value={googleAdsEndDate} min={googleAdsStartDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setGoogleAdsEndDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" />
              </label>
              <button type="button" onClick={() => loadGoogleAdsReport()} disabled={isLoadingGoogleAds || !googleAdsStartDate || !googleAdsEndDate || googleAdsStartDate > googleAdsEndDate} className="rounded-lg bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">Apply range</button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold text-slate-500">Quick range</span>
              {[7, 30, 90].map((days) => (
                <button key={days} type="button" onClick={() => applyGoogleAdsPreset(days)} disabled={isLoadingGoogleAds} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50">Last {days} days</button>
              ))}
            </div>
          </section>

          {googleAdsError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{googleAdsError}</div>}
          {isLoadingGoogleAds && !googleAdsReport && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Connecting securely to Google Ads…</div>}

          {googleAdsReport?.configured === false && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertCircle className="h-4 w-4 shrink-0" />Google Ads reporting is unavailable. Check the server integration settings and refresh.</div>
          )}

          {googleAdsReport?.configured && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">Account <span className="font-semibold text-slate-700">{googleAdsReport.customerId}</span> · {googleAdsReport.dateRange}</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Connected</span>
              </div>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {[
                  ['Impressions', Number(googleAdsReport.totals.impressions).toLocaleString(), Eye, 'bg-blue-50 text-blue-700'],
                  ['Clicks', Number(googleAdsReport.totals.clicks).toLocaleString(), MousePointerClick, 'bg-violet-50 text-violet-700'],
                  ['Ad spend', googleAdsReport.currencyCode ? new Intl.NumberFormat(undefined, { style: 'currency', currency: googleAdsReport.currencyCode }).format(googleAdsReport.totals.cost) : `${Number(googleAdsReport.totals.cost).toLocaleString()} (currency unavailable)`, DollarSign, 'bg-amber-50 text-amber-700'],
                  ['Conversions', Number(googleAdsReport.totals.conversions).toLocaleString(undefined, { maximumFractionDigits: 1 }), CheckCircle2, 'bg-emerald-50 text-emerald-700'],
                ].map(([label, value, Icon, iconStyle]) => (
                  <section key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-slate-500">{label}</span><span className={`rounded-lg p-2 ${iconStyle}`}><Icon className="h-4 w-4" /></span></div>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{googleAdsReport.dateRange}</p>
                  </section>
                ))}
              </div>
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div><h3 className="text-base font-semibold text-slate-900">Campaigns</h3><p className="mt-1 text-xs text-slate-500">Search, filter and sort results for the selected reporting period.</p></div>
                  <span className="text-xs text-slate-500">{visibleGoogleAdsCampaigns.length} of {googleAdsReport.campaigns.length} campaigns</span>
                </div>
                <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                  <label className="relative min-w-[190px] flex-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input type="search" value={googleAdsCampaignSearch} onChange={(event) => setGoogleAdsCampaignSearch(event.target.value)} placeholder="Search campaigns" aria-label="Search campaigns" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </label>
                  <label className="sr-only" htmlFor="google-ads-status">Campaign status</label>
                  <select id="google-ads-status" value={googleAdsCampaignStatus} onChange={(event) => setGoogleAdsCampaignStatus(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                    <option value="all">All statuses</option>
                    <option value="ENABLED">Enabled</option>
                    <option value="PAUSED">Paused</option>
                  </select>
                  <label className="sr-only" htmlFor="google-ads-sort">Sort campaigns by</label>
                  <select id="google-ads-sort" value={googleAdsCampaignSort} onChange={(event) => setGoogleAdsCampaignSort(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                    <option value="impressions">Sort: Impressions</option>
                    <option value="clicks">Sort: Clicks</option>
                    <option value="cost">Sort: Spend</option>
                    <option value="conversions">Sort: Conversions</option>
                    <option value="name">Sort: Name</option>
                  </select>
                </div>
                {visibleGoogleAdsCampaigns.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-5 py-3">Campaign</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Impressions</th><th className="px-4 py-3 text-right">Clicks</th><th className="px-4 py-3 text-right">Spend</th><th className="px-5 py-3 text-right">Conversions</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleGoogleAdsCampaigns.map((campaign) => (
                          <tr key={campaign.id} className="hover:bg-slate-50">
                            <td className="px-5 py-3 font-medium text-slate-900">{campaign.name}<span className="mt-0.5 block text-[10px] font-normal text-slate-400">ID {campaign.id}</span></td>
                            <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${campaign.status === 'ENABLED' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{campaign.status.toLowerCase().replaceAll('_', ' ')}</span></td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-700">{campaign.impressions.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-700">{campaign.clicks.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-700">{googleAdsReport.currencyCode ? new Intl.NumberFormat(undefined, { style: 'currency', currency: googleAdsReport.currencyCode }).format(campaign.cost) : campaign.cost.toLocaleString()}</td>
                            <td className="px-5 py-3 text-right tabular-nums text-slate-700">{campaign.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="p-8 text-center text-sm text-slate-500">{googleAdsReport.campaigns.length ? 'No campaigns match the current search and filters.' : 'No campaigns were returned for the selected dates.'}</p>}
              </section>
              <p className="text-xs leading-5 text-slate-500">Reporting is read-only. Create, edit, and manage budgets from Google Ads. Metrics are provided by Google Ads and may be delayed.</p>
            </>
          )}
        </div>
      )}

      {activeTab === 'marketing' && (
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-4">
              <span className="rounded-xl bg-violet-50 p-3 text-violet-800"><Megaphone className="h-5 w-5" /></span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-800">Grow your practice</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">Email marketing</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">Build an audience with chat, review your message, and send from mythaithaimassage@gmail.com.</p>
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-950">
              Campaigns go only to people who checked the optional marketing consent box when booking and remain subscribed. Each email includes an unsubscribe link. Appointment confirmations and receipts are separate.
            </div>
          </section>
          {campaignError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{campaignError}</div>}
          {campaignNotice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{campaignNotice}</div>}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-bold text-slate-900">Audience assistant</h3><p className="mt-1 text-xs leading-5 text-slate-500">Choose all subscribers or describe a segment. Branch, weekday, and recent-booking filters only include people with matching booking history. Matching runs privately; no patient data is sent to an AI service.</p></div>
              {campaignAudience && <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900">{campaignAudience.count} matched / {campaignAudience.subscriberCount} opted in</span>}
            </div>
            <div aria-live="polite" className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
              {campaignConversation.map((entry, index) => <div key={`${entry.role}-${index}`} className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs leading-5 ${entry.role === 'user' ? 'ml-auto bg-emerald-950 text-white' : 'bg-white text-slate-700 shadow-sm'}`}>{entry.text}</div>)}
              {isBuildingCampaignAudience && <p className="text-xs text-slate-500">Checking opted-in contacts and booking history…</p>}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); askCampaignAudience(); }} className="mt-3 flex gap-2">
              <input value={campaignChatInput} onChange={(event) => setCampaignChatInput(event.target.value)} maxLength={300} disabled={isSendingCampaign} placeholder="e.g. All active opted-in subscribers" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50" />
              <button type="submit" disabled={isBuildingCampaignAudience || isSendingCampaign || !campaignChatInput.trim()} className="shrink-0 rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{isBuildingCampaignAudience ? 'Thinking…' : 'Find audience'}</button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                'All active opted-in subscribers',
                'Customers who visit every Wednesday',
                `Most recent customers at ${branches[0]?.name || 'a branch'} in the last 30 days`,
                `All opted-in customers at ${branches[0]?.name || 'a branch'}`,
              ].map((example) => <button key={example} type="button" onClick={() => { setCampaignChatInput(example); askCampaignAudience(example); }} disabled={isBuildingCampaignAudience || isSendingCampaign} className="rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50">{example}</button>)}
            </div>
            {campaignAudience && <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-bold text-slate-900">{campaignAudience.description}</p>
              <p className="mt-1 text-xs text-slate-500">{campaignAudience.count ? `Examples: ${campaignAudience.sampleNames.join(', ')}` : campaignAudience.subscriberCount ? 'No opted-in subscribers match that description yet.' : 'There are no opted-in subscribers yet. New customers can choose marketing emails in the booking form.'}</p>
              {campaignAudience.count < campaignAudience.subscriberCount && campaignAudience.subscriberCount > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">This filter matches {campaignAudience.count} of {campaignAudience.subscriberCount} active opted-in subscribers. A branch, weekday, or date filter requires a matching booking in the history. Choose “All active opted-in subscribers” above to include everyone.</p>}
              {!campaignAudience.sendReady && <p className="mt-2 text-xs font-semibold text-amber-800">{campaignAudience.sendBlockReason}</p>}
              {campaignAudience.count > 50 && <p className="mt-2 text-xs font-semibold text-amber-800">Campaigns are limited to 50 recipients per send. Narrow this group before sending.</p>}
              <p className="mt-2 text-[10px] leading-4 text-slate-400">Audience matching uses historical booking dates, not verified attendance or visit frequency.</p>
            </div>}
          </section>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
            <form onSubmit={saveCampaignDraft} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div><h3 className="font-bold text-slate-900">Campaign message</h3><p className="mt-1 text-xs text-slate-500">Use the writing assistant to create an editable draft, then review, save, or send it.</p></div>
              <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">What should this campaign say?</span><textarea rows={2} maxLength={500} value={campaignGoal} onChange={(event) => setCampaignGoal(event.target.value)} disabled={isGeneratingCampaignCopy || isSendingCampaign} placeholder="e.g. Write a friendly note inviting this audience to take time for self-care. Do not include an offer." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-5 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50" /></label>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="max-w-lg text-[10px] leading-4 text-slate-500">Gemini receives only your campaign goal and the aggregate audience description—not customer names, emails, or booking rows. The generated copy is not sent until you review and confirm.</p>
                  <button type="button" onClick={generateCampaignCopy} disabled={!campaignAudience || !campaignAudience.copyAssistantReady || !campaignGoal.trim() || isGeneratingCampaignCopy || isSendingCampaign || isBuildingCampaignAudience} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-violet-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45"><Sparkles className="h-4 w-4" />{isGeneratingCampaignCopy ? 'Generating…' : 'Generate campaign'}</button>
                </div>
                {campaignAudience && !campaignAudience.copyAssistantReady && <p className="mt-2 text-xs font-semibold text-amber-800">{campaignAudience.copyAssistantBlockReason}</p>}
              </div>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Subject line</span><input maxLength={180} required value={campaignSubject} onChange={(event) => setCampaignSubject(event.target.value)} placeholder="A little time for yourself…" className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Preview text</span><input maxLength={200} value={campaignPreview} onChange={(event) => setCampaignPreview(event.target.value)} placeholder="A short summary shown in the inbox" className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Message</span><textarea required rows={8} maxLength={5000} value={campaignMessage} onChange={(event) => setCampaignMessage(event.target.value)} placeholder="Write a helpful, considerate message for your subscribers…" className="w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm leading-6 outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" /></label>
              <div className="flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-4">
                <span className="self-center text-[11px] text-slate-400">{campaignMessage.length}/5000 characters</span>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Check className="h-4 w-4" />Save draft</button>
                  <button type="button" onClick={sendCampaign} disabled={isSendingCampaign || isBuildingCampaignAudience || !campaignAudience?.sendReady || !campaignAudience?.count || campaignAudience.count > 50 || !campaignSubject.trim() || !campaignMessage.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"><Mail className="h-4 w-4" />{isSendingCampaign ? 'Sending…' : `Send to ${campaignAudience?.count || 0}`}</button>
                </div>
              </div>
            </form>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-2"><Eye className="h-4 w-4 text-slate-500" /><h3 className="font-bold text-slate-900">Email preview</h3></div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3"><p className="text-[10px] text-slate-400">MY THAI THAI · to your subscribers</p><p className="mt-1 text-xs font-bold text-slate-800">{campaignSubject || 'Your campaign subject'}</p><p className="mt-1 truncate text-[11px] text-slate-500">{campaignPreview || 'Preview text appears here'}</p></div>
                <div className="min-h-48 whitespace-pre-wrap px-5 py-5 text-sm leading-6 text-slate-700">{campaignMessage || 'Your message preview will appear here as you write.'}<div className="mt-8 border-t border-slate-100 pt-4 text-[10px] leading-5 text-slate-400">MY THAI THAI · Business mailing address from profile<br />You are receiving this because you opted in to promotional emails.<br /><span className="underline">Unsubscribe</span></div></div>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">Campaign emails include your business mailing address and an unsubscribe link. Sending requires Gmail OAuth and a mailing address in Business profile.</p>
            </section>
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Saved drafts</h3><p className="mt-1 text-xs text-slate-500">Stored only on this device</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{campaignDrafts.length}</span></div>
            {campaignDrafts.length ? <div className="space-y-2">{campaignDrafts.map((draft) => <div key={draft.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><button type="button" onClick={() => { setCampaignSubject(draft.subject); setCampaignPreview(draft.preview); setCampaignMessage(draft.message); setCampaignNotice('Draft loaded for editing.'); setCampaignError(''); }} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold text-slate-800">{draft.subject}</span><span className="text-[10px] text-slate-400">Updated {new Date(draft.updatedAt).toLocaleString()}</span></button><button type="button" onClick={() => removeCampaignDraft(draft.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-700">Delete</button></div>)}</div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No campaign drafts saved yet.</p>}
          </section>
        </div>
      )}

      {activeTab === 'business-profile' && (
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-white to-emerald-50/60 px-5 py-5 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800">
                  <Building className="h-4 w-4" /> Owner settings
                </div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Business profile</h2>
                <p className="mt-1 text-sm text-slate-500">Manage the identity and contact details associated with your practice.</p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" /> Synced across owner devices
              </span>
            </div>
          </div>

          {businessProfileError && <div role="alert" className="mx-5 mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:mx-8">{businessProfileError}</div>}
          {businessProfileMessage && <div role="status" className="mx-5 mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:mx-8">{businessProfileMessage}</div>}
          {isLoadingBusinessProfile ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading business profile…</div>
          ) : !hasLoadedBusinessProfile ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600">The saved profile could not be loaded. Retry before making changes.</p>
              <button type="button" onClick={loadBusinessProfile} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Retry loading</button>
            </div>
          ) : (
            <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
              <form onSubmit={saveBusinessProfile} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  {[
                    { key: 'businessName', label: 'Business name / display name', type: 'text', required: true, placeholder: 'MY THAI THAI' },
                    { key: 'legalName', label: 'Legal business name', type: 'text', placeholder: 'Legal name for receipts' },
                    { key: 'tagline', label: 'Short description', type: 'text', placeholder: 'Traditional Thai massage & wellness' },
                    { key: 'email', label: 'Business email', type: 'email', placeholder: 'hello@example.com' },
                    { key: 'phone', label: 'Phone number', type: 'tel', placeholder: '+1 437 898 7424' },
                    { key: 'website', label: 'Website', type: 'url', placeholder: 'https://example.com' },
                    { key: 'address', label: 'Business location', type: 'text', placeholder: 'City, Province' },
                    { key: 'taxRegistrationNumber', label: 'GST/HST registration number', type: 'text', placeholder: 'Optional — enter only your registered number' },
                    { key: 'photoUrl', label: 'Business photo URL', type: 'url', placeholder: 'https://example.com/business-photo.jpg' },
                  ].map((field) => (
                    <label key={field.key} className={`block ${field.key === 'businessName' || field.key === 'tagline' || field.key === 'photoUrl' ? 'sm:col-span-2' : ''}`}>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{field.label}{field.required && <span className="ml-1 text-rose-600">*</span>}</span>
                      <input
                        type={field.type}
                        required={field.required}
                        maxLength={field.key === 'businessName' ? 100 : field.key === 'photoUrl' ? 2048 : 250}
                        value={businessProfile[field.key] || ''}
                        onChange={(event) => {
                          setBusinessProfile((profile) => ({ ...profile, [field.key]: event.target.value }));
                          setBusinessProfileMessage('');
                        }}
                        placeholder={field.placeholder}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                      />
                      {field.key === 'photoUrl' && <span className="mt-1.5 block text-xs leading-5 text-slate-500">Paste a publicly accessible image URL. Leave blank to use the business initials.</span>}
                    </label>
                  ))}
                </div>
                <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-slate-500">Profile details are stored in your connected Google Sheet and available when you sign in on another device.</p>
                  <button type="submit" disabled={isSavingBusinessProfile || !hasLoadedBusinessProfile} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-950 px-5 py-3 text-sm font-bold text-white shadow-md shadow-emerald-950/10 transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">
                    {isSavingBusinessProfile ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {isSavingBusinessProfile ? 'Saving…' : 'Save profile'}
                  </button>
                </div>
              </form>

              <aside className="self-start rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">Profile preview</p>
                <BusinessPhoto businessName={businessProfile.businessName || 'Your business'} photoUrl={businessProfile.photoUrl} className="mt-5 h-14 w-14 rounded-2xl object-cover text-lg shadow-md" />
                <h3 className="mt-4 text-lg font-bold text-slate-900">{businessProfile.businessName || 'Your business name'}</h3>
                {businessProfile.legalName && <p className="mt-0.5 text-xs text-slate-500">{businessProfile.legalName}</p>}
                <p className="mt-1 text-sm leading-5 text-slate-500">{businessProfile.tagline || 'Add a short introduction to your practice.'}</p>
                <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-sm text-slate-600">
                  {businessProfile.email && <div className="flex items-start gap-2.5"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span className="break-all">{businessProfile.email}</span></div>}
                  {businessProfile.phone && <div className="flex items-start gap-2.5"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span>{businessProfile.phone}</span></div>}
                  {businessProfile.website && <div className="flex items-start gap-2.5"><Globe className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span className="break-all">{businessProfile.website}</span></div>}
                  {businessProfile.address && <div className="flex items-start gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span>{businessProfile.address}</span></div>}
                  {businessProfile.taxRegistrationNumber && <div className="text-xs text-slate-500">GST/HST No. {businessProfile.taxRegistrationNumber}</div>}
                </div>
              </aside>
            </div>
          )}
        </section>
      )}

      {/* TAB CONTENT: FINANCIAL REPORTS */}
      {activeTab === 'patient-history' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-stone-900">Patient History Profiles</h2>
              <p className="text-xs text-stone-500 mt-1">Confidential health information. Access only for authorized clinic staff.</p>
            </div>
            <div className="flex gap-2">
              <input
                value={patientHistorySearch}
                onChange={(event) => setPatientHistorySearch(event.target.value)}
                placeholder="Search patient or booking..."
                className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
              />
              <button onClick={loadPatientHistory} disabled={isLoadingPatientHistory} className="px-3 py-2 rounded-xl bg-emerald-800 text-white text-xs font-bold disabled:opacity-50">
                {isLoadingPatientHistory ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
          {patientHistoryLoadError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">{patientHistoryLoadError}</div>}
          {!patientHistoryLoadError && patientHistory.length === 0 && !isLoadingPatientHistory && (
            <div className="p-8 text-center rounded-xl bg-stone-50 text-stone-500 text-sm">No patient history profiles found.</div>
          )}
          {patientHistory.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.6fr)] gap-5">
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                <div className="text-xs font-bold text-stone-500">{filteredPatientHistory.length} profile(s)</div>
                {filteredPatientHistory.map((profile) => (
                  <button
                    key={`${profile.bookingId}-${profile.createdAt}`}
                    onClick={() => setSelectedPatientHistory(profile)}
                    className={`w-full text-left p-3 rounded-xl border transition ${selectedPatientHistory === profile ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-emerald-300'}`}
                  >
                    <div className="font-bold text-sm text-stone-900">{profile.patientName}</div>
                    <div className="text-[11px] text-stone-500 mt-1">{profile.bookingId} · {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'No date'}</div>
                    <div className="text-[11px] text-stone-600 mt-1">{profile.email || profile.phone}</div>
                  </button>
                ))}
              </div>
              {selectedPatientHistory && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold text-stone-900">{selectedPatientHistory.patientName}</h3>
                      <p className="text-xs text-stone-500">{selectedPatientHistory.bookingId} · {selectedPatientHistory.dateOfBirth || 'DOB not provided'} · {selectedPatientHistory.gender || 'Gender not provided'}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold"><ShieldCheck className="w-3.5 h-3.5" /> Consent: {selectedPatientHistory.consent || 'Not recorded'}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ['Conditions flagged', selectedConditionFlags.length, 'bg-red-50 text-red-800'],
                      ['Pressure', selectedPatientHistory.pressure || 'Not set', 'bg-amber-50 text-amber-800'],
                      ['Pain areas', selectedPatientHistory.painAreas ? 'Recorded' : 'None listed', 'bg-blue-50 text-blue-800'],
                      ['Body areas', selectedPatientHistory.bodyAreas ? selectedPatientHistory.bodyAreas.split(',').length : 0, 'bg-purple-50 text-purple-800'],
                    ].map(([label, value, style]) => <div key={label} className={`rounded-xl p-3 ${style}`}><div className="text-[10px] font-bold uppercase">{label}</div><div className="text-lg font-black mt-1">{value}</div></div>)}
                  </div>
                  {selectedConditionFlags.length > 0 && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                      <h4 className="text-xs font-bold text-red-900 mb-2">Reported health conditions</h4>
                      <div className="flex flex-wrap gap-2">{selectedConditionFlags.map(([key]) => <span key={key} className="px-2 py-1 rounded-lg bg-white border border-red-200 text-[11px] text-red-800">{key}</span>)}</div>
                    </div>
                  )}
                  <BodyAreaMap value={selectedPatientHistory.bodyAreas} readOnly />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-4 rounded-xl bg-stone-50 space-y-2">
                      <h4 className="font-bold text-stone-800">Contact</h4>
                      <div>{selectedPatientHistory.email || 'No email'}</div><div>{selectedPatientHistory.phone || 'No phone'}</div>
                      <div>{[selectedPatientHistory.address, selectedPatientHistory.city, selectedPatientHistory.postalCode].filter(Boolean).join(', ') || 'No address'}</div>
                    </div>
                    <div className="p-4 rounded-xl bg-stone-50 space-y-2">
                      <h4 className="font-bold text-stone-800">Treatment notes</h4>
                      <div><strong>Body areas:</strong> {selectedPatientHistory.bodyAreas || 'None listed'}</div>
                      <div><strong>Pain/discomfort:</strong> {selectedPatientHistory.painAreas || 'None listed'}</div>
                      <div><strong>Additional details:</strong> {selectedPatientHistory.details || 'None listed'}</div>
                    </div>
                  </div>
                  <details className="border border-stone-200 rounded-xl p-4">
                    <summary className="cursor-pointer text-xs font-bold text-stone-700">View full medical questionnaire</summary>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                      {Object.entries(selectedPatientHistory.conditions).map(([key, value]) => <div key={key} className="flex justify-between border-b border-stone-100 py-1"><span>{key}</span><strong>{value || 'Not answered'}</strong></div>)}
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800">Business intelligence</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Sales & reports</h2>
              <p className="mt-1 text-sm text-slate-500">Track sales, collections, and appointment trends.</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-[11px] font-semibold text-slate-500">From<input type="date" value={reportStartDate} max={reportEndDate} onChange={(event) => setReportStartDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" /></label>
              <label className="text-[11px] font-semibold text-slate-500">To<input type="date" value={reportEndDate} min={reportStartDate} onChange={(event) => setReportEndDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" /></label>
              <button onClick={loadBookingsFromBackend} disabled={isLoadingBookings} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{isLoadingBookings ? 'Refreshing…' : 'Refresh data'}</button>
            </div>
          </div>
          {bookingLoadError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{bookingLoadError}</div>}
          {(() => {
            const branchName = selectedBranchId === 'all' ? '' : branches.find((branch) => String(branch.id) === String(selectedBranchId))?.name || '';
            const rows = bookings.filter((booking) => booking.date >= reportStartDate && booking.date <= reportEndDate && (!branchName || booking.branchName === branchName));
            const bookedSales = rows.reduce((sum, booking) => sum + (Number(booking.total) || 0), 0);
            const collected = rows.reduce((sum, booking) => sum + (Number(booking.paidAmount) || 0), 0);
            const outstanding = Math.max(0, bookedSales - collected);
            const taxCollected = rows.reduce((sum, booking) => {
              const total = Number(booking.total) || 0;
              return sum + (/registered massage therapy|\brmt\b|acupuncture/i.test(booking.serviceName || '') ? 0 : total - total / 1.13);
            }, 0);
            const trend = Array.from({ length: 7 }, (_, index) => {
              const day = new Date(`${reportEndDate}T12:00:00`);
              day.setDate(day.getDate() - (6 - index));
              const key = day.toISOString().slice(0, 10);
              return { key, label: day.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }), value: rows.filter((booking) => booking.date === key).reduce((sum, booking) => sum + (Number(booking.paidAmount) || 0), 0) };
            });
            const maxTrend = Math.max(1, ...trend.map((item) => item.value));
            const serviceTotals = Object.values(rows.reduce((totals, booking) => {
              const key = booking.serviceName || 'Other';
              totals[key] ||= { name: key, count: 0, revenue: 0 };
              totals[key].count += 1;
              totals[key].revenue += Number(booking.total) || 0;
              return totals;
            }, {})).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
            const stats = [
              ['Gross sales', bookedSales, 'bg-emerald-50 text-emerald-800', TrendingUp],
              ['Payments collected', collected, 'bg-blue-50 text-blue-800', CreditCard],
              ['Balance outstanding', outstanding, 'bg-amber-50 text-amber-800', AlertCircle],
              ['Appointments', rows.length, 'bg-violet-50 text-violet-800', CalendarIcon],
            ];
            return (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {stats.map(([label, value, style, Icon]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-xs font-semibold text-slate-500">{label}<span className={`rounded-xl p-2 ${style}`}><Icon className="h-4 w-4" /></span></div><div className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{label === 'Appointments' ? value : `$${Number(value).toFixed(2)}`}</div><p className="mt-1 text-[11px] text-slate-400">Selected reporting period</p></div>)}
                </div>
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between"><div><h3 className="font-bold text-slate-900">Payments collected</h3><p className="mt-1 text-xs text-slate-500">Daily totals · last 7 days in this period</p></div><span className="text-xs font-bold text-emerald-800">${collected.toFixed(2)}</span></div>
                    <div className="mt-7 flex h-48 items-end gap-3 border-b border-slate-100 px-1">
                      {trend.map((item) => <div key={item.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div className="flex w-full flex-1 items-end"><div title={`$${item.value.toFixed(2)}`} className="w-full rounded-t-md bg-gradient-to-t from-emerald-800 to-emerald-500 transition hover:from-emerald-700" style={{ height: `${Math.max(item.value ? 8 : 2, (item.value / maxTrend) * 100)}%` }} /></div><span className="pb-2 text-[10px] text-slate-400">{item.label}</span></div>)}
                    </div>
                    <p className="mt-4 text-xs text-slate-500">Estimated HST collected: <strong className="text-slate-800">${taxCollected.toFixed(2)}</strong></p>
                  </section>
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="font-bold text-slate-900">Top services</h3><p className="mt-1 text-xs text-slate-500">By gross sales in selected period</p>
                    <div className="mt-5 space-y-4">
                      {serviceTotals.length ? serviceTotals.map((service) => <div key={service.name}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-700">{service.name}</span><span className="shrink-0 font-bold text-slate-900">${service.revenue.toFixed(2)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.max(5, (service.revenue / Math.max(1, serviceTotals[0].revenue)) * 100)}%` }} /></div><p className="mt-1 text-[10px] text-slate-400">{service.count} appointment{service.count === 1 ? '' : 's'}</p></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No sales recorded for this date range.</p>}
                    </div>
                  </section>
                </div>
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Recent sales</h3><p className="mt-1 text-xs text-slate-500">Appointment totals and payments received</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">{rows.length} records</span></div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400"><th className="py-3 pr-4">Date / receipt</th><th className="py-3 pr-4">Patient</th><th className="py-3 pr-4">Service</th><th className="py-3 pr-4">Location</th><th className="py-3 pr-4 text-right">Paid</th><th className="py-3 text-right">Total</th></tr></thead><tbody>{rows.slice().sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0, 12).map((booking) => <tr key={booking.id} className="border-b border-slate-50 text-slate-600"><td className="py-3 pr-4"><span className="font-semibold text-slate-800">{booking.date}</span><span className="block font-mono text-[10px] text-slate-400">{booking.id}</span></td><td className="py-3 pr-4">{booking.customerName}</td><td className="py-3 pr-4">{booking.serviceName}</td><td className="py-3 pr-4">{booking.branchName}</td><td className="py-3 pr-4 text-right font-semibold">${(Number(booking.paidAmount) || 0).toFixed(2)}</td><td className="py-3 text-right font-bold text-slate-900">${(Number(booking.total) || 0).toFixed(2)}</td></tr>)}</tbody></table>{rows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No bookings in this reporting period.</p>}</div>
                </section>
              </>
            );
          })()}
        </div>
      )}

      {selectedCalendarEvent && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) setSelectedCalendarEvent(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="appointment-receipt-title" className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-gradient-to-r from-slate-950 to-emerald-900 px-5 py-5 text-white sm:px-6">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">Appointment details</p><h2 id="appointment-receipt-title" className="mt-1 text-lg font-bold">{issuedReceipt?.booking?.customerName || selectedCalendarEvent.booking?.customerName || selectedCalendarEvent.summary}</h2><p className="mt-1 text-xs text-emerald-100/80">{selectedCalendarEvent.booking?.id || 'Calendar event'} · {selectedCalendarEvent.localTime}</p></div>
              <button type="button" aria-label="Close appointment details" onClick={() => setSelectedCalendarEvent(null)} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-5 p-5 sm:p-6">
              {receiptError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{receiptError}</div>}
              {receiptNotice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">{receiptNotice}</div>}
              {(() => {
                const booking = issuedReceipt?.booking || selectedCalendarEvent.booking;
                const paidInFull = booking && Number(booking.total) > 0 && Number(booking.paidAmount) + 0.005 >= Number(booking.total);
                const needsDetails = booking?.autoLinked && (!booking.email || !(Number(booking.total) > 0));
                return booking ? (
                  <>
                    {booking.autoLinked && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                        This appointment was booked directly on the calendar and was automatically linked to a new booking record. {needsDetails ? 'Add the missing details below to enable receipt issuing.' : ''}
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ['Patient', booking.customerName],
                        ['Email', booking.email || 'No email on booking'],
                        ['Phone', booking.phone || 'Not provided'],
                        ['Booking reference', booking.id],
                        ['Service', booking.serviceName],
                        ['Service date', booking.date],
                        ['Therapist', booking.therapistName || selectedCalendarEvent.therapistName],
                        ['Payment method', booking.paymentOption || 'Not recorded'],
                      ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{value || 'Not recorded'}</p></div>)}
                    </div>
                    <div className="rounded-xl border border-slate-200 px-4 py-3">
                      <div className="flex justify-between text-sm text-slate-500"><span>Amount paid</span><span>${Number(booking.paidAmount || 0).toFixed(2)}</span></div>
                      <div className="mt-2 flex justify-between text-sm font-bold text-slate-900"><span>Appointment total</span><span>${Number(booking.total || 0).toFixed(2)}</span></div>
                    </div>
                    {!issuedReceipt && needsDetails && linkEventForm && (
                      <form onSubmit={completeBookingDetails} className="space-y-3 rounded-xl border border-slate-200 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-semibold text-slate-600">Patient email
                            <input required type="email" value={linkEventForm.email} onChange={(event) => setLinkEventForm((current) => ({ ...current, email: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">Phone
                            <input value={linkEventForm.phone} onChange={(event) => setLinkEventForm((current) => ({ ...current, phone: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">Payment method
                            <select value={linkEventForm.paymentOption} onChange={(event) => setLinkEventForm((current) => ({ ...current, paymentOption: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                              <option>Cash</option>
                              <option>Card</option>
                              <option>E-transfer</option>
                              <option>Other</option>
                            </select>
                          </label>
                          <label className="text-xs font-semibold text-slate-600">Appointment total ($)
                            <input required type="number" min="0" step="0.01" value={linkEventForm.total} onChange={(event) => setLinkEventForm((current) => ({ ...current, total: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">Amount paid ($)
                            <input type="number" min="0" step="0.01" value={linkEventForm.paidAmount} onChange={(event) => setLinkEventForm((current) => ({ ...current, paidAmount: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          </label>
                        </div>
                        <button type="submit" disabled={isLinkingEvent} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{isLinkingEvent ? 'Saving…' : 'Save details'}</button>
                      </form>
                    )}
                    {!issuedReceipt && !needsDetails && booking.id && Number(booking.total) > 0 && (
                      <label className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${paidInFull ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(paidInFull)}
                          disabled={Boolean(paidInFull) || isMarkingPaid}
                          onChange={() => markBookingPaid(booking)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-800 focus:ring-emerald-700 disabled:opacity-70"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">{paidInFull ? 'Paid already' : 'Paid already — mark as fully paid'}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-slate-500">{isMarkingPaid ? 'Recording payment…' : paidInFull ? 'Full payment is recorded for this booking.' : `Check this if payment has been received. It records $${Number(booking.total).toFixed(2)} as paid and enables receipt issuing.`}</span>
                        </span>
                      </label>
                    )}
                    {issuedReceipt && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                        <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Receipt issued</p><p className="mt-1 font-mono text-sm font-bold text-slate-900">{issuedReceipt.receipt.number}</p></div><CheckCircle2 className="h-5 w-5 text-emerald-700" /></div>
                        {issuedReceipt.receipt.loyaltyDiscount > 0 && <div className="mt-3 flex justify-between border-t border-emerald-100 pt-3 text-sm"><span className="text-slate-600">Loyalty discount · {issuedReceipt.receipt.pointsRedeemed.toLocaleString()} points</span><span>-${issuedReceipt.receipt.loyaltyDiscount.toFixed(2)}</span></div>}
                        <div className="mt-3 flex justify-between border-t border-emerald-100 pt-3 text-sm"><span className="text-slate-600">{issuedReceipt.receipt.taxLabel}</span><span>${issuedReceipt.receipt.tax.toFixed(2)}</span></div>
                        <div className="mt-2 flex justify-between text-sm font-bold"><span>Total paid</span><span>${issuedReceipt.receipt.total.toFixed(2)}</span></div>
                        <p className="mt-3 text-xs text-emerald-900">Loyalty balance: {issuedReceipt.receipt.pointsBalance.toLocaleString()} points.</p>
                        <p className="mt-3 text-xs text-emerald-900">Receipt email sent to {issuedReceipt.booking.email}.</p>
                      </div>
                    )}
                    {!issuedReceipt && !needsDetails && (
                      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-5 text-slate-500">{!paidInFull ? 'Receipts are available only after full payment is recorded.' : !booking.email ? 'Add a valid patient email to the booking before issuing a receipt.' : !booking.id ? 'This appointment is not linked to a booking record.' : 'A receipt will be emailed to the patient and recorded with this booking.'}</p>
                        <button type="button" disabled={isIssuingReceipt || !paidInFull || !booking.email || !booking.id} onClick={() => issueReceipt(booking.id)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><ReceiptText className="h-4 w-4" />{isIssuingReceipt ? 'Issuing…' : 'Issue & email receipt'}</button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                    This calendar event could not be automatically linked to a booking record. Reload the calendar to try again.
                  </div>
                );
              })()}
            </div>
            {issuedReceipt && <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-4"><button type="button" onClick={() => printIssuedReceipt(issuedReceipt)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"><Download className="h-4 w-4" />Print / save PDF</button></div>}
          </section>
        </div>
      )}
        </main>
      </div>
    </div>
  );
}