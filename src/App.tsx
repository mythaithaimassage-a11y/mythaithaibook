// The existing single-file app predates the strict TypeScript project setup.
// Keep its runtime behavior unchanged while the app is incrementally typed.
// @ts-nocheck
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, Clock, User, MapPin, CreditCard, CheckCircle2, Globe, Settings, 
  Plus, Edit, Trash2, Building, FileText, Phone, Mail, Search, Filter, 
  TrendingUp, ChevronRight, AlertCircle, Sparkles, ShieldCheck, Check, X,
  DollarSign, Users, Award, Briefcase, RefreshCw, Layers, CheckSquare, Stethoscope, Link2, Send, Database,
  Menu, Home, CalendarDays, UserRound, BarChart3, CreditCard as CardIcon, ChevronRight as ChevronRightIcon
} from 'lucide-react';

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
  { id: 1, name: "Kanya S.", thaiCertified: true, rmtCertified: false, branches: [1, 2], rating: 4.9, bio: "10+ years traditional Wat Pho Thai technique experience" },
  { id: 2, name: "Michael T., RMT", thaiCertified: true, rmtCertified: true, branches: [1, 3], rating: 4.8, bio: "CMTO Registered Massage Therapist & Deep Tissue specialist" },
  { id: 3, name: "Priya P.", thaiCertified: true, rmtCertified: false, branches: [2, 4], rating: 4.9, bio: "Hot stone specialist and body stretch master" },
  { id: 4, name: "Somchai R., RMT", thaiCertified: true, rmtCertified: true, branches: [1, 4], rating: 5.0, bio: "Acupuncture practitioner and sports rehabilitation" }
];

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
  tagline: 'Traditional Thai massage & wellness',
  email: 'mythaithaimassage@gmail.com',
  phone: '+1 437 898 7424',
  website: 'https://mythaithaimassage.com',
  address: 'Ontario, Canada',
};

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
        patientHistorySaved: result.patientHistorySaved !== false,
        patientHistoryReason: result.patientHistoryError || ''
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

export default function App() {
  const [viewMode, setViewMode] = useState('customer'); // 'customer' or 'admin'
  const [adminLang, setAdminLang] = useState('en'); // 'en' or 'th'
  const [servicesList, setServicesList] = useState(INITIAL_SERVICES);
  const [therapistsList, setTherapistsList] = useState(MOCK_THERAPISTS);
  const [selectedBranchId, setSelectedBranchId] = useState(1);
  
  // Google Sheets API Webhook URL state
  const [sheetsWebhookUrl, setSheetsWebhookUrl] = useState(() => {
    return localStorage.getItem('mtt_sheets_webhook_url') || '';
  });

  const [existingBookings, setExistingBookings] = useState([
    { id: 'MTT-1001', customerName: 'David Miller', phone: '416-555-0192', email: 'd.miller@gmail.com', serviceId: 2, serviceName: 'Thai Traditional Massage (60 min)', branchId: 1, therapistId: 1, therapistName: 'Kanya S.', date: '2026-09-19', time: '11:00 AM', status: 'Confirmed', paidAmount: 20, total: 107.35, syncedToSheets: true },
    { id: 'MTT-1002', customerName: 'Sarah Jenkins', phone: '905-555-0143', email: 's.jenkins@yahoo.ca', serviceId: 11, serviceName: 'Thai Combo Swedish + Hot Stone (60 min)', branchId: 1, therapistId: 2, therapistName: 'Michael T., RMT', date: '2026-09-19', time: '01:00 PM', status: 'Completed', paidAmount: 118.65, total: 118.65, syncedToSheets: true },
    { id: 'MTT-1003', customerName: 'Amanda Wong', phone: '647-555-0821', email: 'amanda.wong@outlook.com', serviceId: 18, serviceName: 'Registered Massage Therapy (RMT 60 min)', branchId: 2, therapistId: 4, therapistName: 'Somchai R., RMT', date: '2026-09-19', time: '02:30 PM', status: 'Confirmed', paidAmount: 30, total: 120.00, syncedToSheets: true }
  ]);

  const handleUpdateWebhookUrl = (url) => {
    setSheetsWebhookUrl(url);
    localStorage.setItem('mtt_sheets_webhook_url', url);
  };

  return (
    <div className="min-h-screen bg-stone-100 font-sans text-stone-800 flex flex-col justify-between">
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="flex items-center space-x-2 font-semibold tracking-wide">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-950 text-xs font-black tracking-tight text-white shadow-sm">M</span>
          <span className="text-lg font-bold tracking-tight text-slate-950">MedBook</span>
          <span className="hidden rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800 sm:inline-flex">Practice platform</span>
        </div>
        <nav aria-label="Platform views" className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode('customer')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              viewMode === 'customer'
                ? 'bg-emerald-950 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            Booking portal
          </button>
          <button
            onClick={() => setViewMode('admin')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              viewMode === 'admin'
                ? 'bg-emerald-950 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            Owner dashboard
          </button>
          <button
            onClick={() => setViewMode('therapist')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              viewMode === 'therapist' ? 'bg-emerald-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            Therapist
          </button>
        </nav>
      </header>

      {/* Main View Switcher */}
      <main className={`flex-1 w-full ${viewMode === 'admin' ? 'p-0' : 'p-3 sm:p-6 max-w-7xl mx-auto'}`}>
        {viewMode === 'customer' ? (
          <CustomerPortal 
            branches={MOCK_BRANCHES} 
            services={servicesList} 
            therapists={therapistsList}
            sheetsWebhookUrl={sheetsWebhookUrl}
            onNewBooking={(newBkg) => setExistingBookings(prev => [newBkg, ...prev])}
          />
        ) : viewMode === 'admin' ? (
          <AdminGate>
            <AdminPortal
              branches={MOCK_BRANCHES}
              services={servicesList}
              setServices={setServicesList}
              therapists={therapistsList}
              setTherapists={setTherapistsList}
              bookings={existingBookings}
              setBookings={setExistingBookings}
              selectedBranchId={selectedBranchId}
              setSelectedBranchId={setSelectedBranchId}
              lang={adminLang}
              setLang={setAdminLang}
              sheetsWebhookUrl={sheetsWebhookUrl}
              onUpdateWebhookUrl={handleUpdateWebhookUrl}
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

function TherapistPortal() {
  const [therapist, setTherapist] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({ upcomingCount: 0, flaggedCount: 0 });
  const [therapistProfile, setTherapistProfile] = useState({ branchNames: [], attendedHours: 0, attendedClientCount: 0 });
  const [attendedClients, setAttendedClients] = useState([]);
  const [calendarView, setCalendarView] = useState('agenda');
  const [calendarDate, setCalendarDate] = useState(new Date().toISOString().slice(0, 10));
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [therapistPanel, setTherapistPanel] = useState('schedule');
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('');
  const [signupComplete, setSignupComplete] = useState('');

  const loadAppointments = async () => {
    const response = await fetch(`/api/booking?view=therapist-dashboard&calendarView=${calendarView}&date=${encodeURIComponent(calendarDate)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to load therapist appointments');
    setTherapist(data.therapist);
    setAppointments(data.appointments || []);
    setSelectedAppointment((current) => current || data.appointments?.[0] || null);
    setSummary(data.summary || { upcomingCount: (data.appointments || []).length, flaggedCount: 0 });
    setTherapistProfile(data.profile || { branchNames: [], attendedHours: 0, attendedClientCount: 0 });
    setAttendedClients(data.attended || []);
    setCalendarEvents(data.calendarEvents || []);
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

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-blue-900 via-blue-800 to-emerald-800 p-6 sm:p-8 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs uppercase tracking-[0.2em] text-blue-200">Therapist workspace</p><h1 className="text-2xl sm:text-3xl font-black mt-1">Welcome, {therapist.name}</h1><p className="text-sm text-blue-100 mt-2">Your upcoming schedule and treatment-safety preparation</p></div>
          <div className="flex gap-2">
            <button onClick={async () => { setRefreshing(true); try { await loadAppointments(); } finally { setRefreshing(false); } }} disabled={refreshing} className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold disabled:opacity-50">{refreshing ? 'Syncing...' : 'Refresh data'}</button>
            <button onClick={async () => { await fetch('/api/booking?view=therapist-logout', { method: 'POST' }); setTherapist(null); setAppointments([]); }} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs">Sign out</button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-sm"><div className="text-xs font-bold uppercase tracking-wide text-stone-500">Upcoming appointments</div><div className="text-3xl font-black text-blue-800 mt-2">{summary.upcomingCount}</div><div className="text-xs text-stone-500 mt-1">Synced from Google Sheets</div></div>
        <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-sm"><div className="text-xs font-bold uppercase tracking-wide text-stone-500">Safety flags</div><div className="text-3xl font-black text-amber-700 mt-2">{summary.flaggedCount}</div><div className="text-xs text-stone-500 mt-1">Conditions or oil allergies</div></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-stone-500">Branches served</div>
          <div className="text-sm font-black text-emerald-800 mt-2">{therapistProfile.branchNames.length ? therapistProfile.branchNames.join(' · ') : 'No branch recorded'}</div>
        </div>
        <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-stone-500">Hours served</div>
          <div className="text-3xl font-black text-blue-800 mt-2">{therapistProfile.attendedHours.toFixed(1)}</div>
          <div className="text-xs text-stone-500 mt-1">Based on past appointments</div>
        </div>
        <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-stone-500">Clients attended</div>
          <div className="text-3xl font-black text-purple-800 mt-2">{therapistProfile.attendedClientCount}</div>
          <div className="text-xs text-stone-500 mt-1">Completed/past bookings</div>
        </div>
      </div>
      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">Only the minimum information needed for treatment preparation is shown. Do not copy, download, or share patient information.</div>
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-5 py-4 text-white">
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
      {appointments.length === 0 && <div className="bg-white rounded-2xl p-8 text-center border border-stone-200 text-sm text-stone-500">No upcoming appointments assigned to you.</div>}
      {appointments.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-1 border-b border-stone-200 px-4 pt-3">
            {[
              ['schedule', 'Patient preparation'],
              ['patients', 'My patients'],
            ].map(([panel, label]) => (
              <button key={panel} onClick={() => setTherapistPanel(panel)} className={`px-4 py-2.5 text-xs font-bold border-b-2 ${therapistPanel === panel ? 'border-blue-700 text-blue-800' : 'border-transparent text-stone-500'}`}>
                {label}
              </button>
            ))}
          </div>
          {therapistPanel === 'schedule' && (
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] min-h-[360px]">
              <div className="border-r border-stone-200 bg-stone-50">
                <div className="p-4 text-xs font-bold uppercase tracking-wide text-stone-500">Upcoming patients</div>
                <div className="divide-y divide-stone-200">
                  {appointments.map((appointment) => (
                    <button key={`patient-${appointment.bookingId}`} onClick={() => setSelectedAppointment(appointment)} className={`w-full text-left p-4 hover:bg-blue-50 ${selectedAppointment?.bookingId === appointment.bookingId ? 'bg-blue-100 border-l-4 border-blue-700' : ''}`}>
                      <div className="font-bold text-sm text-stone-900">{appointment.patientName}</div>
                      <div className="text-[11px] text-stone-500 mt-1">{appointment.date} · {appointment.time}</div>
                      <div className="text-[11px] text-blue-700 mt-1">{appointment.serviceName}</div>
                    </button>
                  ))}
                </div>
              </div>
              {selectedAppointment && (
                <div className="p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-4">
                    <div><div className="text-xs uppercase tracking-wide text-stone-500">Patient preparation</div><h2 className="text-2xl font-black text-stone-900 mt-1">{selectedAppointment.patientName}</h2><p className="text-sm text-stone-500 mt-1">{selectedAppointment.date} at {selectedAppointment.time} · {selectedAppointment.serviceName}</p></div>
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
                  {(selectedAppointment.painAreas || selectedAppointment.additionalDetails) && <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="rounded-xl bg-stone-50 p-4 text-xs"><div className="font-bold text-stone-700 mb-1">Pain / discomfort</div>{selectedAppointment.painAreas || 'None recorded'}</div><div className="rounded-xl bg-stone-50 p-4 text-xs"><div className="font-bold text-stone-700 mb-1">Safety details</div>{selectedAppointment.additionalDetails || 'None recorded'}</div></div>}
                  <div className="mt-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">Use this summary to prepare. Review the complete patient history only through the authorized clinical workflow.</div>
                </div>
              )}
            </div>
          )}
          {therapistPanel === 'patients' && (
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {appointments.map((appointment) => <button key={`card-${appointment.bookingId}`} onClick={() => { setSelectedAppointment(appointment); setTherapistPanel('schedule'); }} className="text-left rounded-xl border border-stone-200 p-4 hover:border-blue-400 hover:shadow-sm"><div className="font-bold text-stone-900">{appointment.patientName}</div><div className="text-xs text-stone-500 mt-1">{appointment.date} · {appointment.time}</div><div className="text-xs text-blue-700 mt-2">{appointment.branchName}</div></button>)}
            </div>
          )}
        </div>
      )}
      <div className="grid gap-4">
        {appointments.map((appointment) => (
          <div key={appointment.bookingId} className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm hover:shadow-md transition">
            <div className="flex flex-wrap justify-between gap-2"><div><h2 className="text-lg font-bold text-stone-900">{appointment.patientName}</h2><p className="text-xs text-stone-500">{appointment.date} at {appointment.time} · {appointment.serviceName}</p></div><span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-800 text-xs font-bold">{appointment.branchName}</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="p-3 rounded-xl bg-amber-50"><div className="text-[10px] font-bold uppercase text-amber-800">Pressure</div><div className="text-sm font-bold">{appointment.pressure || 'Not recorded'}</div></div>
              <div className="p-3 rounded-xl bg-red-50"><div className="text-[10px] font-bold uppercase text-red-800">Conditions</div><div className="text-sm font-bold">{appointment.hasReportedConditions ? `${appointment.reportedConditionCount} reported` : 'None flagged'}</div></div>
              <div className="p-3 rounded-xl bg-purple-50"><div className="text-[10px] font-bold uppercase text-purple-800">Oil allergy</div><div className="text-sm font-bold">{appointment.allergiesToOil ? 'Yes' : 'No'}</div></div>
              <div className="p-3 rounded-xl bg-blue-50"><div className="text-[10px] font-bold uppercase text-blue-800">Body areas</div><div className="text-xs font-bold">{appointment.bodyAreas || 'Not recorded'}</div></div>
            </div>
            {(appointment.painAreas || appointment.additionalDetails) && <div className="mt-4 p-3 rounded-xl bg-stone-50 text-xs space-y-1"><div><strong>Pain/discomfort:</strong> {appointment.painAreas || 'None recorded'}</div><div><strong>Additional safety details:</strong> {appointment.additionalDetails || 'None recorded'}</div></div>}
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-stone-200">
          <h2 className="text-lg font-bold text-stone-900">Client history</h2>
          <p className="text-xs text-stone-500 mt-1">Past appointments assigned to you. Medical details are not shown in this list.</p>
        </div>
        {attendedClients.length === 0 ? (
          <div className="p-6 text-sm text-stone-500">No attended client history is available yet.</div>
        ) : (
          <div className="divide-y divide-stone-100">
            {attendedClients.map((client) => (
              <div key={client.bookingId} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div><div className="font-bold text-sm text-stone-900">{client.patientName}</div><div className="text-xs text-stone-500">{client.date} at {client.time} · {client.serviceName}</div></div>
                <div className="flex items-center gap-3 text-xs"><span className="text-stone-500">{client.branchName}</span><span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-bold">{(client.durationMinutes / 60).toFixed(1)} hr</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-stone-200">
          <h2 className="text-lg font-bold text-stone-900">Historical bookings</h2>
          <p className="text-xs text-stone-500 mt-1">All past bookings assigned to you, including service duration and branch.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-500 uppercase tracking-wide">
              <tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Client</th><th className="px-5 py-3">Service</th><th className="px-5 py-3">Branch</th><th className="px-5 py-3">Duration</th><th className="px-5 py-3">Booking ID</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {attendedClients.map((client) => (
                <tr key={`table-${client.bookingId}`} className="hover:bg-stone-50">
                  <td className="px-5 py-3 whitespace-nowrap">{client.date} {client.time}</td>
                  <td className="px-5 py-3 font-bold text-stone-800">{client.patientName}</td>
                  <td className="px-5 py-3">{client.serviceName}</td>
                  <td className="px-5 py-3">{client.branchName}</td>
                  <td className="px-5 py-3">{client.durationMinutes} min</td>
                  <td className="px-5 py-3 font-mono">{client.bookingId}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {attendedClients.length === 0 && <div className="p-6 text-sm text-stone-500">No historical bookings are available.</div>}
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
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sheetsSyncStatus, setSheetsSyncStatus] = useState(null);
  const [sheetsSyncReason, setSheetsSyncReason] = useState('');
  const [showExistingPatientChoice, setShowExistingPatientChoice] = useState(false);
  
  const [bookingData, setBookingData] = useState({
    branch: branches[0],
    service: null,
    therapist: null,
    date: new Date().toISOString().split('T')[0],
    time: null,
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

  const categories = ['All', 'Thai Traditional', 'Thai Combo Swedish', 'Hot Stone Combo', 'Add-On & Packages', 'RMT Healthcare'];

  const filteredServices = useMemo(() => {
    if (selectedCategory === 'All') return services;
    return services.filter(s => s.category === selectedCategory);
  }, [services, selectedCategory]);

  const updateBooking = (field, val) => {
    setBookingData(prev => ({ ...prev, [field]: val }));
  };

  const updateCustomer = (field, val) => {
    setBookingData(prev => ({
      ...prev,
      customer: { ...prev.customer, [field]: val }
    }));
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
    if (!bookingData.service) return { base: 0, tax: 0, total: 0, deposit: 0, balanceDue: 0 };
    const base = bookingData.service.price;
    const tax = base * (bookingData.service.taxRate || 0);
    const total = base + tax;
    let deposit = 0;
    if (bookingData.paymentOption === 'deposit') {
      deposit = bookingData.service.deposit;
    } else if (bookingData.paymentOption === 'full') {
      deposit = total;
    } else {
      deposit = 0; // clinic
    }
    const balanceDue = Math.max(0, total - deposit);
    return { base, tax, total, deposit, balanceDue };
  };

  const financials = calculateFinancials();

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSheetsSyncStatus('pending');
    setSheetsSyncReason('');

    const code = 'MTT-' + Math.floor(100000 + Math.random() * 900000);
    const customerFullName = `${bookingData.customer.firstName} ${bookingData.customer.lastName}`;

    const payloadForSheets = {
      id: code,
      customerName: customerFullName,
      phone: bookingData.customer.phone,
      email: bookingData.customer.email,
      branchName: bookingData.branch.name,
      serviceName: bookingData.service.name,
      therapistName: bookingData.therapist?.name || 'Any Available',
      therapistCandidates: therapists
        .filter((therapist) => therapist.branches.includes(bookingData.branch.id))
        .map((therapist) => therapist.name),
      date: bookingData.date,
      time: bookingData.time,
      durationMinutes: bookingData.service.duration,
      branchAddress: `${bookingData.branch.address}, ${bookingData.branch.city}`,
      intakeNotes: [
        `Pressure: ${bookingData.intake.pressure}`,
        bookingData.intake.focusAreas ? `Focus areas: ${bookingData.intake.focusAreas}` : '',
        bookingData.intake.injuries ? `Injuries: ${bookingData.intake.injuries}` : '',
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
    const syncResult = await sendBookingToGoogleSheets(sheetsWebhookUrl, payloadForSheets);
    const syncSuccess = syncResult.success;
    if (!syncSuccess || syncResult.emailSent === false || syncResult.patientHistorySaved === false) {
      setSheetsSyncReason(syncResult.reason || syncResult.emailReason || syncResult.patientHistoryReason || 'The booking sync failed.');
    }

    const newRecord = {
      id: code,
      customerName: customerFullName,
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
      paidAmount: financials.deposit,
      total: financials.total,
      syncedToSheets: syncSuccess
    };

    onNewBooking(newRecord);
    setBookingData(prev => ({ ...prev, confirmationCode: code }));
    setSheetsSyncStatus(syncSuccess
      ? (syncResult.emailSent === false ? 'email_failed' : (syncResult.patientHistorySaved === false ? 'patient_history_failed' : 'success'))
      : 'failed');
    setIsSubmitting(false);
    setStep(5);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden max-w-4xl mx-auto my-2 sm:my-6">
      {/* Clinic Header Banner */}
      <div className="bg-emerald-900 text-white p-6 sm:p-8 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 w-40 h-40 bg-emerald-800 rounded-full opacity-30 pointer-events-none"></div>
        <div className="relative z-10">
          <h1 className="text-3xl sm:text-4xl font-serif tracking-tight font-bold text-amber-200">MY THAI THAI</h1>
          <p className="text-emerald-100 font-medium text-sm sm:text-base mt-1">Thai Massage & Wellness • Ontario, Canada</p>
          
          <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:text-sm bg-emerald-950/60 backdrop-blur px-5 py-2 rounded-full border border-emerald-700/50">
            <a href="tel:+14378987424" className="flex items-center text-emerald-200 hover:text-white transition">
              <Phone className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              +1 437 898 7424
            </a>
            <span className="text-emerald-700 hidden sm:inline">•</span>
            <a href="https://Mythaithaimassage.com" target="_blank" rel="noreferrer" className="flex items-center text-emerald-200 hover:text-white transition">
              <Globe className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              Mythaithaimassage.com
            </a>
          </div>
        </div>
      </div>

      {/* 5-Step Progress Stepper */}
      <div className="bg-stone-50 border-b border-stone-200 px-4 py-3 sm:px-8">
        <div className="flex items-center justify-between text-xs sm:text-sm font-medium">
          {[
            { num: 1, label: "Branch & Service" },
            { num: 2, label: "Therapist & Time" },
            { num: 3, label: "Your Info" },
            { num: 4, label: "Payment & Review" },
            { num: 5, label: "Confirmed" }
          ].map((s) => (
            <div key={s.num} className={`flex items-center space-x-1.5 ${step === s.num ? 'text-emerald-700 font-bold' : step > s.num ? 'text-stone-700' : 'text-stone-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === s.num 
                  ? 'bg-emerald-700 text-white ring-2 ring-emerald-200' 
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

      <div className="p-4 sm:p-8">
        {/* STEP 1: Branch & Service */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-stone-900 mb-1">1. Choose Location</h2>
              <p className="text-xs text-stone-500 mb-3">Select your preferred MY THAI THAI spa location</p>
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
              <h2 className="text-xl font-bold text-stone-900 mb-1">Select Therapist</h2>
              <p className="text-xs text-stone-500 mb-3">Choose a specific practitioner or request any available therapist</p>
              
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

                {therapists.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => updateBooking('therapist', t)}
                    className={`p-3.5 rounded-xl border text-left transition ${
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
                  </button>
                ))}
              </div>
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
                disabled={!bookingData.customer.firstName || !bookingData.customer.phone || (!bookingData.intake.preCollectionConsent || (bookingData.intake.historyMode !== 'reuse' && (!bookingData.intake.consent || !bookingData.intake.signature)))}
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
                    <span>Therapist:</span>
                    <span className="font-semibold text-stone-800">{bookingData.therapist?.name || 'Any Available'}</span>
                  </div>
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
                    date: new Date().toISOString().split('T')[0],
                    time: null,
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
  services, 
  setServices, 
  therapists, 
  setTherapists,
  bookings, 
  setBookings, 
  selectedBranchId, 
  setSelectedBranchId,
  lang,
  setLang,
  sheetsWebhookUrl,
  onUpdateWebhookUrl
}) {
  const [activeTab, setActiveTab] = useState('schedule');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [businessProfile, setBusinessProfile] = useState(DEFAULT_BUSINESS_PROFILE);
  const [hasLoadedBusinessProfile, setHasLoadedBusinessProfile] = useState(false);
  const [isLoadingBusinessProfile, setIsLoadingBusinessProfile] = useState(false);
  const [isSavingBusinessProfile, setIsSavingBusinessProfile] = useState(false);
  const [businessProfileError, setBusinessProfileError] = useState('');
  const [businessProfileMessage, setBusinessProfileMessage] = useState('');
  const [inputUrl, setInputUrl] = useState(sheetsWebhookUrl);
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
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

  // Staff management state
  const [showAddTherapistModal, setShowAddTherapistModal] = useState(false);
  const [deletingTherapistId, setDeletingTherapistId] = useState(null);
  const [newTherapist, setNewTherapist] = useState({
    name: '',
    bio: '',
    rating: '4.9',
    thaiCertified: true,
    rmtCertified: false
  });

  const handleAddTherapist = (e) => {
    e.preventDefault();
    if (!newTherapist.name.trim()) return;
    const created = {
      id: Date.now(),
      name: newTherapist.name.trim(),
      bio: newTherapist.bio.trim() || 'Experienced massage practitioner',
      thaiCertified: newTherapist.thaiCertified,
      rmtCertified: newTherapist.rmtCertified,
      branches: [1, 2, 3, 4],
      rating: parseFloat(newTherapist.rating) || 5.0
    };
    setTherapists(prev => [...prev, created]);
    setNewTherapist({ name: '', bio: '', rating: '4.9', thaiCertified: true, rmtCertified: false });
    setShowAddTherapistModal(false);
  };

  const handleRemoveTherapist = (id) => {
    setTherapists(prev => prev.filter(th => th.id !== id));
    setDeletingTherapistId(null);
  };

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
    if (activeTab === 'schedule') loadBookingsFromBackend();
  }, [activeTab]);

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

  const handleSaveWebhook = (e) => {
    e.preventDefault();
    onUpdateWebhookUrl(inputUrl);
    setTestResult({ type: 'success', msg: 'Google Apps Script Webhook URL saved successfully!' });
  };

  const handleTestPing = async () => {
    if (!inputUrl) {
      setTestResult({ type: 'error', msg: 'Please enter a valid Google Apps Script URL first.' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);

    const testPayload = {
      id: "TEST-PING-" + Math.floor(Math.random() * 8999 + 1000),
      customerName: "TEST CUSTOMER",
      phone: "+1 437 898 7424",
      email: "mythaithaimassage@gmail.com",
      branchName: "Mississauga Central",
      serviceName: "Thai Traditional Massage (60 min)",
      therapistName: "Kanya S.",
      date: new Date().toISOString().split('T')[0],
      time: "12:00 PM",
      paymentOption: "deposit",
      paidAmount: "20.00",
      totalAmount: "107.35"
    };

    const res = await sendBookingToGoogleSheets(inputUrl, testPayload);
    setIsTesting(false);
    if (res.success) {
      setTestResult({ type: 'success', msg: 'Test payload sent to Google Apps Script successfully! Check your Master Google Sheet.' });
    } else {
      setTestResult({ type: 'error', msg: `Connection failed: ${res.reason}` });
    }
  };

  const adminNavigation = [
    { id: 'schedule', label: 'Home', icon: Home, section: 'Workspace' },
    { id: 'calendar', label: 'Booking Calendar', icon: CalendarDays, section: 'Workspace' },
    { id: 'schedule', label: 'Events & bookings', icon: CalendarIcon, section: 'Workspace' },
    { id: 'financials', label: 'Getting paid', icon: CardIcon, section: 'Workspace' },
    { id: 'financials', label: 'Sales & reports', icon: BarChart3, section: 'Workspace' },
    { id: 'services', label: 'Service catalogue', icon: Layers, section: 'Manage' },
    { id: 'staff', label: 'Staff', icon: Users, section: 'Manage' },
    { id: 'patient-history', label: 'Patients', icon: UserRound, section: 'Manage' },
    { id: 'business-profile', label: 'Business profile', icon: Building, section: 'Manage' },
    { id: 'sheets', label: 'Integrations', icon: Database, section: 'Manage' },
    { id: 'business-profile', label: 'Settings', icon: Settings, section: 'Manage' },
  ];
  const pageTitle = {
    schedule: t.schedule,
    calendar: 'Booking Calendar',
    financials: t.financials,
    services: t.services,
    staff: t.staff,
    'patient-history': 'Patient Summary',
    'business-profile': 'Business profile',
    sheets: 'Integrations',
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
          {['Workspace', 'Manage'].map((section) => (
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
                        <div key={event.id} className={`rounded-lg border-l-4 px-3 py-2 text-xs ${getTherapistCalendarColor(event.therapistName, therapists).event}`}>
                          <div className={`font-bold ${getTherapistCalendarColor(event.therapistName, therapists).text}`}>{event.summary}</div>
                            <div className={getTherapistCalendarColor(event.therapistName, therapists).text}>{event.localTime} · {event.therapistName || event.calendarName.replace(' - MY THAI THAI', '')}</div>
                        </div>
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
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-bold text-stone-900">{event.summary}</span>
                    <span className="text-sm font-semibold text-emerald-800">{event.localTime}</span>
                  </div>
                  <div className="text-xs text-stone-500 mt-1">{event.therapistName || event.calendarName} · {event.location}</div>
                  <p className="text-xs text-stone-600 mt-2 whitespace-pre-line">{event.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: GOOGLE SHEETS API CONFIGURATION */}
      {activeTab === 'sheets' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-bold text-stone-900 flex items-center">
              <Database className="w-5 h-5 mr-2 text-emerald-800" />
              Google Sheets API v4 Integration Settings
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              Direct connection to Google Sheets inside <span className="font-semibold text-stone-800">mythaithaimassage@gmail.com</span> using Google Cloud Console Service Account & Sheets API v4.
            </p>
          </div>

          <form onSubmit={handleSaveWebhook} className="space-y-4 bg-stone-50 p-4 sm:p-5 rounded-2xl border border-stone-200">
            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">
                Backend Google Sheets API Route / Proxy Endpoint
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="/api/booking or https://mythaithaimassage.com/api/booking"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="flex-1 p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none font-mono"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-800 text-white font-bold rounded-xl text-xs hover:bg-emerald-900 transition shrink-0"
                >
                  Save Route URL
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200">
              <span className="text-xs text-stone-500">
                Integration Status: {sheetsWebhookUrl ? <strong className="text-emerald-700">Custom Route Active ({sheetsWebhookUrl})</strong> : <strong className="text-emerald-700 font-bold">Standard Route (/api/booking) Active</strong>}
              </span>
              <button
                type="button"
                onClick={handleTestPing}
                disabled={isTesting}
                className="px-4 py-2 bg-stone-800 text-white text-xs font-semibold rounded-lg hover:bg-stone-900 transition flex items-center disabled:opacity-50"
              >
                {isTesting ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                Send Test Sheets API Payload
              </button>
            </div>

            {testResult && (
              <div className={`p-3 rounded-xl text-xs font-medium ${testResult.type === 'success' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-red-100 text-red-900 border border-red-300'}`}>
                {testResult.msg}
              </div>
            )}
          </form>

          {/* Reference Google Sheets API Code Box */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-stone-900">Backend API Route (`/api/booking.js`) - Official Google Sheets API v4</h3>
            <pre className="bg-stone-900 text-stone-200 p-4 rounded-xl text-xs overflow-x-auto font-mono">
{`// api/booking.js - Node.js Serverless Function using 'googleapis'
import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\\\n/g, '\\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'Sheet1!A:M',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [Object.values(req.body)]
    }
  });

  return res.status(200).json({ status: 'success' });
}`}
            </pre>
          </div>
        </div>
      )}

      {/* TAB CONTENT: SERVICES CATALOGUE MANAGER */}
      {activeTab === 'services' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{t.services}</h2>
              <p className="text-xs text-stone-500">Configure prices, deposits, HST rules, and RMT statuses</p>
            </div>
            <button
              onClick={() => {
                const name = prompt("Service Name:");
                if (!name) return;
                const price = parseFloat(prompt("Price ($):") || "100");
                const newS = {
                  id: Date.now(),
                  name,
                  category: "Thai Traditional",
                  duration: 60,
                  price,
                  deposit: 20,
                  isRmt: false,
                  taxRate: 0.13,
                  description: "Custom Spa Treatment"
                };
                setServices(prev => [newS, ...prev]);
              }}
              className="px-4 py-2 bg-amber-700 text-white rounded-xl text-xs font-bold hover:bg-amber-800 transition flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" /> {t.addService}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-stone-50 text-stone-600 font-bold border-b">
                <tr>
                  <th className="p-3">{t.name}</th>
                  <th className="p-3">{t.category}</th>
                  <th className="p-3">{t.duration}</th>
                  <th className="p-3">{t.price}</th>
                  <th className="p-3">{t.deposit}</th>
                  <th className="p-3">{t.isRmt}</th>
                  <th className="p-3">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {services.map(s => (
                  <tr key={s.id} className="hover:bg-stone-50 transition">
                    <td className="p-3 font-bold text-stone-900">{s.name}</td>
                    <td className="p-3 text-stone-500">{s.category}</td>
                    <td className="p-3">{s.duration} mins</td>
                    <td className="p-3 font-bold text-emerald-800">${s.price}</td>
                    <td className="p-3 text-stone-600">${s.deposit}</td>
                    <td className="p-3">
                      {s.isRmt ? (
                        <span className="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded text-[10px]">RMT Exempt</span>
                      ) : (
                        <span className="text-stone-400 text-[10px]">13% HST</span>
                      )}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => {
                          const newP = prompt("New Price ($):", s.price);
                          if (newP !== null) {
                            setServices(prev => prev.map(item => item.id === s.id ? { ...item, price: parseFloat(newP) } : item));
                          }
                        }}
                        className="text-amber-700 hover:text-amber-900 font-bold text-xs"
                      >
                        {t.edit}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: STAFF & THERAPISTS */}
      {activeTab === 'staff' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{t.staff}</h2>
              <p className="text-xs text-stone-500">Manage registered therapists, credentials, and staffing assignments</p>
            </div>
            <button
              onClick={() => setShowAddTherapistModal(true)}
              className="px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold hover:bg-emerald-900 transition flex items-center shadow-sm"
            >
              <Plus className="w-4 h-4 mr-1.5" /> {t.addTherapist}
            </button>
          </div>

          {/* Add Therapist Form Modal / Panel */}
          {showAddTherapistModal && (
            <div className="bg-stone-50 border border-stone-300 p-5 rounded-2xl space-y-4 animate-fadeIn">
              <div className="flex justify-between items-center pb-2 border-b border-stone-200">
                <h3 className="font-bold text-stone-900 text-sm flex items-center">
                  <User className="w-4 h-4 mr-1.5 text-emerald-800" />
                  {t.addTherapist}
                </h3>
                <button 
                  onClick={() => setShowAddTherapistModal(false)}
                  className="text-stone-400 hover:text-stone-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddTherapist} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Full Name *</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Somsak P., RMT"
                      value={newTherapist.name}
                      onChange={(e) => setNewTherapist(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Initial Rating (1.0 - 5.0)</label>
                    <input 
                      type="number"
                      step="0.1"
                      min="1.0"
                      max="5.0"
                      value={newTherapist.rating}
                      onChange={(e) => setNewTherapist(prev => ({ ...prev, rating: e.target.value }))}
                      className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Professional Bio / Specialty</label>
                  <input 
                    type="text"
                    placeholder="e.g. 8+ years deep tissue and Wat Pho traditional practitioner"
                    value={newTherapist.bio}
                    onChange={(e) => setNewTherapist(prev => ({ ...prev, bio: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer font-medium text-stone-800">
                    <input 
                      type="checkbox"
                      checked={newTherapist.thaiCertified}
                      onChange={(e) => setNewTherapist(prev => ({ ...prev, thaiCertified: e.target.checked }))}
                      className="rounded text-emerald-700 focus:ring-emerald-600 w-4 h-4"
                    />
                    <span>Traditional Thai Certified</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer font-medium text-stone-800">
                    <input 
                      type="checkbox"
                      checked={newTherapist.rmtCertified}
                      onChange={(e) => setNewTherapist(prev => ({ ...prev, rmtCertified: e.target.checked }))}
                      className="rounded text-blue-700 focus:ring-blue-600 w-4 h-4"
                    />
                    <span>RMT Healthcare Certified (Ontario CMTO)</span>
                  </label>
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-stone-200">
                  <button
                    type="button"
                    onClick={() => setShowAddTherapistModal(false)}
                    className="px-4 py-2 border border-stone-300 text-stone-600 rounded-xl text-xs font-bold hover:bg-stone-100 transition"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold hover:bg-emerald-900 transition shadow-sm"
                  >
                    {t.save}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {therapists.map(th => (
              <div key={th.id} className="p-4 rounded-xl border border-stone-200 bg-stone-50/50 flex justify-between items-start space-x-3 transition hover:shadow-sm">
                <div className="space-y-1.5 flex-1">
                  <div className="font-bold text-stone-900 text-base flex items-center justify-between">
                    <span>{th.name}</span>
                    <span className="font-bold text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">★ {th.rating}</span>
                  </div>
                  <p className="text-xs text-stone-500 line-clamp-2">{th.bio}</p>
                  <div className="pt-1 flex flex-wrap gap-1">
                    {th.rmtCertified && <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">RMT Certified</span>}
                    {th.thaiCertified && <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">Traditional Thai Practitioner</span>}
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end justify-between self-stretch">
                  {deletingTherapistId === th.id ? (
                    <div className="flex flex-col items-end space-y-1">
                      <button
                        onClick={() => handleRemoveTherapist(th.id)}
                        className="px-2.5 py-1 bg-red-600 text-white font-bold text-[11px] rounded-lg hover:bg-red-700 transition shadow-sm"
                      >
                        {t.confirmRemove}
                      </button>
                      <button
                        onClick={() => setDeletingTherapistId(null)}
                        className="text-[10px] text-stone-500 underline hover:text-stone-800"
                      >
                        {t.cancel}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingTherapistId(th.id)}
                      className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title={t.removeTherapist}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {therapists.length === 0 && (
              <div className="col-span-full py-8 text-center text-stone-400 text-xs">
                No therapists listed. Click "{t.addTherapist}" above to register staff members.
              </div>
            )}
          </div>
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
                    { key: 'businessName', label: 'Business name', type: 'text', required: true, placeholder: 'MY THAI THAI' },
                    { key: 'tagline', label: 'Short description', type: 'text', placeholder: 'Traditional Thai massage & wellness' },
                    { key: 'email', label: 'Business email', type: 'email', placeholder: 'hello@example.com' },
                    { key: 'phone', label: 'Phone number', type: 'tel', placeholder: '+1 437 898 7424' },
                    { key: 'website', label: 'Website', type: 'url', placeholder: 'https://example.com' },
                    { key: 'address', label: 'Business location', type: 'text', placeholder: 'City, Province' },
                  ].map((field) => (
                    <label key={field.key} className={`block ${field.key === 'businessName' || field.key === 'tagline' ? 'sm:col-span-2' : ''}`}>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{field.label}{field.required && <span className="ml-1 text-rose-600">*</span>}</span>
                      <input
                        type={field.type}
                        required={field.required}
                        maxLength={field.key === 'businessName' ? 100 : 250}
                        value={businessProfile[field.key] || ''}
                        onChange={(event) => {
                          setBusinessProfile((profile) => ({ ...profile, [field.key]: event.target.value }));
                          setBusinessProfileMessage('');
                        }}
                        placeholder={field.placeholder}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                      />
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
                <div className="mt-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-900 to-emerald-700 text-lg font-bold text-white shadow-md">
                  {(businessProfile.businessName || 'MT').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">{businessProfile.businessName || 'Your business name'}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-500">{businessProfile.tagline || 'Add a short introduction to your practice.'}</p>
                <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-sm text-slate-600">
                  {businessProfile.email && <div className="flex items-start gap-2.5"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span className="break-all">{businessProfile.email}</span></div>}
                  {businessProfile.phone && <div className="flex items-start gap-2.5"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span>{businessProfile.phone}</span></div>}
                  {businessProfile.website && <div className="flex items-start gap-2.5"><Globe className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span className="break-all">{businessProfile.website}</span></div>}
                  {businessProfile.address && <div className="flex items-start gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span>{businessProfile.address}</span></div>}
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

      {activeTab === 'financials' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-stone-900">{t.financials}</h2>
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between font-bold text-emerald-900">
              <span>Gross Booking Volume:</span>
              <span>${totalRevenue.toFixed(2)} CAD</span>
            </div>
            <div className="flex justify-between text-emerald-800">
              <span>Estimated HST Collected (Ontario 13%):</span>
              <span>${hstCollected.toFixed(2)} CAD</span>
            </div>
            <div className="flex justify-between text-emerald-800">
              <span>Net Spa Revenue:</span>
              <span>${(totalRevenue - hstCollected).toFixed(2)} CAD</span>
            </div>
          </div>
        </div>
      )}
        </main>
      </div>
    </div>
  );
}