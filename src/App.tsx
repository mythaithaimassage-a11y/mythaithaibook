// The existing single-file app predates the strict TypeScript project setup.
// Keep its runtime behavior unchanged while the app is incrementally typed.
// @ts-nocheck
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Calendar as CalendarIcon, Clock, User, MapPin, CreditCard, CheckCircle2, Globe, Settings, 
  Plus, Edit, Trash2, Building, FileText, Phone, Mail, Search, Filter, 
  TrendingUp, ChevronRight, AlertCircle, Sparkles, ShieldCheck, Check, X,
  DollarSign, Users, Award, Briefcase, RefreshCw, Layers, CheckSquare, Stethoscope, Database,
  Menu, Home, CalendarDays, UserRound, BarChart3, ChevronRight as ChevronRightIcon,
  Megaphone, ReceiptText, Download, Eye, MousePointerClick, Upload, Crown, Star, CalendarX, CalendarOff, Ban, Copy, UserCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import WixContacts from './WixContacts';
import WixBookings from './WixBookings';
import PackageTracking from './PackageTracking';
import ClearBookingHistory from './ClearBookingHistory';
import WixCalendarSync from './WixCalendarSync';
import QuickBooking from './QuickBooking';
import BookingNote from './BookingNote';
import { LanguageProvider, createTranslator, message, useTranslation } from './localization';
import { AVAILABLE_TIMES, BOOKING_DEPOSIT_AMOUNT, branchPaymentOptions, bookingCategories } from '../lib/booking-options.js';
import { emptyPatientHistory } from '../lib/patient-history.js';
import { anatomicalBodyParts } from '../lib/body-map.js';
import { portalEntry } from '../lib/portal-entry.js';

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


// Medical history questions. Shared by the intake grid, the select-all controls, and
// the blank default state so the three can never drift apart.
const INTAKE_CONDITIONS = [
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
];
const BLANK_INTAKE_CONDITIONS = Object.fromEntries(INTAKE_CONDITIONS.map(([field]) => [field, '']));

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
        patientHistorySaved: result.patientHistorySkipped === true || result.patientHistorySaved !== false,
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

const BODY_TYPE_OPTIONS = [['female', 'Female'], ['male', 'Male'], ['neutral', 'Neutral']];

function bodyTypeFromGender(gender) {
  const value = String(gender || '').trim().toLowerCase();
  if (value === 'female') return 'female';
  if (value === 'male') return 'male';
  return 'neutral';
}

// Each part is an ellipsoid (centre x/y/z, radii rx/ry/rz). x runs to the patient's left,
// y runs downwards and z points out of the front of the body.
function buildBodyParts(bodyType) {
  const female = bodyType === 'female';
  const male = bodyType === 'male';
  const pick = (f, m, n) => (female ? f : male ? m : n);
  const shoulderX = pick(31, 39, 35);
  const armX = pick(40, 48, 44);
  const legX = pick(16, 15, 15);
  const parts = [
    { id: 'head', areas: ['Head / face'], x: 0, y: 30, z: 0, rx: pick(17, 19, 18), ry: pick(22, 23, 22), rz: pick(19, 20, 19) },
    { id: 'neck', areas: ['Neck'], x: 0, y: 59, z: -1, rx: pick(7, 10, 8), ry: 11, rz: pick(7, 9, 8) },
    { id: 'upper-torso', areas: ['Upper back', 'Chest / abdomen'], x: 0, y: 103, z: 0, rx: pick(29, 36, 32), ry: pick(33, 36, 34), rz: pick(18, 21, 19) },
    { id: 'lower-torso', areas: ['Lower back', 'Chest / abdomen'], x: 0, y: 148, z: 0, rx: pick(25, 30, 27), ry: 28, rz: pick(16, 18, 17) },
    { id: 'pelvis', areas: ['Hips / glutes'], x: 0, y: 184, z: -1, rx: pick(38, 32, 34), ry: pick(25, 22, 23), rz: pick(21, 19, 20) },
    ...[-1, 1].flatMap((side) => [
      { id: `shoulder-${side}`, areas: ['Shoulders'], x: side * shoulderX, y: 78, z: 0, rx: pick(12, 15, 13), ry: pick(11, 13, 12), rz: pick(11, 13, 12) },
      { id: `upper-arm-${side}`, areas: ['Arms / hands'], x: side * armX, y: 114, z: 0, rx: pick(7, 9, 8), ry: 30, rz: pick(7, 9, 8) },
      { id: `forearm-${side}`, areas: ['Arms / hands'], x: side * (armX + 3), y: 169, z: 3, rx: pick(6, 7.5, 7), ry: 28, rz: pick(6, 7.5, 7) },
      { id: `hand-${side}`, areas: ['Arms / hands'], x: side * (armX + 5), y: 205, z: 5, rx: pick(5, 6, 5.5), ry: 11, rz: 4 },
      { id: `thigh-${side}`, areas: ['Legs / knees'], x: side * legX, y: 240, z: 0, rx: pick(15, 14, 14), ry: 42, rz: pick(15, 14, 14) },
      { id: `knee-${side}`, areas: ['Legs / knees'], x: side * legX, y: 280, z: 2, rx: 9, ry: 9, rz: 9 },
      { id: `shin-${side}`, areas: ['Legs / knees'], x: side * (legX - 1), y: 315, z: -1, rx: pick(9, 10, 9.5), ry: 34, rz: pick(9, 10, 9.5) },
      { id: `foot-${side}`, areas: ['Feet'], x: side * (legX - 1), y: 354, z: 7, rx: 7, ry: 6, rz: 15 },
    ]),
  ];
  if (female) {
    parts.push(...[-1, 1].map((side) => ({ id: `bust-${side}`, areas: ['Chest / abdomen'], x: side * 12, y: 108, z: 13, rx: 11, ry: 10, rz: 9 })));
  }
  return parts;
}

// Marker anchors. facing limits a marker to when that side of the body is towards the viewer;
// candidates lets paired limbs show their marker on whichever limb is nearer.
function buildAreaAnchors(bodyType) {
  const parts = buildBodyParts(bodyType);
  const part = (id) => parts.find((item) => item.id === id);
  const pair = (prefix, dz = 0) => [-1, 1].map((side) => { const p = part(`${prefix}-${side}`); return { x: p.x, y: p.y, z: p.z + dz }; });
  return {
    'Head / face': { candidates: [{ x: 0, y: 18, z: 0 }] },
    Neck: { candidates: [{ x: 0, y: 59, z: 0 }] },
    Shoulders: { candidates: pair('shoulder') },
    'Upper back': { facing: 'back', candidates: [{ x: 0, y: 100, z: -20 }] },
    'Lower back': { facing: 'back', candidates: [{ x: 0, y: 148, z: -17 }] },
    'Chest / abdomen': { facing: 'front', candidates: [{ x: 0, y: 128, z: 20 }] },
    'Arms / hands': { candidates: pair('forearm') },
    'Hips / glutes': { candidates: [{ x: 0, y: 184, z: 0 }] },
    'Legs / knees': { candidates: pair('knee') },
    Feet: { candidates: pair('foot', 6) },
  };
}

function rotatePoint(point, angle) {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos + point.z * sin, depth: -point.x * sin + point.z * cos };
}

function describeBodyAngle(angle) {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized < 45 || normalized >= 315) return 'Front';
  if (normalized < 135) return "Patient's right side";
  if (normalized < 225) return 'Back';
  return "Patient's left side";
}

function BodyAreaMap({ value = '', onChange, readOnly = false, gender = '' }) {
  const { translate: tr } = useTranslation();
  const selected = Array.isArray(value)
    ? value
    : String(value || '').split(',').map((area) => area.trim()).filter(Boolean);
  const [bodyType, setBodyType] = useState(() => bodyTypeFromGender(gender));
  const [angle, setAngle] = useState(0);
  const dragRef = React.useRef(null);
  const gradientId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');

  useEffect(() => {
    setBodyType(bodyTypeFromGender(gender));
  }, [gender]);

  const toggle = (area) => {
    if (readOnly || !onChange) return;
    onChange(selected.includes(area) ? selected.filter((item) => item !== area) : [...selected, area]);
  };

  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const parts = useMemo(() => anatomicalBodyParts(bodyType, angle), [bodyType, angle]);
  const anchors = useMemo(() => buildAreaAnchors(bodyType), [bodyType]);

  const isPartMarked = (part) => part.areas.some((area) => {
    if (!selected.includes(area)) return false;
    // Torso areas belong to one side of the body, so only tint the torso when that side is visible.
    if (area === 'Upper back' || area === 'Lower back') return cos < 0.35;
    if (area === 'Chest / abdomen' && part.id !== 'lower-torso' && part.id !== 'upper-torso') return true;
    if (area === 'Chest / abdomen') return cos > -0.35;
    return true;
  });

  const projectedParts = parts.map((part) => ({ ...part, marked: isPartMarked(part) }));

  const markers = BODY_AREA_OPTIONS.map(([area]) => {
    const anchor = anchors[area];
    if (anchor.facing === 'front' && cos < 0.2) return null;
    if (anchor.facing === 'back' && cos > -0.2) return null;
    const best = anchor.candidates
      .map((point) => ({ ...rotatePoint(point, angle), y: point.y }))
      .sort((a, b) => b.depth - a.depth)[0];
    return { area, x: best.x, y: best.y, marked: selected.includes(area) };
  }).filter(Boolean);

  const leftLabel = cos > 0.5 ? 'R' : cos < -0.5 ? 'L' : '';
  const rightLabel = cos > 0.5 ? 'L' : cos < -0.5 ? 'R' : '';

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    dragRef.current = { startX: event.clientX, startAngle: angle };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event) => {
    if (!dragRef.current) return;
    const next = dragRef.current.startAngle + (event.clientX - dragRef.current.startX) * 0.9;
    setAngle(((Math.round(next) % 360) + 360) % 360);
  };
  const endDrag = () => { dragRef.current = null; };

  const bodyTypeLabel = BODY_TYPE_OPTIONS.find(([id]) => id === bodyType)?.[1] || 'Neutral';

  return (
    <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-slate-50 via-white to-cyan-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-black text-slate-800">{tr('3D body map')}</div>
          <div className="text-[11px] text-slate-500">{tr(readOnly ? 'Highlighted areas were reported by the patient. Drag the body or use the slider to turn it.' : 'Tap every affected area. Drag the body or use the slider to turn it.')}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={tr('Body type')}>
            {BODY_TYPE_OPTIONS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setBodyType(id)} aria-pressed={bodyType === id} className={`rounded-md px-2 py-1 text-[10px] font-bold ${bodyType === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{tr(label)}</button>
            ))}
          </div>
          <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-bold text-cyan-800">{selected.length} {tr('marked')}</span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center">
        <div className="mx-auto w-full max-w-[260px]">
          <div className="relative rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-100">
            <div className="absolute left-3 top-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{tr(describeBodyAngle(angle))}</div>
            <div className="absolute right-3 top-2 text-[10px] font-semibold text-slate-400">{tr(bodyTypeLabel)} {tr('body')}</div>
            <svg
              viewBox="-95 -5 190 385"
              className="h-80 w-full cursor-grab touch-none select-none active:cursor-grabbing"
              role="img"
              aria-label={tr('{body} body diagram, {view} view, {areas}', { body: tr(bodyTypeLabel), view: tr(describeBodyAngle(angle)), areas: selected.length ? tr('marked areas: {areas}', { areas: selected.map((area) => tr(area)).join(', ') }) : tr('no areas marked') })}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <defs>
                <linearGradient id={`${gradientId}-skin`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#b78068" />
                  <stop offset="30%" stopColor="#edc6ad" />
                  <stop offset="65%" stopColor="#e3b89b" />
                  <stop offset="100%" stopColor="#ae775f" />
                </linearGradient>
                <radialGradient id={`${gradientId}-marked`} cx="38%" cy="32%" r="75%">
                  <stop offset="0%" stopColor="#cffafe" />
                  <stop offset="50%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#0e7490" />
                </radialGradient>
              </defs>
              <ellipse cx="0" cy="366" rx="48" ry="8" fill="#0f172a" opacity="0.1" />
              {projectedParts.map((part) => (
                <path
                  key={part.id}
                  d={part.path}
                  fill={`url(#${gradientId}-${part.marked ? 'marked' : 'skin'})`}
                />
              ))}
              {cos > 0.3 && (
                <g transform={`translate(${17 * sin} 0) scale(${cos} 1)`} fill="none" stroke="#815c4d" strokeWidth="0.9" opacity={Math.min(0.65, cos)}>
                  <path d="M -11 28 Q -7 26 -3 28 M 3 28 Q 7 26 11 28 M 0 29 L -2 35 Q 0 37 3 35 M -5 41 Q 0 43 5 41" />
                  <path d="M -24 81 Q -15 77 -4 83 M 4 83 Q 15 77 24 81 M -16 110 Q -9 114 -3 111 M 3 111 Q 9 114 16 110 M 0 139 L 0 152" strokeOpacity="0.35" />
                </g>
              )}
              {cos < -0.3 && (
                <g transform={`scale(${-cos} 1)`} fill="none" stroke="#815c4d" strokeWidth="0.8" opacity="0.35">
                  <path d="M 0 76 Q -2 110 0 150 M -7 86 Q -20 98 -17 116 M 7 86 Q 20 98 17 116 M 0 177 L 0 195" />
                </g>
              )}
              {leftLabel && <text x="-88" y="200" fontSize="11" fontWeight="700" fill="#94a3b8">{tr(leftLabel)}</text>}
              {rightLabel && <text x="88" y="200" textAnchor="end" fontSize="11" fontWeight="700" fill="#94a3b8">{tr(rightLabel)}</text>}
              {markers.map((marker) => (
                <g
                  key={marker.area}
                  role="button"
                  tabIndex={readOnly ? -1 : 0}
                  aria-label={marker.marked ? tr('{area} (selected)', { area: tr(marker.area) }) : tr(marker.area)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => toggle(marker.area)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(marker.area); } }}
                  className={readOnly ? 'cursor-default' : 'cursor-pointer'}
                >
                  <title>{tr(marker.area)}</title>
                  {marker.marked && <circle cx={marker.x} cy={marker.y} r="12" fill="#22d3ee" opacity="0.25" />}
                  <circle cx={marker.x} cy={marker.y} r="8" fill={marker.marked ? '#0891b2' : '#ffffff'} fillOpacity={marker.marked ? 1 : 0.85} stroke={marker.marked ? '#ffffff' : '#64748b'} strokeWidth="1.5" />
                  {marker.marked && <text x={marker.x} y={marker.y + 3.5} textAnchor="middle" fontSize="9" fontWeight="800" fill="#ffffff">{selected.indexOf(marker.area) + 1}</text>}
                </g>
              ))}
            </svg>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input type="range" min="0" max="359" value={angle} onChange={(event) => setAngle(Number(event.target.value))} aria-label={tr('Rotate body')} className="flex-1 accent-cyan-600" />
            <span className="w-9 text-right text-[10px] font-semibold text-slate-500">{angle}°</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {[['Front', 0], ['Right', 90], ['Back', 180], ['Left', 270]].map(([label, target]) => (
              <button key={label} type="button" onClick={() => setAngle(target)} className={`rounded-md border px-1 py-1 text-[10px] font-bold ${angle === target ? 'border-cyan-400 bg-cyan-50 text-cyan-800' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>{tr(label)}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">{tr(readOnly ? 'Reported areas' : 'Affected areas')}</div>
          <div className="flex flex-wrap gap-1.5">
            {BODY_AREA_OPTIONS.map(([area]) => {
              const marked = selected.includes(area);
              return (
                <button key={area} type="button" onClick={() => toggle(area)} disabled={readOnly} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${marked ? 'border-cyan-400 bg-cyan-100 text-cyan-900' : 'border-slate-200 bg-white text-slate-500'} ${readOnly ? 'cursor-default' : ''}`}>
                  {marked && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-600 text-[9px] font-black text-white">{selected.indexOf(area) + 1}</span>}
                  {tr(area)}
                </button>
              );
            })}
          </div>
          {readOnly && selected.length === 0 && <p className="mt-3 text-[11px] text-slate-500">{tr('No body areas were reported.')}</p>}
        </div>
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
  const [entry] = useState(() => portalEntry(typeof window === 'undefined' ? '/' : window.location.pathname));
  const [companyPortalToken] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('companyToken') || '';
  });
  const [companyJoinToken] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('joinToken') || '';
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
  const [viewMode, setViewMode] = useState(entry.mode);
  // Set when staff open the booking flow from the dashboard for a walk-in or phone
  // booking, which unlocks the option to take payment at the clinic instead.
  const [staffBooking, setStaffBooking] = useState(false);
  const [adminLang, setAdminLang] = useState('en'); // 'en' or 'th'
  const tr = createTranslator(viewMode === 'admin' ? adminLang : 'en');
  useEffect(() => {
    document.documentElement.lang = viewMode === 'admin' ? adminLang : 'en';
  }, [viewMode, adminLang]);
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

  if (companyJoinToken) {
    return <CompanyJoinPortal token={companyJoinToken} />;
  }

  return (
    <div className={`min-h-screen font-sans flex flex-col justify-between ${viewMode === 'customer' ? 'bg-[#f1f3f7] text-slate-800' : 'bg-stone-100 text-stone-800'}`}>
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
          <span className={`hidden rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider sm:inline-flex ${viewMode === 'therapist' ? 'border border-slate-700 bg-slate-900 text-slate-300' : 'border border-emerald-100 bg-emerald-50 text-emerald-800'}`}>{tr('Practice platform')}</span>
        </div>
        {entry.staffNavigation ? <nav aria-label={tr('Staff platform views')} className={`flex items-center gap-1 rounded-full p-1 ${viewMode === 'therapist' ? 'bg-slate-900' : 'bg-slate-100'}`}>
          {[
            { mode: 'customer', label: 'Booking', Icon: CalendarDays },
            { mode: 'admin', label: 'Dashboard', Icon: BarChart3 },
            { mode: 'therapist', label: 'Therapist', Icon: Stethoscope },
          ].map(({ mode, label, Icon }) => {
            const isActive = viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tr(label)}
                title={tr(label)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 ${
                  isActive
                    ? `${mode === 'therapist' ? 'bg-slate-700' : 'bg-emerald-950'} text-white shadow-sm`
                    : viewMode === 'therapist' ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-white hover:text-slate-950'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{tr(label)}</span>
              </button>
            );
          })}
        </nav> : <a href="/" aria-label="Public booking home" className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950 px-3 py-2 text-xs font-semibold text-white">
          <CalendarDays className="h-4 w-4" /> Booking
        </a>}
      </header>

      {/* Main View Switcher */}
      <main className={`flex-1 w-full ${viewMode === 'admin' || viewMode === 'therapist' ? 'p-0' : 'mx-auto max-w-[1600px] p-2.5 sm:p-6 xl:p-8'}`}>
        {viewMode === 'customer' ? (
          <CustomerPortal 
            branches={activeBranches} 
            services={activeServices} 
            therapists={activeTherapists}
            sheetsWebhookUrl={sheetsWebhookUrl}
            staffBooking={staffBooking}
            onNewBooking={(newBkg) => setExistingBookings(prev => [newBkg, ...prev])}
          />
        ) : viewMode === 'admin' ? (
          <LanguageProvider language={adminLang}>
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
              onNavigateToBookingPortal={() => { setStaffBooking(true); setViewMode('customer'); }}
            />
          </AdminGate>
          </LanguageProvider>
        ) : (
          <TherapistPortal />
        )}
      </main>

      {/* Footer */}
      <footer className={`${viewMode === 'customer' ? 'border-slate-800 bg-slate-950 text-slate-400' : 'border-stone-800 bg-stone-900 text-stone-400'} border-t px-6 py-4 text-center text-xs`}>
        <p>© 2026 MY THAI THAI MASSAGE AND WELLNESS INC. {tr('All rights reserved.')} • Toronto & Mississauga, Ontario</p>
        <nav aria-label={tr('Legal information')} className="mt-2 flex flex-wrap justify-center gap-4">
          <a href="/privacy-policy" className="underline underline-offset-4 hover:text-white">{tr('Privacy Policy')}</a>
          <a href="/terms-of-service" className="underline underline-offset-4 hover:text-white">{tr('Terms of Service')}</a>
        </nav>
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
  const [joinLinkCopied, setJoinLinkCopied] = useState(false);

  const copyJoinLink = async () => {
    if (!data?.joinUrl) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(data.joinUrl);
      else window.prompt('Copy this employee signup link:', data.joinUrl);
      setJoinLinkCopied(true);
      setTimeout(() => setJoinLinkCopied(false), 2500);
    } catch {
      window.prompt('Copy this employee signup link:', data.joinUrl);
    }
  };

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

            {data.joinUrl && (
              <section className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
                <h2 className="text-sm font-bold uppercase tracking-wide text-sky-900">Let employees sign themselves up</h2>
                <p className="mt-1 text-sm text-sky-900/80">Share this link with your whole team. It only opens a Platinum signup form — it never shows your employee list, hours, or top-up history, and it cannot be used to open this portal.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="flex-1 min-w-[240px] break-all rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs text-sky-900">{data.joinUrl}</code>
                  <button type="button" onClick={copyJoinLink} className="inline-flex items-center gap-2 rounded-lg bg-sky-900 px-4 py-2 text-xs font-semibold text-white shadow-sm">
                    <Copy className="h-4 w-4" /> {joinLinkCopied ? 'Copied!' : 'Copy employee signup link'}
                  </button>
                </div>
              </section>
            )}

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

// Restricted employee-facing signup page reached via ?joinToken=... . The primary contact
// shares this link with their team; unlike the admin ?companyToken=... portal it exposes only
// the company name and plan benefits, and can do nothing but enroll the person filling it in.
function CompanyJoinPortal({ token }) {
  const { businessName, photoUrl } = useBusinessBranding();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [enrolled, setEnrolled] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/booking?view=company-join&token=${encodeURIComponent(token)}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'This signup link is no longer active.');
        if (!cancelled) setInfo(result);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || 'This signup link is no longer active.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await fetch('/api/booking?view=company-join-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...form }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to complete your signup.');
      setEnrolled({ name: form.name, emailSent: result.emailSent });
    } catch (requestError) {
      setSubmitError(requestError.message || 'Unable to complete your signup.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 font-sans text-stone-800">
      <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-8">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-950 text-xs font-black tracking-tight text-white">M</span>
          )}
          <div>
            <p className="text-lg font-bold tracking-tight text-slate-950">{businessName || 'MY THAI THAI'}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Employee Platinum signup{info?.organization ? ` · ${info.organization}` : ''}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
        {loading ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Checking your signup link…</p>
        ) : error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">{error}</p>
        ) : enrolled ? (
          <div className="rounded-xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" />
            <h1 className="mt-3 text-xl font-bold text-slate-950">You're on the Platinum plan, {enrolled.name}!</h1>
            <p className="mt-2 text-sm text-slate-600">
              {enrolled.emailSent
                ? 'A welcome email is on its way with everything you need to book.'
                : 'Your membership is active. Your welcome email could not be sent — the clinic can resend it.'}
            </p>
            <a href="/" className="mt-4 inline-flex rounded-lg bg-emerald-950 px-4 py-2 text-sm font-semibold text-white shadow-sm">Book your first session</a>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <h1 className="flex items-center gap-2 text-lg font-bold text-amber-950"><Crown className="h-5 w-5" /> {info?.organization} Platinum membership</h1>
              {info?.enabled === false ? (
                <p className="mt-2 text-sm font-medium text-amber-900">The loyalty program is paused right now. Please check back shortly.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-amber-900">
                  {!!info?.platinum?.discountPercent && <li>• {info.platinum.discountPercent}% off every treatment</li>}
                  {!!info?.platinum?.hotStoneDiscount && <li>• {info.platinum.hotStoneDiscount}% off the hot stone add-on</li>}
                  <li>• Draw on your company's shared prepaid hours</li>
                </ul>
              )}
              <p className="mt-3 text-xs text-amber-900/80">Signing up adds you to your company's plan. You will not be able to see or manage your colleagues.</p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Your details</h2>
              <form onSubmit={submit} className="mt-3 grid gap-3">
                <input
                  type="text"
                  required
                  placeholder="Your full name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="email"
                  required
                  placeholder="Your work email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={submitting || info?.enabled === false}
                  className="rounded-lg bg-emerald-950 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 sm:w-fit"
                >
                  {submitting ? 'Signing up…' : 'Join the Platinum plan'}
                </button>
              </form>
              {submitError && <p className="mt-2 text-sm font-medium text-rose-700">{submitError}</p>}
            </section>
          </div>
        )}
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
  const [myUnavailability, setMyUnavailability] = useState([]);
  const [unavailabilityForm, setUnavailabilityForm] = useState({ date: new Date().toISOString().slice(0, 10), startTime: '12:00', endTime: '13:00', reason: '' });
  const [unavailabilitySaving, setUnavailabilitySaving] = useState(false);
  const [unavailabilityError, setUnavailabilityError] = useState('');

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
    setMyUnavailability(data.myUnavailability || []);
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

  const createUnavailabilityBlock = async (event) => {
    event.preventDefault();
    setUnavailabilitySaving(true);
    setUnavailabilityError('');
    try {
      const response = await fetch('/api/booking?view=therapist-unavailability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unavailabilityForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save this block.');
      setMyUnavailability((current) => [data.block, ...current]);
      setUnavailabilityForm((current) => ({ ...current, reason: '' }));
    } catch (requestError) {
      setUnavailabilityError(requestError.message || 'Unable to save this block.');
    } finally {
      setUnavailabilitySaving(false);
    }
  };

  const deleteUnavailabilityBlock = async (id) => {
    setUnavailabilityError('');
    try {
      const response = await fetch('/api/booking?view=therapist-unavailability-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to remove this block.');
      setMyUnavailability((current) => current.filter((block) => block.id !== id));
    } catch (requestError) {
      setUnavailabilityError(requestError.message || 'Unable to remove this block.');
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
          <button
            type="button"
            onClick={() => setWorkspaceView('availability')}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition lg:w-full ${workspaceView === 'availability' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-white'}`}
          >
            <CalendarX className="h-4 w-4" />
            <span className="flex-1 whitespace-nowrap">My availability</span>
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
      ) : workspaceView === 'availability' ? (
        <section className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Schedule</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">My availability</h1>
            <p className="mt-1 text-sm text-slate-600">Block off breaks, days off, or other times you cannot take appointments. Blocks are removed automatically from the booking calendar.</p>
          </div>
          <form onSubmit={createUnavailabilityBlock} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-semibold text-slate-600">Date
              <input type="date" required value={unavailabilityForm.date} onChange={(e) => setUnavailabilityForm((current) => ({ ...current, date: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600">Start time
              <input type="time" required value={unavailabilityForm.startTime} onChange={(e) => setUnavailabilityForm((current) => ({ ...current, startTime: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600">End time
              <input type="time" required value={unavailabilityForm.endTime} onChange={(e) => setUnavailabilityForm((current) => ({ ...current, endTime: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600 lg:col-span-1">Reason (optional)
              <input type="text" value={unavailabilityForm.reason} onChange={(e) => setUnavailabilityForm((current) => ({ ...current, reason: e.target.value }))} placeholder="Lunch break" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <div className="flex items-end">
              <button type="submit" disabled={unavailabilitySaving} className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60">{unavailabilitySaving ? 'Saving…' : 'Add block'}</button>
            </div>
          </form>
          {unavailabilityError && <p className="text-sm font-medium text-red-600">{unavailabilityError}</p>}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-900">Upcoming blocks</h2></div>
            {myUnavailability.length ? (
              <div className="divide-y divide-slate-100">
                {myUnavailability.map((block) => (
                  <div key={block.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{block.date} · {block.startTime}–{block.endTime}</p>
                      {block.reason && <p className="mt-1 text-xs text-slate-500">{block.reason}</p>}
                    </div>
                    <button type="button" onClick={() => deleteUnavailabilityBlock(block.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />Remove</button>
                  </div>
                ))}
              </div>
            ) : <p className="p-5 text-sm text-slate-500">No blocks scheduled. Add one above.</p>}
          </div>
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
                  {appointment.bookingNote && <span className="mt-1 block whitespace-pre-wrap text-[10px] text-blue-800">Team note: {appointment.bookingNote}</span>}
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
                <span className="text-sm text-slate-600">{appointment.serviceName}<span className="block text-xs text-slate-400">{appointment.durationMinutes || '—'} minutes</span>{appointment.bookingNote && <span className="mt-1 block whitespace-pre-wrap text-xs text-blue-800">Team note: {appointment.bookingNote}</span>}</span>
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
                    <BodyAreaMap value={selectedAppointment.bodyAreas} gender={selectedAppointment.gender} readOnly />
                  </div>
                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-blue-50 p-4 text-xs"><div className="font-bold text-blue-900 mb-1">Shared internal booking note</div><p className="whitespace-pre-wrap leading-5 text-blue-800">{selectedAppointment.bookingNote || 'No internal booking note recorded.'}</p></div>
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
  const { translate: tr } = useTranslation();
  const [dashboardUser, setDashboardUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [setupAvailable, setSetupAvailable] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupPasswordConfirmation, setSetupPasswordConfirmation] = useState('');

  useEffect(() => {
    fetch('/api/booking?view=owner-session')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Owner sign-in is unavailable.');
        setDashboardUser(data.authenticated ? data.user : null);
        setSetupAvailable(Boolean(data.setupAvailable));
        if (data.message) setError(data.message);
      })
      .catch((requestError) => setError(requestError.message || 'Unable to verify owner session.'))
      .finally(() => setIsCheckingSession(false));
  }, []);

  const signOut = async () => {
    try {
      const response = await fetch('/api/booking?view=owner-logout', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to sign out.');
      setDashboardUser(null);
      setChallengeId('');
      setOtpCode('');
      setEmail('');
      setPassword('');
      setError('');
      setSuccessMessage('');
      setSetupMode(false);
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign out.');
    }
  };

  if (dashboardUser) {
    return (
      <div>
        <div className="flex justify-end mb-2">
          <button
            onClick={signOut}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-900"
          >{tr("Sign out")}</button>
        </div>
        {React.cloneElement(children, { dashboardUser })}
      </div>
    );
  }

  if (isCheckingSession) {
    return (
      <div className="mx-auto my-16 max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-800" />
        <p className="text-sm font-medium text-slate-600">{tr("Verifying secure dashboard access…")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto my-14 max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
      <div className="bg-gradient-to-br from-slate-950 via-emerald-950 to-emerald-800 px-8 py-7 text-white">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
          <Building className="h-6 w-6" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">{tr("MY THAI THAI")}</p>
        <h1 className="mt-2 text-2xl font-bold">{setupMode ? tr("Set up owner account") : tr("Dashboard sign in")}</h1>
        <p className="mt-2 text-sm leading-6 text-emerald-50/80">{setupMode ? tr("Create the first owner account using the one-time setup key from your administrator.") : tr("Sign in with your account and verify using a code sent to your email.")}</p>
      </div>
      <form onSubmit={async (event) => {
        event.preventDefault();
        setIsSigningIn(true);
        setError('');
        setSuccessMessage('');
        try {
          const view = setupMode ? 'owner-setup' : challengeId ? 'owner-verify' : 'owner-login';
          const body = setupMode
            ? {
              name: setupName,
              email: setupEmail,
              setupSecret,
              password: setupPassword,
              confirmPassword: setupPasswordConfirmation,
            }
            : challengeId ? { challengeId, code: otpCode } : { email, password };
          const response = await fetch(`/api/booking?view=${view}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || 'Unable to sign in.');
          if (data.created) {
            setSetupAvailable(false);
            setSetupMode(false);
            setEmail(setupEmail);
            setSetupName('');
            setSetupEmail('');
            setSetupSecret('');
            setSetupPassword('');
            setSetupPasswordConfirmation('');
            setSuccessMessage(data.message);
          } else if (data.otpRequired) {
            setChallengeId(data.challengeId);
            setPassword('');
          } else {
            setDashboardUser(data.user);
            setPassword('');
            setOtpCode('');
          }
        } catch (requestError) {
          setError(requestError.message || 'Unable to sign in.');
        } finally {
          setIsSigningIn(false);
        }
      }} className="space-y-4 p-8">
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{tr(error)}</p>}
        {successMessage && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{tr(successMessage)}</p>}
        {setupMode ? <>
          <label htmlFor="owner-setup-name" className="block text-sm font-semibold text-slate-700">{tr("Owner name")}</label>
          <input id="owner-setup-name" value={setupName} onChange={(event) => setSetupName(event.target.value)} autoComplete="name" maxLength={120} required className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" placeholder={tr("Your name")} />
          <label htmlFor="owner-setup-email" className="block text-sm font-semibold text-slate-700">{tr("Owner email")}</label>
          <input id="owner-setup-email" type="email" value={setupEmail} onChange={(event) => setSetupEmail(event.target.value)} autoComplete="email" required className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" placeholder={tr("you@example.com")} />
          <label htmlFor="owner-setup-secret" className="block text-sm font-semibold text-slate-700">{tr("One-time setup key")}</label>
          <input id="owner-setup-secret" type="password" value={setupSecret} onChange={(event) => setSetupSecret(event.target.value)} autoComplete="off" required className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" />
          <label htmlFor="owner-setup-password" className="block text-sm font-semibold text-slate-700">{tr("Owner password (at least 16 characters)")}</label>
          <input id="owner-setup-password" type="password" value={setupPassword} onChange={(event) => setSetupPassword(event.target.value)} autoComplete="new-password" minLength={16} maxLength={1024} required className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" />
          <label htmlFor="owner-setup-password-confirmation" className="block text-sm font-semibold text-slate-700">{tr("Confirm owner password")}</label>
          <input id="owner-setup-password-confirmation" type="password" value={setupPasswordConfirmation} onChange={(event) => setSetupPasswordConfirmation(event.target.value)} autoComplete="new-password" minLength={16} maxLength={1024} required className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" />
        </> : !challengeId ? <>
          <label htmlFor="dashboard-email" className="block text-sm font-semibold text-slate-700">{tr("Email")}</label>
          <input id="dashboard-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" placeholder={tr("name@example.com")} />
          <label htmlFor="dashboard-password" className="block text-sm font-semibold text-slate-700">{tr("Password")}</label>
          <input id="dashboard-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" placeholder={tr("Enter your password")} />
        </> : <>
          <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{tr("A six-digit verification code was sent to")} {email}.</p>
          <label htmlFor="dashboard-otp" className="block text-sm font-semibold text-slate-700">{tr("Email verification code")}</label>
          <input id="dashboard-otp" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" required className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" placeholder="000000" />
          <button type="button" onClick={() => { setChallengeId(''); setOtpCode(''); setError(''); }} className="text-xs font-semibold text-emerald-800 underline">{tr("Back to email and password")}</button>
        </>}
        <button type="submit" disabled={isSigningIn} className="w-full rounded-xl bg-emerald-900 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-950/15 transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">
          {isSigningIn ? tr("Please wait…") : setupMode ? tr("Create owner account") : challengeId ? tr("Verify and sign in") : tr("Continue to email verification")}
        </button>
        {setupAvailable && !challengeId && (
          <button
            type="button"
            onClick={() => { setSetupMode(!setupMode); setError(''); setSuccessMessage(''); }}
            className="w-full text-center text-xs font-semibold text-emerald-800 underline"
          >
            {setupMode ? tr("Return to dashboard sign in") : tr("First time here? Set up the owner account")}
          </button>
        )}
        <p className="text-center text-xs leading-5 text-slate-500">{setupMode ? tr("Setup closes automatically after the first owner account is created.") : tr("Your secure session expires after 8 hours.")}</p>
      </form>
    </div>
  );
}

function CustomerPortal({ branches, services, therapists, sheetsWebhookUrl, onNewBooking, staffBooking = false }) {
  const [step, setStep] = useState(1);
  // Confirmation emails link to ?manage=1&ref=MTT-XXXXXX so customers land straight
  // on the cancel/reschedule form with their reference already filled in.
  const [manageDeepLink] = useState(() => {
    if (typeof window === 'undefined') return { open: false, ref: '' };
    const params = new URLSearchParams(window.location.search);
    return { open: params.get('manage') === '1', history: params.get('history') === '1', ref: params.get('ref') || '' };
  });
  const [portalMode, setPortalMode] = useState(manageDeepLink.history ? 'history' : manageDeepLink.open ? 'manage' : 'book');
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
  const [historyReference, setHistoryReference] = useState(manageDeepLink.ref);
  const [historyEmail, setHistoryEmail] = useState('');
  const [historyBooking, setHistoryBooking] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historySaved, setHistorySaved] = useState(false);
  const bookingIntakeRef = useRef(null);
  
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
    intake: emptyPatientHistory(),
    paymentOption: 'deposit', // 'deposit' (flat $10 now, balance at clinic) or 'full'
    hotStoneAddOn: false,
    skipPayment: false,
    confirmationCode: ''
  });

  useEffect(() => {
    if (portalMode !== 'history' && bookingIntakeRef.current) {
      const { intake, step: previousStep } = bookingIntakeRef.current;
      bookingIntakeRef.current = null;
      setBookingData((prev) => ({ ...prev, intake }));
      setStep(previousStep);
    }
  }, [portalMode]);

  // Keep the selected branch in sync if the owner updates or removes branches while this page is open.
  useEffect(() => {
    if (branches.length === 0) return;
    setBookingData((prev) => {
      const currentBranch = branches.find((branch) => branch.id === prev.branch?.id) || branches[0];
      return currentBranch === prev.branch ? prev : { ...prev, branch: currentBranch };
    });
  }, [branches]);


  const categories = useMemo(() => bookingCategories(services), [services]);
  useEffect(() => {
    if (!categories.includes(selectedCategory)) setSelectedCategory('All');
  }, [categories, selectedCategory]);

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

  const HOT_STONE_ADDON_PATTERN = /hot stone add-?on/i;

  // The Hot Stone add-on is offered as a checkbox alongside the main service rather
  // than as a bookable service of its own.
  const hotStoneAddOnService = useMemo(
    () => services.find((s) => HOT_STONE_ADDON_PATTERN.test(s.name || '')) || null,
    [services]
  );

  const filteredServices = useMemo(() => {
    const bookable = services.filter((s) => s.active !== false && !HOT_STONE_ADDON_PATTERN.test(s.name || ''));
    if (selectedCategory === 'All') return bookable;
    return bookable.filter(s => s.category === selectedCategory);
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

  const setAllConditions = (val) => {
    setBookingData(prev => ({
      ...prev,
      intake: {
        ...prev.intake,
        conditions: Object.fromEntries(INTAKE_CONDITIONS.map(([field]) => [field, val])),
      }
    }));
  };

  const paymentOptions = branchPaymentOptions(bookingData.branch);
  const paymentSkipped = (staffBooking && bookingData.skipPayment) || bookingData.paymentOption === 'clinic';
  useEffect(() => {
    if (!paymentOptions[bookingData.paymentOption]) {
      const next = ['deposit', 'full', 'clinic'].find((option) => paymentOptions[option]);
      if (next) setBookingData((prev) => ({ ...prev, paymentOption: next }));
    }
  }, [paymentOptions.clinic, paymentOptions.deposit, paymentOptions.full, bookingData.paymentOption]);

  const calculateFinancials = () => {
    const empty = {
      base: 0, hotStoneBase: 0, hotStoneDiscountAmount: 0, platinumSurcharge: 0,
      discountPercent: 0, discountAmount: 0, tax: 0, total: 0, deposit: 0, balanceDue: 0,
    };
    if (!bookingData.service) return empty;
    // The eligibility endpoint reports the plan as `membershipType`.
    const plan = membershipBenefit?.membershipType;
    const base = bookingData.service.price;
    const hotStoneBase = bookingData.hotStoneAddOn && hotStoneAddOnService ? hotStoneAddOnService.price : 0;

    const serviceDiscount = Math.round(base * (membershipBenefit?.discountPercent || 0)) / 100;

    let hotStoneDiscountAmount = 0;
    if (hotStoneBase > 0) {
      if (plan === 'gold' && membershipBenefit.freeHotStoneAvailable) {
        hotStoneDiscountAmount = hotStoneBase;
      } else if (plan === 'platinum') {
        hotStoneDiscountAmount = Math.min(hotStoneBase, Number(membershipBenefit.hotStoneDiscount) || 0);
      } else {
        hotStoneDiscountAmount = Math.round(hotStoneBase * (membershipBenefit?.discountPercent || 0)) / 100;
      }
    }

    // Platinum members pay a configurable premium when they add Hot Stone.
    const platinumSurcharge = plan === 'platinum' && hotStoneBase > 0
      ? Number(membershipBenefit.hotStoneSurcharge) || 0
      : 0;

    const grossBase = base + hotStoneBase;
    const discountAmount = serviceDiscount + hotStoneDiscountAmount;
    const discountPercent = grossBase > 0 ? discountAmount * 100 / grossBase : 0;
    const discountedBase = grossBase - discountAmount + platinumSurcharge;
    const tax = discountedBase * (bookingData.service.taxRate || 0);
    const total = discountedBase + tax;
    const deposit = paymentSkipped
      ? 0
      : bookingData.paymentOption === 'full'
        ? total
        : Math.min(BOOKING_DEPOSIT_AMOUNT, total);
    const balanceDue = Math.max(0, total - deposit);
    return {
      base, hotStoneBase, hotStoneDiscountAmount, platinumSurcharge,
      discountPercent, discountAmount, tax, total, deposit, balanceDue,
    };
  };

  const financials = calculateFinancials();

  const medicalHistorySkipped = bookingData.intake.historyMode === 'skip';
  const historyComplete = bookingData.intake.preCollectionConsent && bookingData.intake.consent
    && bookingData.intake.signature.trim() && bookingData.intake.signatureDate;
  const findHistoryBooking = async (event) => {
    event.preventDefault();
    setHistoryLoading(true);
    setHistoryError('');
    setHistorySaved(false);
    setHistoryBooking(null);
    try {
      const response = await fetch(`/api/booking?view=find-booking&bookingId=${encodeURIComponent(historyReference.trim())}&email=${encodeURIComponent(historyEmail.trim())}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to find the booking.');
      if (['Cancelled', 'No Show'].includes(data.booking.status)) throw new Error('Medical history cannot be submitted for a cancelled or no-show appointment.');
      setHistoryBooking(data.booking);
      if (!bookingIntakeRef.current) bookingIntakeRef.current = { intake: bookingData.intake, step };
      setBookingData((prev) => ({
        ...prev, intake: emptyPatientHistory(),
      }));
      setStep(3);
    } catch (error) {
      setHistoryError(error.message || 'Unable to find the booking.');
    } finally {
      setHistoryLoading(false);
    }
  };
  const submitHistory = async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await fetch('/api/booking?view=submit-patient-history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: historyBooking.id, email: historyBooking.email, patientHistory: bookingData.intake }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Medical history could not be saved.');
      setHistorySaved(true);
    } catch (error) {
      setHistoryError(error.message || 'Medical history could not be saved.');
    } finally {
      setHistoryLoading(false);
    }
  };

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
    const hotStoneSelected = bookingData.hotStoneAddOn && hotStoneAddOnService;
    // The add-on needs its own chair time, so it extends the calendar block.
    const bookingDurationMinutes = bookingData.service.duration + (hotStoneSelected ? hotStoneAddOnService.duration : 0);
    const bookingServiceName = hotStoneSelected
      ? `${bookingData.service.name} + ${hotStoneAddOnService.name}`
      : bookingData.service.name;

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
      subtotalAmount: (financials.base + financials.hotStoneBase + financials.platinumSurcharge).toFixed(2),
      serviceSubtotalAmount: financials.base.toFixed(2),
      hotStoneSubtotalAmount: financials.hotStoneBase.toFixed(2),
      platinumSurchargeAmount: financials.platinumSurcharge.toFixed(2),
      taxRate: bookingData.service.taxRate || 0,
      expectedDiscountPercent: financials.discountPercent,
      branchName: bookingData.branch.name,
      serviceName: bookingServiceName,
      therapistName: bookingData.therapist?.name || 'Any Available',
      therapistName2: isCoupleService ? (bookingData.therapist2?.name || 'Any Available') : undefined,
      therapistCandidates: branchTherapists.map((therapist) => therapist.name),
      date: bookingData.date,
      time: bookingData.time,
      durationMinutes: bookingDurationMinutes,
      branchAddress: `${bookingData.branch.address}, ${bookingData.branch.city}`,
      intakeNotes: [
        !medicalHistorySkipped ? `Pressure: ${bookingData.intake.pressure}` : '',
        !medicalHistorySkipped && bookingData.intake.focusAreas ? `Focus areas: ${bookingData.intake.focusAreas}` : '',
        !medicalHistorySkipped && bookingData.intake.injuries ? `Injuries: ${bookingData.intake.injuries}` : '',
        isCoupleService && bookingData.guestTwoName.trim() ? `Guest 2: ${bookingData.guestTwoName.trim()}` : '',
      ].filter(Boolean).join('; '),
      skipPatientHistory: medicalHistorySkipped,
      patientHistory: medicalHistorySkipped ? null : {
        ...bookingData.intake,
        conditions: bookingData.intake.conditions,
        signatureDate: bookingData.intake.signatureDate || new Date().toISOString().split('T')[0],
        bodyAreas: bookingData.intake.bodyAreas.join(', '),
        reuseExisting: bookingData.intake.historyMode === 'reuse',
        preCollectionConsent: bookingData.intake.preCollectionConsent,
        consentTimestamp: bookingData.intake.consentTimestamp,
      },
      paymentOption: paymentSkipped ? 'clinic' : bookingData.paymentOption,
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
      serviceName: bookingServiceName,
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
    <div className="mx-auto my-0 max-w-6xl overflow-hidden bg-white sm:my-6 sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-sm">
      {/* Clinic Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-emerald-950 to-emerald-800 px-4 py-5 text-white sm:px-8 sm:py-8">
        <div aria-hidden="true" className="absolute -right-16 -top-28 h-72 w-72 rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute -right-2 -top-14 h-48 w-48 rounded-full border border-white/10" />
        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <BusinessPhoto businessName={businessName} photoUrl={photoUrl} className="h-11 w-11 shrink-0 rounded-xl object-cover shadow-md" />
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{businessName}</h1>
            </div>
            <p className="mt-2 text-sm text-emerald-50/75">Thai Massage & Wellness · Ontario, Canada</p>
            {brandingError && <p role="status" className="mt-2 text-xs text-amber-200">{brandingError}</p>}
          </div>

          <div className="grid grid-cols-2 items-stretch gap-2 text-xs sm:flex sm:flex-wrap sm:justify-end">
            <a href="tel:+14378987424" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-2 py-2 text-center text-emerald-50 transition hover:bg-white/15 sm:px-3">
              <Phone className="mr-1.5 h-3.5 w-3.5 text-emerald-200" />
              <span className="break-words">+1 437 898 7424</span>
            </a>
            <a href="https://Mythaithaimassage.com" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-2 py-2 text-center text-emerald-50 transition hover:bg-white/15 sm:px-3">
              <Globe className="mr-1.5 h-3.5 w-3.5 text-emerald-200" />
              <span className="break-all sm:break-normal">Mythaithaimassage.com</span>
            </a>
            <button
              type="button"
              onClick={() => setPortalMode(portalMode === 'manage' ? 'book' : 'manage')}
              className="col-span-2 min-h-11 rounded-xl bg-white px-3 py-2 font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-50 sm:col-span-1"
            >
              <span className="sm:hidden">{portalMode === 'manage' ? '← Back to booking' : 'Manage booking'}</span>
              <span className="hidden sm:inline">{portalMode === 'manage' ? '← Back to booking' : 'Manage an existing booking (reschedule or cancel)'}</span>
            </button>
            <button
              type="button"
              onClick={() => { setPortalMode('history'); setHistoryBooking(null); setHistoryError(''); setHistorySaved(false); }}
              className="col-span-2 min-h-11 rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-bold text-white hover:bg-white/20 sm:col-span-1"
            >
              Medical history only
            </button>
          </div>
        </div>
      </div>

      {portalMode === 'manage' ? (
        <ManageBookingPanel onBack={() => setPortalMode('book')} initialBookingId={manageDeepLink.ref} />
      ) : (
      <>
      {portalMode === 'history' && (
        <div className="space-y-4 p-4 sm:p-5">
          <h2 className="text-xl font-bold">Medical history for an existing appointment</h2>
          <p className="text-sm text-stone-600">Use your booking reference and the email used at booking. This does not create an appointment or collect payment.</p>
          <button type="button" onClick={() => { setPortalMode('book'); setStep(1); }} className="text-sm text-emerald-800 underline">Back to booking</button>
          <form onSubmit={findHistoryBooking} className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold">Booking reference
              <input required value={historyReference} onChange={(e) => { setHistoryReference(e.target.value); setHistoryBooking(null); setHistorySaved(false); }} placeholder="MTT-123456" className="mt-1 w-full p-3 rounded-xl border border-stone-300" />
            </label>
            <label className="text-xs font-bold">Booking email
              <input required type="email" value={historyEmail} onChange={(e) => { setHistoryEmail(e.target.value); setHistoryBooking(null); setHistorySaved(false); }} className="mt-1 w-full p-3 rounded-xl border border-stone-300" />
            </label>
            <button disabled={historyLoading} className="self-end p-3 rounded-xl bg-emerald-800 text-white font-bold disabled:opacity-50">{historyLoading ? 'Loading...' : 'Find appointment'}</button>
          </form>
          {historyBooking && <p className="text-sm text-emerald-900">Appointment {historyBooking.id}: {historyBooking.customerName}, {historyBooking.date} at {historyBooking.time}</p>}
          {historyError && <p role="alert" className="text-sm text-red-700">{historyError}</p>}
          {historySaved && <p role="status" className="p-4 rounded-xl bg-emerald-50 text-emerald-900">Medical history saved to your appointment. No new booking or payment was created.</p>}
        </div>
      )}
      {/* 5-Step Progress Stepper */}
      {portalMode === 'book' && <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-8">
        <div className="flex items-center justify-between text-xs sm:text-sm font-medium">
          {[
            { num: 1, label: "Branch & Service" },
            { num: 2, label: "Therapist & Time" },
            { num: 3, label: "Your Info" },
            { num: 4, label: "Payment & Review" },
            { num: 5, label: "Confirmed" }
          ].map((s) => (
            <div key={s.num} className={`flex min-w-0 items-center gap-1.5 ${step === s.num ? 'font-bold text-slate-950' : step > s.num ? 'text-emerald-800' : 'text-slate-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === s.num 
                  ? 'bg-emerald-950 text-white ring-2 ring-emerald-100'
                  : step > s.num 
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
              </span>
              <span className={`${step === s.num ? 'inline' : 'hidden'} truncate text-[10px] sm:text-xs md:inline`}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>}

      <div className="bg-[#f1f3f7] p-3 sm:p-8">
        {/* STEP 1: Branch & Service */}
        {portalMode === 'book' && step === 1 && (
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
              <div className="grid gap-3 sm:grid-cols-2 sm:max-h-[420px] sm:overflow-y-auto sm:pr-1">
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
                        <span className="text-stone-400 text-[11px]">Payment options at checkout</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {hotStoneAddOnService && bookingData.service && (
              <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bookingData.hotStoneAddOn}
                  onChange={(e) => setBookingData(prev => ({ ...prev, hotStoneAddOn: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 accent-amber-700"
                />
                <span className="text-sm">
                  <span className="font-bold text-stone-900">Add {hotStoneAddOnService.name} — +${hotStoneAddOnService.price}</span>
                  <span className="block text-xs text-stone-600 mt-0.5">
                    {hotStoneAddOnService.description} Adds {hotStoneAddOnService.duration} minutes to your appointment.
                  </span>
                </span>
              </label>
            )}

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
        {portalMode === 'book' && step === 2 && (
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
        {((portalMode === 'book' && step === 3) || (portalMode === 'history' && historyBooking && !historySaved)) && (
          <div className="space-y-6">
            {portalMode === 'book' && (
              <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <input type="checkbox" checked={medicalHistorySkipped} onChange={(e) => updateIntake('historyMode', e.target.checked ? 'skip' : 'new')} className="mt-1" />
                <span><strong>Skip medical history for now</strong><br />You must complete it before treatment. After booking, use “Medical history only” with your booking reference and email, or complete it at the clinic.</span>
              </label>
            )}
            {!medicalHistorySkipped && !bookingData.intake.preCollectionConsent && (
              <div className="p-5 rounded-2xl bg-blue-50 border border-blue-200 space-y-4 max-h-[70vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-blue-950 text-center">Consent and Waiver Form</h2>
                <p className="text-xs text-blue-900">Read our <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Privacy Policy (opens in a new tab)</a> for how we handle booking details and medical history.</p>
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
                    onChange={(event) => setBookingData((prev) => ({ ...prev, intake: { ...prev.intake, preCollectionConsent: event.target.checked, consentTimestamp: event.target.checked ? new Date().toISOString() : '' } }))}
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
            {(medicalHistorySkipped || bookingData.intake.preCollectionConsent) && <>
            {portalMode === 'book' && <div>
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
                    onBlur={checkMembershipEligibility}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                  {membershipBenefit ? (
                    <div className="mt-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                      <p className="text-sm font-bold text-emerald-900 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" />
                        You have an eligible {membershipBenefit.membershipType === 'platinum' ? 'Platinum' : membershipBenefit.membershipType === 'gold' ? 'Gold' : 'Silver'} plan — {membershipBenefit.discountPercent}% discount
                      </p>
                      <p className="text-xs text-emerald-800 mt-1">{membershipCheckMessage} It is applied automatically to your total.</p>
                    </div>
                  ) : membershipCheckMessage ? (
                    <p className="mt-2 text-xs text-stone-500">{membershipCheckMessage}</p>
                  ) : null}
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
            </div>}

            {!medicalHistorySkipped && <div className="pt-4 border-t border-stone-200">
              <h2 className="text-xl font-bold text-stone-900 mb-1">Patient Health History</h2>
              <p className="text-xs text-stone-500 mb-4">Please complete this confidential form so we can provide treatment safely.</p>
              {portalMode === 'book' && <button
                type="button"
                onClick={() => setShowExistingPatientChoice(true)}
                className="w-full text-left p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 hover:bg-blue-100"
              >
                <strong>Returning patient?</strong> Click here to choose whether to reuse your previous profile or review and update your medical information.
              </button>}

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
                  <div className="bg-stone-100 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-stone-700">Please indicate whether any of these apply</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Select all</span>
                      <button
                        type="button"
                        onClick={() => setAllConditions('No')}
                        className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-700 transition hover:bg-stone-50"
                      >
                        No
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllConditions('')}
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-stone-500 underline transition hover:text-stone-700"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {INTAKE_CONDITIONS.map(([field, label]) => (
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
                  <BodyAreaMap value={bookingData.intake.bodyAreas} gender={bookingData.intake.gender} onChange={(areas) => updateIntake('bodyAreas', areas)} />
                </div>
                <div className="border-t border-stone-200 pt-4">
                  <label className="block text-xs font-bold text-stone-700 mb-2">Preferred Pressure Level</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Light', 'Medium', 'Firm'].map(p => (
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
            </div>}

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => portalMode === 'history' ? setHistoryBooking(null) : setStep(2)}
                className="px-5 py-2.5 border border-stone-300 font-semibold rounded-xl text-stone-600 hover:bg-stone-100 transition"
              >
                Back
              </button>
              <button
                type="button"
                disabled={historyLoading || (portalMode === 'history' ? !historyComplete : !bookingData.customer.firstName || !bookingData.customer.lastName || !bookingData.customer.email || !bookingData.customer.phone || (isCoupleService && !bookingData.guestTwoName.trim()) || (!medicalHistorySkipped && bookingData.intake.historyMode !== 'reuse' && !historyComplete))}
                onClick={() => portalMode === 'history' ? submitHistory() : setStep(4)}
                className="px-6 py-2.5 bg-emerald-800 text-white font-semibold rounded-xl hover:bg-emerald-900 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm flex items-center"
              >
                {portalMode === 'history' ? (historyLoading ? 'Saving...' : 'Save medical history') : 'Review Payment & Finalize'} <ChevronRight className="w-4 h-4 ml-1" />
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
        {portalMode === 'book' && step === 4 && (
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
                  {financials.hotStoneBase > 0 && (
                    <div className="flex justify-between">
                      <span>{hotStoneAddOnService?.name}:</span>
                      <span className="font-semibold text-stone-800">${financials.hotStoneBase.toFixed(2)}</span>
                    </div>
                  )}
                  {financials.platinumSurcharge > 0 && (
                    <div className="flex justify-between">
                      <span>Platinum Hot Stone surcharge:</span>
                      <span className="font-semibold text-stone-800">${financials.platinumSurcharge.toFixed(2)}</span>
                    </div>
                  )}
                  {financials.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Membership discount ({financials.discountPercent.toFixed(0)}%):</span>
                      <span className="font-semibold">−${financials.discountAmount.toFixed(2)}</span>
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

              {staffBooking && (
                <label className="mb-3 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bookingData.skipPayment}
                    onChange={(e) => updateBooking('skipPayment', e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-sky-700"
                  />
                  <span className="text-xs text-sky-900">
                    <span className="font-bold block">Staff: skip payment and confirm the booking</span>
                    No deposit is collected online. The full ${financials.total.toFixed(2)} is settled at the clinic.
                  </span>
                </label>
              )}

              {staffBooking && bookingData.skipPayment ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-900">
                  Payment skipped — ${financials.total.toFixed(2)} is due at the clinic.
                </div>
              ) : (
              <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Payment options">
                {paymentOptions.clinic && <button
                  type="button"
                  aria-pressed={bookingData.paymentOption === 'clinic'}
                  onClick={() => updateBooking('paymentOption', 'clinic')}
                  className={`p-4 rounded-xl border text-left transition ${bookingData.paymentOption === 'clinic' ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20' : 'border-stone-200 hover:border-emerald-300'}`}
                >
                  <div className="font-bold text-stone-900 text-sm">Pay at the clinic</div>
                  <p className="text-xs text-stone-500 mt-1">No online deposit required</p>
                  <div className="mt-3 text-xs font-bold text-emerald-800">$0.00 Online Due</div>
                  <div className="text-[11px] text-stone-500 mt-1">${financials.total.toFixed(2)} due at clinic</div>
                </button>}
                {paymentOptions.deposit && <button
                  type="button"
                  aria-pressed={bookingData.paymentOption === 'deposit'}
                  onClick={() => updateBooking('paymentOption', 'deposit')}
                  className={`p-4 rounded-xl border text-left transition ${
                    bookingData.paymentOption === 'deposit'
                      ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20'
                      : 'border-stone-200 hover:border-emerald-300'
                  }`}
                >
                  <div className="font-bold text-stone-900 text-sm">Pay ${BOOKING_DEPOSIT_AMOUNT} deposit</div>
                  <p className="text-xs text-stone-500 mt-1">Confirm your slot online, pay the rest at the clinic</p>
                  <div className="mt-3 text-xs font-bold text-emerald-800">
                    ${Math.min(BOOKING_DEPOSIT_AMOUNT, financials.total).toFixed(2)} Online Due
                  </div>
                  <div className="text-[11px] text-stone-500 mt-1">
                    ${Math.max(0, financials.total - Math.min(BOOKING_DEPOSIT_AMOUNT, financials.total)).toFixed(2)} due at clinic
                  </div>
                </button>}

                {paymentOptions.full && <button
                  type="button"
                  aria-pressed={bookingData.paymentOption === 'full'}
                  onClick={() => updateBooking('paymentOption', 'full')}
                  className={`p-4 rounded-xl border text-left transition ${
                    bookingData.paymentOption === 'full'
                      ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20'
                      : 'border-stone-200 hover:border-emerald-300'
                  }`}
                >
                  <div className="font-bold text-stone-900 text-sm">Pay full amount online</div>
                  <p className="text-xs text-stone-500 mt-1">Pay 100% online in advance, nothing due at the clinic</p>
                  <div className="mt-3 text-xs font-bold text-emerald-800">
                    ${financials.total.toFixed(2)} Online Due
                  </div>
                </button>}
              </div>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">Cancellation policy:</span>{' '}
                {paymentSkipped
                  ? 'Cancel at least 24 hours before your appointment. Cancelling within 24 hours may incur a fee. Rescheduling is always free.'
                  : `You are paying $${financials.deposit.toFixed(2)} online today. Cancel at least 24 hours before your appointment for a full refund of that payment. Cancelling within 24 hours does not qualify for a refund. Rescheduling never issues a refund, regardless of timing.`}{' '}
                A cancel/reschedule link is included in your confirmation email, or use the "Manage an existing booking" link above.
              </span>
            </div>

            <p className="text-xs text-stone-600">
              Please read our <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-800 underline">Terms of Service (opens in a new tab)</a> and <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-800 underline">Privacy Policy (opens in a new tab)</a> before submitting your booking.
            </p>

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
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving & Syncing to the database...
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
        {portalMode === 'book' && step === 5 && (
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
                <span>Saved to the database, Google Calendar, and confirmation email sent</span>
              </div>
            )}
            {sheetsSyncStatus === 'not_configured' && (
              <div className="inline-flex items-center space-x-2 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-1.5 rounded-full text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Saved locally. Database and Calendar sync is not configured.</span>
              </div>
            )}
            {sheetsSyncStatus === 'failed' && (
              <div className="inline-flex flex-col items-center space-y-1 bg-red-50 border border-red-300 text-red-800 px-4 py-2 rounded-xl text-xs">
                <span className="font-semibold">Saved locally, but database and Calendar sync failed.</span>
                {sheetsSyncReason && <span>{sheetsSyncReason}</span>}
              </div>
            )}
            {sheetsSyncStatus === 'email_failed' && (
              <div className="inline-flex flex-col items-center space-y-1 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2 rounded-xl text-xs">
                <span className="font-semibold">Saved to the database and Calendar, but confirmation email failed.</span>
                {sheetsSyncReason && <span>{sheetsSyncReason}</span>}
              </div>
            )}
            {sheetsSyncStatus === 'patient_history_failed' && (
              <div className="inline-flex flex-col items-center space-y-1 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2 rounded-xl text-xs">
                <span className="font-semibold">Saved to the database and Calendar, but patient history could not be saved.</span>
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

            {squareEnabled && !paymentSkipped && sheetsSyncStatus !== 'failed' && (
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

            {medicalHistorySkipped && (
              <div role="status" className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Medical history still needs to be completed before treatment.
                <button type="button" onClick={() => {
                  setHistoryReference(bookingData.confirmationCode);
                  setHistoryEmail(bookingData.customer.email);
                  setHistoryBooking(null);
                  setHistorySaved(false);
                  setHistoryError('');
                  setPortalMode('history');
                }} className="mt-2 block font-bold underline">Complete medical history now</button>
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
                    intake: emptyPatientHistory(),
                    paymentOption: 'deposit',
                    hotStoneAddOn: false,
                    skipPayment: false,
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
      </>
      )}
    </div>
  );
}

function ManageBookingPanel({ onBack, initialBookingId = '' }) {
  const [bookingId, setBookingId] = useState(initialBookingId);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(null);
  const [hoursUntilAppointment, setHoursUntilAppointment] = useState(null);
  const [refundEligible, setRefundEligible] = useState(false);
  const [actionResult, setActionResult] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  const findBooking = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setBooking(null);
    setActionResult(null);
    try {
      const response = await fetch(`/api/booking?view=find-booking&bookingId=${encodeURIComponent(bookingId.trim())}&email=${encodeURIComponent(email.trim())}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.message || 'We could not find that booking.');
        return;
      }
      setBooking(data.booking);
      setHoursUntilAppointment(data.hoursUntilAppointment);
      setRefundEligible(data.refundEligible);
    } catch {
      setError('Something went wrong looking up your booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async () => {
    if (!window.confirm(refundEligible
      ? 'Cancel this appointment? Since it is more than 24 hours away, any payment made will be refunded.'
      : 'Cancel this appointment? It is less than 24 hours away, so no refund will be issued.')) {
      return;
    }
    setActionLoading(true);
    setActionResult(null);
    try {
      const response = await fetch('/api/booking?view=cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setActionResult({ type: 'error', message: data?.message || 'Cancellation failed.' });
        return;
      }
      setActionResult({ type: 'success', message: data.refundIssued ? `Cancelled. $${Number(data.refundAmount || 0).toFixed(2)} was refunded to your original payment method.` : (data.refundEligible ? 'Cancelled. A refund is owed and the clinic will process it manually.' : 'Cancelled. No refund is issued for cancellations within 24 hours of the appointment.') });
      setBooking((prev) => prev && { ...prev, status: 'Cancelled' });
    } catch {
      setActionResult({ type: 'error', message: 'Something went wrong cancelling your booking. Please try again or call the clinic.' });
    } finally {
      setActionLoading(false);
    }
  };

  const rescheduleBooking = async (e) => {
    e.preventDefault();
    if (!newDate || !newTime) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const response = await fetch('/api/booking?view=reschedule-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, email, date: newDate, time: newTime }),
      });
      const data = await response.json();
      if (!response.ok) {
        setActionResult({ type: 'error', message: data?.message || 'Reschedule failed.' });
        return;
      }
      setActionResult({ type: 'success', message: `Rescheduled to ${data.date} at ${data.time}. No refund is issued for reschedules; your existing payment carries over.` });
      setBooking((prev) => prev && { ...prev, date: data.date, time: data.time });
      setShowRescheduleForm(false);
    } catch {
      setActionResult({ type: 'error', message: 'Something went wrong rescheduling your booking. Please try again or call the clinic.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-xl mx-auto space-y-5">
      <h2 className="text-xl font-bold text-stone-900">Manage your booking</h2>
      <p className="text-xs text-stone-500">Enter your booking reference (e.g. MTT-123456) and the email you used when booking.</p>

      <form onSubmit={findBooking} className="grid gap-3 sm:grid-cols-2">
        <input
          value={bookingId}
          onChange={(e) => setBookingId(e.target.value)}
          placeholder="Booking reference (MTT-XXXXXX)"
          required
          className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email used at booking"
          type="email"
          required
          className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="sm:col-span-2 px-5 py-2.5 bg-emerald-800 text-white font-semibold rounded-xl hover:bg-emerald-900 transition disabled:opacity-50"
        >
          {loading ? 'Looking up booking…' : 'Find my booking'}
        </button>
      </form>

      {error && <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

      {booking && (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-stone-900 flex items-center gap-1.5">
                {booking.serviceName}
                {booking.isCouple && <Users className="w-4 h-4 text-rose-500" aria-label="Couple massage" />}
              </div>
              <div className="text-xs text-stone-500">{booking.branchName} • {booking.date} at {booking.time}</div>
            </div>
            {booking.status === 'Cancelled' && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-red-700 bg-red-100 px-2 py-1 rounded-full">Cancelled</span>
            )}
          </div>

          {booking.status !== 'Cancelled' && (
            <p className="text-xs text-stone-600">
              {refundEligible
                ? 'This appointment is more than 24 hours away — cancelling now qualifies for a refund of any payment made.'
                : 'This appointment is less than 24 hours away — cancelling now will not include a refund. Rescheduling never issues a refund.'}
            </p>
          )}

          {actionResult && (
            <p className={`text-xs rounded-xl p-3 border ${actionResult.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {actionResult.message}
            </p>
          )}

          {booking.status !== 'Cancelled' && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={actionLoading}
                onClick={cancelBooking}
                className="px-4 py-2 border border-red-300 text-red-700 font-semibold rounded-xl hover:bg-red-50 transition disabled:opacity-50 text-xs"
              >
                Cancel appointment
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setShowRescheduleForm((v) => !v)}
                className="px-4 py-2 border border-stone-300 text-stone-700 font-semibold rounded-xl hover:bg-stone-100 transition disabled:opacity-50 text-xs"
              >
                Reschedule
              </button>
            </div>
          )}

          {showRescheduleForm && booking.status !== 'Cancelled' && (
            <form onSubmit={rescheduleBooking} className="grid gap-2 sm:grid-cols-3 pt-2 border-t border-stone-200">
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required className="rounded-xl border border-stone-300 px-3 py-2 text-xs" />
              <input type="text" value={newTime} onChange={(e) => setNewTime(e.target.value)} placeholder="e.g. 2:30 PM" required className="rounded-xl border border-stone-300 px-3 py-2 text-xs" />
              <button type="submit" disabled={actionLoading} className="px-3 py-2 bg-emerald-800 text-white font-semibold rounded-xl hover:bg-emerald-900 transition disabled:opacity-50 text-xs">
                {actionLoading ? 'Saving…' : 'Confirm new time'}
              </button>
            </form>
          )}
        </div>
      )}

      <button type="button" onClick={onBack} className="text-xs font-semibold text-stone-500 underline underline-offset-2 hover:text-stone-800">
        ← Back to booking
      </button>
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
  setLang,
  onNavigateToBookingPortal,
  dashboardUser,
}) {
  const { translate: tr, locale, formatTime } = useTranslation();
  const [activeTab, setActiveTab] = useState('schedule');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dashboardUsers, setDashboardUsers] = useState([]);
  const [dashboardUserError, setDashboardUserError] = useState('');
  const [dashboardUserMessage, setDashboardUserMessage] = useState('');
  const [savingDashboardUser, setSavingDashboardUser] = useState(false);
  const [newDashboardUser, setNewDashboardUser] = useState({
    name: '', email: '', password: '', role: 'branch_manager', branchIds: [],
  });
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
  const [manualReceiptDiscount, setManualReceiptDiscount] = useState('');
  const [confirmReceiptReconciliation, setConfirmReceiptReconciliation] = useState(false);
  const [therapistReassignTo, setTherapistReassignTo] = useState('');
  const [isReassigningTherapist, setIsReassigningTherapist] = useState(false);
  const [appointmentNotes, setAppointmentNotes] = useState([]);
  const [isLoadingAppointmentNotes, setIsLoadingAppointmentNotes] = useState(false);
  const [appointmentNotesError, setAppointmentNotesError] = useState('');
  const [newAppointmentNote, setNewAppointmentNote] = useState('');
  const [isSavingAppointmentNote, setIsSavingAppointmentNote] = useState(false);
  const [reportStartDate, setReportStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return date.toISOString().slice(0, 10);
  });
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [dailyReportDate, setDailyReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [dailyReportBranchId, setDailyReportBranchId] = useState('all');
  const [googleAdsReport, setGoogleAdsReport] = useState(null);
  const [isLoadingGoogleAds, setIsLoadingGoogleAds] = useState(false);
  const [googleAdsError, setGoogleAdsError] = useState('');
  const [googleReviews, setGoogleReviews] = useState(null);
  const [isLoadingGoogleReviews, setIsLoadingGoogleReviews] = useState(false);
  const [googleReviewsError, setGoogleReviewsError] = useState('');
  const [reviewRequestOpen, setReviewRequestOpen] = useState(false);
  const [reviewRequestData, setReviewRequestData] = useState(null);
  const [reviewRequestSelected, setReviewRequestSelected] = useState([]);
  const [isLoadingReviewRequests, setIsLoadingReviewRequests] = useState(false);
  const [isSendingReviewRequests, setIsSendingReviewRequests] = useState(false);
  const [reviewRequestError, setReviewRequestError] = useState('');
  const [reviewRequestResult, setReviewRequestResult] = useState('');
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
      platinum: { topUpPrice: 1500, includedHours: 50, discountPercent: 30, hotStoneDiscount: 10, hotStoneSurcharge: 5 },
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
  const [isLedgerResetOpen, setIsLedgerResetOpen] = useState(false);
  const [ledgerResetScope, setLedgerResetScope] = useState('member');
  const [ledgerResetEmail, setLedgerResetEmail] = useState('');
  const [ledgerResetConfirm, setLedgerResetConfirm] = useState('');
  const [isClearingLedger, setIsClearingLedger] = useState(false);
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
  const [campaignAudienceMode, setCampaignAudienceMode] = useState('assistant');
  const [campaignAudienceOptions, setCampaignAudienceOptions] = useState(null);
  const [campaignManualFilters, setCampaignManualFilters] = useState({
    membershipType: '',
    branch: '',
    service: '',
    weekday: '',
    recurring: false,
    days: '',
    limit: '',
    allOptedIn: false,
  });
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
  const [campaignHistory, setCampaignHistory] = useState([]);
  const [isLoadingCampaignHistory, setIsLoadingCampaignHistory] = useState(false);
  const [campaignHistoryError, setCampaignHistoryError] = useState('');
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
  const [calendarUnavailability, setCalendarUnavailability] = useState([]);
  const [calendarViewMode, setCalendarViewMode] = useState('daily');
  const [calendarSearch, setCalendarSearch] = useState('');
  const [calendarFiltersOpen, setCalendarFiltersOpen] = useState(false);
  const [calendarAutoRefresh, setCalendarAutoRefresh] = useState(true);
  const [calendarShowLegend, setCalendarShowLegend] = useState(true);
  const [quickBooking, setQuickBooking] = useState(null);
  const [quickBookingNotice, setQuickBookingNotice] = useState('');
  const calendarRequest = useRef<AbortController | null>(null);
  const [unavailabilityBlocks, setUnavailabilityBlocks] = useState([]);
  const [isLoadingUnavailability, setIsLoadingUnavailability] = useState(false);
  const [unavailabilityLoadError, setUnavailabilityLoadError] = useState('');
  const [unavailabilityForm, setUnavailabilityForm] = useState({ scope: 'business', branchName: '', therapistName: '', date: new Date().toISOString().slice(0, 10), startTime: '12:00', endTime: '13:00', reason: '' });
  const [isSavingUnavailability, setIsSavingUnavailability] = useState(false);
  const [unavailabilitySaveError, setUnavailabilitySaveError] = useState('');
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

  // Clear any half-made therapist choice when a different appointment is opened.
  useEffect(() => {
    setTherapistReassignTo('');
    setManualReceiptDiscount('');
    setConfirmReceiptReconciliation(false);
  }, [selectedCalendarEvent?.booking?.id]);

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

  const loadGoogleReviews = async () => {
    setIsLoadingGoogleReviews(true);
    setGoogleReviewsError('');
    try {
      const response = await fetch('/api/booking?view=google-reviews');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Google Reviews returned status ${response.status}`);
      setGoogleReviews(data);
    } catch (error) {
      setGoogleReviewsError(error.message || 'Unable to load Google reviews.');
    } finally {
      setIsLoadingGoogleReviews(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reviews') loadGoogleReviews();
  }, [activeTab]);

  const loadReviewRequests = async () => {
    setIsLoadingReviewRequests(true);
    setReviewRequestError('');
    setReviewRequestResult('');
    try {
      const response = await fetch('/api/booking?view=review-request-audience');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setReviewRequestData(data);
      setReviewRequestSelected((data.candidates || []).filter((c) => c.eligible).map((c) => c.email));
    } catch (error) {
      setReviewRequestError(error.message || 'Unable to load customers who have visited.');
    } finally {
      setIsLoadingReviewRequests(false);
    }
  };

  const openReviewRequests = () => {
    setReviewRequestOpen(true);
    loadReviewRequests();
  };

  const toggleReviewRequestRecipient = (email) => {
    setReviewRequestSelected((current) =>
      current.includes(email) ? current.filter((value) => value !== email) : [...current, email],
    );
  };

  const sendReviewRequests = async () => {
    if (!reviewRequestSelected.length) return;
    setIsSendingReviewRequests(true);
    setReviewRequestError('');
    setReviewRequestResult('');
    try {
      const response = await fetch('/api/booking?view=review-request-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: reviewRequestSelected }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      const summary = `Review request sent to ${data.sent} customer${data.sent === 1 ? '' : 's'}.` +
        (data.failed ? ` ${data.failed} failed to send.` : '') +
        (data.skipped ? ` ${data.skipped} skipped (unsubscribed or no longer eligible).` : '');
      await loadReviewRequests();
      setReviewRequestResult(summary);
    } catch (error) {
      setReviewRequestError(error.message || 'Unable to send review requests.');
    } finally {
      setIsSendingReviewRequests(false);
    }
  };

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
      setLoyaltyNotice(data.alreadyAwarded ? message("Points or prepaid hours were already recorded for this booking.") : message("{value0}{value1}{value2}", { value0: data.points ? message("{value0} points awarded to {value1}", { value0: data.points, value1: booking.customerName }) : message("{value0}'s visit recorded", { value0: booking.customerName }), value1: data.hoursUsed ? message("; {value0} prepaid hours used.", { value0: data.hoursUsed }) : '.', value2: data.balanceEmailSent === false ? message(" Balance email failed: {value0}", { value0: (data.balanceEmailError || message("check Gmail configuration.")) }) : message(" Loyalty balance email sent.") }));
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
      setLoyaltyNotice(message("{value0} points redeemed for ${value1} off and linked to booking {value2}. Remaining balance: {value3} points.{value4}", { value0: data.redeemedPoints.toLocaleString(locale), value1: Number(data.rewardValue).toFixed(2), value2: data.bookingId, value3: data.remainingPoints.toLocaleString(locale), value4: data.emailSent ? message(" Confirmation emailed; the receipt number will be linked and emailed when the receipt is issued.") : message(" Redemption saved, but confirmation email failed: {value0}", { value0: (data.emailError || message("check Gmail configuration.")) }) }));
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
      const platinumNextStep = data.member.membershipType === 'platinum' && !newLoyaltyMember.initialTopUpPaid ? message(" The company request is pending; use the member row to record the top-up after payment is confirmed.") : newLoyaltyMember.initialTopUpPaid ? message(" {value0} prepaid hours were added after confirming payment.", { value0: Number(data.hoursBalance).toFixed(2) }) : '';
      setLoyaltyNotice(message("{value0}{value1}", { value0: data.emailSent ? message("Membership saved and eligibility details emailed to {value0}.", { value0: data.member.email }) : message("Membership saved, but the email could not be sent: {value0}", { value0: (data.emailError || message("check Gmail configuration and retry.")) }), value1: platinumNextStep }));
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
      setLoyaltyNotice(message("Recorded ${value0} payment; {value1} prepaid hours added. New balance: {value2} hours.{value3}", { value0: Number(loyaltySettings.membershipPlans.platinum.topUpPrice).toFixed(2), value1: data.hoursAdded, value2: Number(data.hoursBalance).toFixed(2), value3: data.emailSent ? message(" Balance email sent.") : message(" Balance email failed: {value0}", { value0: (data.emailError || message("check Gmail configuration.")) }) }));
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
      setLoyaltyNotice(message("{value0} is now the primary owner/contact for {value1} — only they can top up the shared balance.", { value0: (member.name || member.email), value1: (member.organization || message("this company")) }));
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
      const emailStatus = data.emailFailures?.length ? message(" {value0} payment notification(s) failed.", { value0: data.emailFailures.length }) : message(" Payment confirmations emailed to {value0} member(s).", { value0: data.emailsSent });
      setLoyaltyNotice(message("Payment recorded through {value0} for {value1} member(s).{value2}", { value0: data.paidThrough, value1: data.updatedCount, value2: emailStatus }));
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
      setLoyaltyNotice(message("{value0} was removed from the loyalty program.{value1}", { value0: (memberPendingRemoval.name || memberPendingRemoval.email), value1: data.emailSent ? message(" Removal notice emailed.") : data.emailError ? message(" Removal notice failed: {value0}", { value0: data.emailError }) : '' }));
      setMemberPendingRemoval(null);
      await loadLoyaltyDashboard();
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to remove this member.');
    } finally {
      setIsRemovingLoyaltyEntry(false);
    }
  };

  const openLedgerReset = () => {
    setLedgerResetScope('member');
    setLedgerResetEmail('');
    setLedgerResetConfirm('');
    setLoyaltyError('');
    setLoyaltyNotice('');
    setIsLedgerResetOpen(true);
  };

  const clearLoyaltyLedger = async () => {
    setIsClearingLedger(true);
    setLoyaltyError('');
    setLoyaltyNotice('');
    try {
      const response = await fetch('/api/booking?view=loyalty-clear-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: ledgerResetScope,
          email: ledgerResetScope === 'member' ? ledgerResetEmail : '',
          confirm: ledgerResetScope === 'all' ? ledgerResetConfirm : '',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to clear the loyalty ledger.');
      setLoyaltyNotice(ledgerResetScope === 'all' ? message("Cleared all {value0} loyalty ledger entries. Every member's points and prepaid hours are now reset to zero.", { value0: data.clearedCount }) : message("Cleared {value0} ledger entr{value1} for {value2}. Their points and prepaid hours are now reset to zero.", { value0: data.clearedCount, value1: data.clearedCount === 1 ? message("y") : message("ies"), value2: data.email }));
      setIsLedgerResetOpen(false);
      setLedgerResetEmail('');
      setLedgerResetConfirm('');
      await loadLoyaltyDashboard();
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to clear the loyalty ledger.');
    } finally {
      setIsClearingLedger(false);
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
      setLoyaltyNotice(message("Removed {value0} member(s) from {value1}.{value2}{value3}", { value0: data.removedCount, value1: data.organization, value2: data.emailsSent ? message(" {value0} removal notice(s) emailed.", { value0: data.emailsSent }) : '', value3: data.emailsFailed ? message(" {value0} notice(s) failed.", { value0: data.emailsFailed }) : '' }));
      setCompanyPendingRemoval('');
      await loadLoyaltyDashboard();
    } catch (error) {
      setLoyaltyError(error.message || 'Unable to remove this company.');
    } finally {
      setIsRemovingLoyaltyEntry(false);
    }
  };

  // `kind` picks between the admin portal link (primary contact only) and the restricted
  // employee self-signup link that the primary contact can forward to their whole team.
  const copyCompanyPortalLink = async (member, kind = 'portal') => {
    setLoyaltyError('');
    setLoyaltyNotice('');
    setCopyingPortalFor(`${member.organization}:${kind}`);
    const label = kind === 'join' ? 'Employee signup link' : 'Company portal link';
    try {
      const response = await fetch('/api/booking?view=company-portal-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization: member.organization, companyId: member.companyId, companyContactEmail: member.companyContactEmail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to create a company portal link.');
      const url = kind === 'join' ? data.joinUrl : data.portalUrl;
      if (!url) throw new Error('Unable to create a company portal link.');
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      setLoyaltyNotice(navigator.clipboard?.writeText ? message("{value0} for {value1} copied to clipboard.", { value0: message(label), value1: member.organization }) : message("{value0} for {value1}: {value2}", { value0: message(label), value1: member.organization, value2: url }));
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

  const loadDashboardUsers = async () => {
    setDashboardUserError('');
    try {
      const response = await fetch('/api/booking?view=dashboard-users');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to load dashboard accounts.');
      setDashboardUsers(data.users || []);
    } catch (error) {
      setDashboardUserError(error.message || 'Unable to load dashboard accounts.');
    }
  };

  useEffect(() => {
    if (dashboardUser.role === 'owner' && activeTab === 'dashboard-users') loadDashboardUsers();
  }, [activeTab, dashboardUser.role]);

  const createDashboardUser = async (event) => {
    event.preventDefault();
    setSavingDashboardUser(true);
    setDashboardUserError('');
    setDashboardUserMessage('');
    try {
      const response = await fetch('/api/booking?view=dashboard-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDashboardUser),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to create dashboard account.');
      setDashboardUserMessage(message("Created {value0} access for {value1}. Share the initial password through a secure channel.", { value0: message(data.user.role.replaceAll('_', ' ')), value1: data.user.email }));
      setNewDashboardUser({ name: '', email: '', password: '', role: 'branch_manager', branchIds: [] });
      await loadDashboardUsers();
    } catch (error) {
      setDashboardUserError(error.message || 'Unable to create dashboard account.');
    } finally {
      setSavingDashboardUser(false);
    }
  };

  const updateDashboardUserStatus = async (account) => {
    const status = account.status === 'active' ? 'disabled' : 'active';
    if (status === 'disabled' && !window.confirm(tr("Disable dashboard access for {value0}?", { value0: account.email }))) return;
    setDashboardUserError('');
    try {
      const response = await fetch('/api/booking?view=dashboard-user-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to update dashboard account.');
      setDashboardUsers((current) => current.map((user) => user.id === account.id ? { ...user, status: data.status } : user));
    } catch (error) {
      setDashboardUserError(error.message || 'Unable to update dashboard account.');
    }
  };

  const t = TRANSLATIONS[lang];

  const assignedBranchIds = new Set((dashboardUser.branchIds || []).map(String));
  const effectiveSelectedBranchId = dashboardUser.role === 'owner' || selectedBranchId === 'all'
    || assignedBranchIds.has(String(selectedBranchId))
    ? selectedBranchId
    : 'all';
  useEffect(() => {
    if (dashboardUser.role !== 'owner' && selectedBranchId !== 'all' && !assignedBranchIds.has(String(selectedBranchId))) {
      setSelectedBranchId('all');
    }
  }, [dashboardUser.role, selectedBranchId, dashboardUser.branchIds]);
  const selectedBranchName = effectiveSelectedBranchId === 'all'
    ? ''
    : branches.find((branch) => String(branch.id) === String(effectiveSelectedBranchId))?.name || '';
  const dashboardBookings = useMemo(
    () => bookings.filter((booking) => !selectedBranchName || booking.branchName === selectedBranchName),
    [bookings, selectedBranchName],
  );
  const dashboardTherapists = useMemo(
    () => therapists.filter((therapist) => {
      if (therapist.active === false) return false;
      if (!selectedBranchName) return true;
      const branchId = String(effectiveSelectedBranchId);
      return (therapist.branches || []).some((id) => String(id) === branchId)
        || Object.values(therapist.schedule || {}).some((id) => String(id) === branchId);
    }),
    [therapists, effectiveSelectedBranchId, selectedBranchName],
  );
  const totalRevenue = useMemo(
    () => dashboardBookings.reduce((sum, booking) => sum + (Number(booking.total) || 0), 0),
    [dashboardBookings],
  );
  const hstCollected = useMemo(
    () => dashboardBookings.reduce((sum, booking) => sum + ((Number(booking.total) || 0) - ((Number(booking.total) || 0) / 1.13)), 0),
    [dashboardBookings],
  );

  const loadBookingsFromBackend = async () => {
    setIsLoadingBookings(true);
    setBookingLoadError('');
    try {
      const response = await fetch('/api/booking');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setBookings(data.bookings || []);
    } catch (error) {
      setBookingLoadError(error.message || 'Unable to load bookings from the database');
    } finally {
      setIsLoadingBookings(false);
    }
  };

  const [deletingBookingId, setDeletingBookingId] = useState('');
  const [deleteBookingError, setDeleteBookingError] = useState('');

  // Daily therapist hours / branch audit PDF reports — generated client-side from
  // already-loaded booking data (no extra API round trip needed).
  const getDailyReportBranchName = () => (dailyReportBranchId === 'all' ? '' : branches.find((branch) => String(branch.id) === String(dailyReportBranchId))?.name || '');

  const getDailyReportRows = (includeCancelled = false) => {
    const branchName = getDailyReportBranchName();
    return bookings.filter((booking) =>
      booking.date === dailyReportDate &&
      (includeCancelled || booking.status !== 'Cancelled') &&
      (!branchName || booking.branchName === branchName));
  };

  const downloadTherapistHoursPdf = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const rows = getDailyReportRows();
    const byTherapist = new Map();
    rows.forEach((booking) => {
      const name = booking.therapistName || 'Unassigned';
      if (!byTherapist.has(name)) byTherapist.set(name, { name, minutes: 0, count: 0, branches: new Set() });
      const entry = byTherapist.get(name);
      entry.minutes += Number(booking.durationMinutes) || 0;
      entry.count += 1;
      if (booking.branchName) entry.branches.add(booking.branchName);
    });
    const data = [...byTherapist.values()].sort((a, b) => b.minutes - a.minutes);
    const doc = new jsPDF();
    const title = businessProfile?.businessName || 'MY THAI THAI';
    doc.setFontSize(16);
    doc.text(`${title} - Daily Therapist Hours Report`, 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(`Date: ${dailyReportDate}${getDailyReportBranchName() ? ` · ${getDailyReportBranchName()}` : ' · All branches'}`, 14, 25);
    doc.text(`Generated: ${new Date().toLocaleString('en-CA')}`, 14, 30);
    autoTable(doc, {
      startY: 36,
      head: [['Therapist', 'Branch(es)', 'Appointments', 'Hours served']],
      body: data.map((entry) => [entry.name, [...entry.branches].join(', ') || '—', String(entry.count), (entry.minutes / 60).toFixed(2)]),
      foot: [['Total', '', String(data.reduce((sum, entry) => sum + entry.count, 0)), (data.reduce((sum, entry) => sum + entry.minutes, 0) / 60).toFixed(2)]],
      headStyles: { fillColor: [7, 61, 50] },
      footStyles: { fillColor: [230, 240, 237], textColor: 20, fontStyle: 'bold' },
      styles: { fontSize: 9 },
    });
    if (data.length === 0) {
      doc.setFontSize(11);
      doc.setTextColor(120);
      doc.text('No appointments recorded for this date.', 14, 44);
    }
    doc.save(`therapist-hours-${dailyReportDate}.pdf`);
  };

  const downloadBranchAuditPdf = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const rows = getDailyReportRows(true);
    const byBranch = new Map();
    rows.forEach((booking) => {
      const branch = booking.branchName || 'Unspecified branch';
      if (!byBranch.has(branch)) byBranch.set(branch, []);
      byBranch.get(branch).push(booking);
    });
    const doc = new jsPDF();
    const title = businessProfile?.businessName || 'MY THAI THAI';
    doc.setFontSize(16);
    doc.text(`${title} - Branch Audit Report`, 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(`Date: ${dailyReportDate}`, 14, 25);
    doc.text(`Generated: ${new Date().toLocaleString('en-CA')}`, 14, 30);
    let cursorY = 38;
    if (byBranch.size === 0) {
      doc.setFontSize(11);
      doc.setTextColor(120);
      doc.text('No appointments recorded for this date.', 14, cursorY);
    }
    [...byBranch.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([branchName, list]) => {
      if (cursorY > 250) { doc.addPage(); cursorY = 20; }
      doc.setFontSize(12);
      doc.setTextColor(20);
      doc.text(branchName, 14, cursorY);
      cursorY += 4;
      const byTherapist = new Map();
      list.forEach((booking) => {
        if (booking.status === 'Cancelled') return;
        const name = booking.therapistName || 'Unassigned';
        if (!byTherapist.has(name)) byTherapist.set(name, { name, minutes: 0, count: 0 });
        const entry = byTherapist.get(name);
        entry.minutes += Number(booking.durationMinutes) || 0;
        entry.count += 1;
      });
      autoTable(doc, {
        startY: cursorY,
        margin: { left: 14, right: 14 },
        head: [['Therapist', 'Appointments', 'Hours served']],
        body: [...byTherapist.values()].sort((a, b) => b.minutes - a.minutes).map((entry) => [entry.name, String(entry.count), (entry.minutes / 60).toFixed(2)]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [7, 61, 50] },
      });
      cursorY = doc.lastAutoTable.finalY + 6;
      autoTable(doc, {
        startY: cursorY,
        margin: { left: 14, right: 14 },
        head: [['Time', 'Therapist', 'Customer', 'Service', 'Duration', 'Status']],
        body: list.slice().sort((a, b) => (a.time || '').localeCompare(b.time || '')).map((booking) => [
          booking.time || '—',
          booking.therapistName || 'Unassigned',
          booking.customerName || '—',
          booking.serviceName || '—',
          `${Number(booking.durationMinutes) || 0} min`,
          booking.status || 'Booked',
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [51, 65, 85] },
      });
      cursorY = doc.lastAutoTable.finalY + 10;
    });
    doc.save(`branch-audit-${dailyReportDate}.pdf`);
  };

  const deleteBooking = async (bookingId) => {
    if (!confirm(tr("Permanently remove booking {value0} and its calendar event? This cannot be undone.", { value0: bookingId }))) return;
    setDeletingBookingId(bookingId);
    setDeleteBookingError('');
    try {
      const response = await fetch('/api/booking?view=delete-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setBookings((prev) => prev.filter((b) => b.id !== bookingId));
    } catch (error) {
      setDeleteBookingError(error.message || 'Unable to delete booking');
    } finally {
      setDeletingBookingId('');
    }
  };

  useEffect(() => {
    if (['schedule', 'reports'].includes(activeTab)) loadBookingsFromBackend();
    if (activeTab === 'marketing') {
      loadCampaignHistory();
      loadCampaignAudienceOptions();
    }
  }, [activeTab]);

  const issueReceipt = async (bookingId) => {
    setIsIssuingReceipt(true);
    setReceiptError('');
    setReceiptNotice('');
    try {
      const response = await fetch('/api/booking?view=issue-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, ...(!selectedCalendarEvent?.booking?.receiptNumber ? { manualDiscount: manualReceiptDiscount, confirmReconciliation: confirmReceiptReconciliation } : {}) }),
      });
      const data = await response.json();
      if (data.booking && data.receipt) {
        setSelectedCalendarEvent((current) => current ? { ...current, booking: { ...current.booking, ...data.booking, receiptNumber: data.receipt.number, receiptManualDiscount: data.receipt.manualDiscount } } : current);
        setBookings((current) => current.map((booking) => booking.id === bookingId ? { ...booking, ...data.booking } : booking));
      }
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setIssuedReceipt(data);
      setReceiptNotice(data.alreadyIssued ? message("Receipt {value0} was already emailed.", { value0: data.receipt.number }) : message("Receipt {value0} was emailed to {value1}.", { value0: data.receipt.number, value1: data.booking.email }));
      await Promise.all([loadCalendar(), loadBookingsFromBackend()]);
    } catch (error) {
      setReceiptError(error.message || 'Unable to issue receipt');
      await Promise.all([loadCalendar(), loadBookingsFromBackend()]);
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
      setReceiptNotice(data.alreadyPaid ? message("This appointment was already marked as paid.") : message("Payment of ${value0} recorded. You can now issue the receipt.", { value0: Number(data.booking.paidAmount).toFixed(2) }));
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

  const loadAppointmentNotes = async (bookingId) => {
    if (!bookingId) {
      setAppointmentNotes([]);
      return;
    }
    setIsLoadingAppointmentNotes(true);
    setAppointmentNotesError('');
    try {
      const response = await fetch(`/api/booking?view=appointment-notes&bookingId=${encodeURIComponent(bookingId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setAppointmentNotes(data.notes || []);
    } catch (error) {
      setAppointmentNotesError(error.message || 'Unable to load notes');
    } finally {
      setIsLoadingAppointmentNotes(false);
    }
  };

  useEffect(() => {
    setNewAppointmentNote('');
    setAppointmentNotesError('');
    loadAppointmentNotes(selectedCalendarEvent?.booking?.id);
  }, [selectedCalendarEvent?.booking?.id]);

  const addAppointmentNote = async () => {
    const bookingId = selectedCalendarEvent?.booking?.id;
    const note = newAppointmentNote.trim();
    if (!bookingId || !note) return;
    setIsSavingAppointmentNote(true);
    setAppointmentNotesError('');
    try {
      const response = await fetch('/api/booking?view=appointment-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setAppointmentNotes((current) => [data.note, ...current]);
      setNewAppointmentNote('');
    } catch (error) {
      setAppointmentNotesError(error.message || 'Unable to save note');
    } finally {
      setIsSavingAppointmentNote(false);
    }
  };

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

  const reassignTherapist = async () => {
    const booking = selectedCalendarEvent?.booking;
    if (!booking || !therapistReassignTo) return;
    setIsReassigningTherapist(true);
    setReceiptError('');
    setReceiptNotice('');
    try {
      const response = await fetch('/api/booking?view=reassign-therapist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, therapistName: therapistReassignTo }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setSelectedCalendarEvent((current) => current
        ? { ...current, therapistName: data.therapistName, booking: { ...current.booking, therapistName: data.therapistName } }
        : current);
      setBookings((current) => current.map((item) => item.id === booking.id ? { ...item, therapistName: data.therapistName } : item));
      setTherapistReassignTo('');
      setReceiptNotice(message("Reassigned from {value0} to {value1}.", { value0: (data.previousTherapist || message("Unassigned")), value1: data.therapistName }));
    } catch (error) {
      setReceiptError(error.message || 'Unable to change the therapist for this appointment.');
    } finally {
      setIsReassigningTherapist(false);
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

  const loadCampaignAudienceOptions = async () => {
    try {
      const response = await fetch('/api/booking?view=campaign-audience-options');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setCampaignAudienceOptions(data);
    } catch {
      setCampaignAudienceOptions(null);
    }
  };

  const describeManualFilters = (filters, options) => {
    const parts = [
      filters.allOptedIn ? 'all active opted-in subscribers' : '',
      filters.membershipType ? `${filters.membershipType} members` : '',
      filters.branch,
      filters.service,
      filters.weekday ? `${filters.recurring ? 'every ' : ''}${filters.weekday}` : '',
      filters.days ? `booked in the last ${filters.days} days` : '',
      filters.limit ? `${filters.limit} most recent` : '',
    ].filter(Boolean);
    return parts.length ? `Manual filters: ${parts.join(', ')}` : 'Manual filters';
  };

  const findCampaignAudienceManually = async () => {
    if (isBuildingCampaignAudience || isSendingCampaign) return;
    setCampaignError('');
    setCampaignNotice('');
    setCampaignAudience(null);
    const filters = campaignManualFilters;
    setCampaignConversation((current) => [...current, { role: 'user', text: describeManualFilters(filters, campaignAudienceOptions) }]);
    setIsBuildingCampaignAudience(true);
    try {
      const response = await fetch('/api/booking?view=campaign-audience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'manual', filters }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setCampaignAudience({ query: '', mode: 'manual', filters, ...data });
      setCampaignConversation((current) => [...current, {
        role: 'assistant',
        text: message("{value0} I found {value1} matching {value2} from {value3} active opted-in subscribers.{value4}", { value0: data.description, value1: data.count, value2: data.count === 1 ? message("person") : message("people"), value3: data.subscriberCount, value4: data.sendReady ? '' : message(" {value0}", { value0: data.sendBlockReason }) }),
      }]);
    } catch (error) {
      setCampaignAudience(null);
      setCampaignConversation((current) => [...current, {
        role: 'assistant',
        text: error.message || 'I could not build that audience from those filters.',
      }]);
    } finally {
      setIsBuildingCampaignAudience(false);
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
        body: JSON.stringify({ query: cleanQuery, mode: 'assistant' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setCampaignAudience({ query: cleanQuery, mode: 'assistant', filters: null, ...data });
      const readinessMessage = data.sendReady ? '' : message(" {value0}", { value0: message(data.sendBlockReason) });
      const filterMessage = data.count < data.subscriberCount ? message(" A filter can exclude subscribers who do not have matching booking history. Choose “All active opted-in subscribers” to include everyone.") : '';
      setCampaignConversation((current) => [...current, {
        role: 'assistant',
        text: message("{value0} I found {value1} matching {value2} from {value3} active opted-in subscribers.{value4}{value5}", { value0: data.description, value1: data.count, value2: data.count === 1 ? message("person") : message("people"), value3: data.subscriberCount, value4: filterMessage, value5: readinessMessage }),
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
          mode: campaignAudience.mode || 'assistant',
          filters: campaignAudience.filters || null,
          goal: campaignGoal,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setCampaignSubject(data.draft.subject);
      setCampaignPreview(data.draft.preview);
      setCampaignMessage(data.draft.message);
      setCampaignNotice(message("AI drafted a message for {value0} matching opted-in recipients. Review and edit it before saving or sending.", { value0: data.audienceCount }));
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
      tr("Send “{value0}” to {value1} opted-in recipients?\n\nAudience: {value2}\n\nThis sends immediately from {value3}.", { value0: campaignSubject.trim(), value1: campaignAudience.count, value2: campaignAudience.description, value3: campaignAudience.senderEmail || 'mythaithaimassage@gmail.com' }),
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
          mode: campaignAudience.mode || 'assistant',
          filters: campaignAudience.filters || null,
          subject: campaignSubject,
          preview: campaignPreview,
          message: campaignMessage,
          goal: campaignGoal,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setCampaignNotice(message("Campaign sent to {value0} of {value1} opted-in recipients.{value2}", { value0: data.sent, value1: data.audienceCount, value2: data.failed ? message(" {value0} message{value1} failed; check server logs before retrying to avoid duplicate emails.", { value0: data.failed, value1: data.failed === 1 ? '' : message("s") }) : '' }));
      setCampaignAudience(null);
      if (data.failed) setCampaignError('Some campaign emails failed to send. Do not resend until you have checked which messages were delivered.');
      setCampaignConversation((current) => [...current, {
        role: 'assistant',
        text: message("Campaign delivery finished: {value0} sent and {value1} failed.", { value0: data.sent, value1: data.failed }),
      }]);
      loadCampaignHistory();
    } catch (error) {
      setCampaignError(error.message || 'Unable to send campaign');
    } finally {
      setIsSendingCampaign(false);
    }
  };

  const loadCampaignHistory = async () => {
    setIsLoadingCampaignHistory(true);
    setCampaignHistoryError('');
    try {
      const response = await fetch('/api/booking?view=campaign-log');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setCampaignHistory(data.campaigns || []);
    } catch (error) {
      setCampaignHistoryError(error.message || 'Unable to load campaign history');
    } finally {
      setIsLoadingCampaignHistory(false);
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
    const label = (value) => safe(tr(value));
    const { receipt, booking: originalBooking, businessProfile: profile } = data;
    const booking = { ...originalBooking, paymentOption: `${tr(originalBooking.paymentOption)}${receipt.packageUsage ? ` — ${tr(receipt.packageUsage.description)} ${tr('Allocated session value ${value}; new payment $0.00.', { value: receipt.packageUsage.allocatedTotal.toFixed(2) })}` : ''}` };
    popup.document.write(`<!doctype html><html lang="${lang}"><head><title>${label('Receipt')} ${safe(receipt.number)}</title><meta charset="utf-8"><style>body{font:15px Arial,sans-serif;color:#17231e;max-width:760px;margin:48px auto;padding:32px}header{display:flex;justify-content:space-between;border-bottom:3px solid #087765;padding-bottom:20px}h1{font-size:28px;margin:0}small,.muted{color:#65716b}.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #e5ebe7}.total{font-size:20px;font-weight:bold;border-top:2px solid #087765;margin-top:18px;padding-top:18px}.balance{margin-top:20px;padding:12px;background:#eff6f3;border-radius:8px}button{margin:24px 0;padding:10px 18px;background:#073d32;color:white;border:0;border-radius:8px}@media print{button{display:none}body{margin:0 auto}}</style></head><body><header><div><h1>${safe(profile.businessName)}</h1><p class="muted">${safe(profile.legalName)}</p><p class="muted">${safe(profile.address)}</p><p class="muted">${safe(profile.phone)} · ${safe(profile.email)}</p>${profile.taxRegistrationNumber ? `<p class="muted">${label('GST/HST No.')}: ${safe(profile.taxRegistrationNumber)}</p>` : ''}</div><h1>${label('RECEIPT')}</h1></header><p><strong>${label('Receipt No.')}</strong> ${safe(receipt.number)}<br><strong>${label('Issued')}</strong> ${safe(receipt.issuedAt.slice(0, 10))}</p><p><strong>${label('Client')}</strong> ${safe(booking.customerName)}<br>${safe(booking.email)}<br>${safe(booking.phone)}</p><p><strong>${label('Service date')}</strong> ${safe(booking.date)}<br><strong>${label('Payment method')}</strong> ${safe(booking.paymentOption)}</p><div class="row"><strong>${label(booking.serviceName)}</strong><span>$${receipt.subtotal.toFixed(2)}</span></div>${receipt.membershipDiscountAmount > 0 ? `<div class="row"><span>${label(receipt.membershipDiscountLabel)} (${receipt.membershipDiscountPercent}%)</span><span>-$${receipt.membershipDiscountAmount.toFixed(2)}</span></div>` : ''}${receipt.loyaltyDiscount > 0 ? `<div class="row"><span>${label('Loyalty discount ·')} ${receipt.pointsRedeemed.toLocaleString(locale)} ${label('points')}</span><span>-$${receipt.loyaltyDiscount.toFixed(2)}</span></div>` : ''}<div class="row"><span>${label(receipt.taxLabel)}</span><span>$${receipt.tax.toFixed(2)}</span></div><div class="row total"><span>${label('Total paid')}</span><span>$${receipt.total.toFixed(2)}</span></div>${receipt.loyaltyMember ? `<p class="balance"><strong>${label('Loyalty points balance:')}</strong> ${receipt.pointsBalance.toLocaleString(locale)}</p>` : ''}<p class="muted" style="text-align:center;margin-top:64px">${safe(tr('Thank you for choosing {business}.', { business: profile.businessName }))}</p><button onclick="window.print()">${label('Print receipt')}</button></body></html>`);
    if (receipt.manualDiscount > 0) {
      popup.document.querySelector('.total')?.insertAdjacentHTML('beforebegin', `<div class="row"><span>${label('Manual discount')}</span><span>-$${receipt.manualDiscount.toFixed(2)}</span></div>`);
    }
    if (receipt.overpaymentAmount > 0) {
      popup.document.querySelector('.total')?.insertAdjacentHTML('afterend', `<p class="balance">${label('Recorded payment: $')}${receipt.recordedPaidAmount.toFixed(2)}${label('. Excess recorded payment: $')}${receipt.overpaymentAmount.toFixed(2)}${label('. Reconcile manually; no automatic refund has been issued.')}</p>`);
    }
    popup.document.close();
    popup.focus();
  };

  const loadCalendar = async () => {
    calendarRequest.current?.abort();
    const controller = new AbortController();
    calendarRequest.current = controller;
    setIsLoadingCalendar(true);
    setCalendarLoadError('');
    try {
      const selectedBranch = calendarBranch === 'all' ? undefined : branches.find((item) => String(item.id) === calendarBranch);
      const branch = selectedBranch?.address || '';
      const branchName = selectedBranch?.name || '';
      const therapist = calendarTherapist === 'all' ? '' : therapists.find((item) => String(item.id) === calendarTherapist)?.name || '';
      const response = await fetch(`/api/booking?view=calendar&date=${encodeURIComponent(calendarDate)}&branch=${encodeURIComponent(branch)}&branchName=${encodeURIComponent(branchName)}&therapist=${encodeURIComponent(therapist)}`, {
        signal: controller.signal, cache: 'no-store',
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setCalendarEvents(data.events || []);
      setCalendarUrl(data.calendarUrl || '');
      setCalendarWarnings(data.errors || []);
      setCalendarUnavailability(data.unavailability || []);
    } catch (error) {
      if (!controller.signal.aborted) setCalendarLoadError(error.message || 'Unable to load Google Calendar events');
    } finally {
      if (calendarRequest.current === controller) {
        calendarRequest.current = null;
        setIsLoadingCalendar(false);
      }
    }
  };

  const visibleCalendarEvents = calendarEvents.filter((event) => {
    const search = calendarSearch.trim().toLowerCase();
    return !search || [event.summary, event.therapistName, event.location, event.booking?.customerName, event.booking?.email, event.booking?.phone]
      .some((value) => String(value || '').toLowerCase().includes(search));
  });

  const openQuickBooking = (time = '') => {
    setQuickBookingNotice('');
    setQuickBooking({ date: calendarDate, branchId: calendarBranch, therapistId: calendarTherapist, time });
  };

  useEffect(() => {
    if (activeTab !== 'calendar') return;
    void loadCalendar();
    const refresh = () => {
      if (calendarAutoRefresh && !document.hidden && !calendarRequest.current) void loadCalendar();
    };
    const interval = window.setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      calendarRequest.current?.abort();
    };
  }, [activeTab, calendarDate, calendarBranch, calendarTherapist, calendarAutoRefresh]);

  const loadUnavailability = async () => {
    setIsLoadingUnavailability(true);
    setUnavailabilityLoadError('');
    try {
      const response = await fetch('/api/booking?view=unavailability');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setUnavailabilityBlocks(data.blocks || []);
    } catch (error) {
      setUnavailabilityLoadError(error.message || 'Unable to load availability blocks');
    } finally {
      setIsLoadingUnavailability(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'availability') loadUnavailability();
  }, [activeTab]);

  const createUnavailabilityBlock = async (event) => {
    event.preventDefault();
    setIsSavingUnavailability(true);
    setUnavailabilitySaveError('');
    try {
      const response = await fetch('/api/booking?view=unavailability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unavailabilityForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save this block.');
      setUnavailabilityBlocks((current) => [data.block, ...current]);
      setUnavailabilityForm((current) => ({ ...current, reason: '' }));
    } catch (error) {
      setUnavailabilitySaveError(error.message || 'Unable to save this block.');
    } finally {
      setIsSavingUnavailability(false);
    }
  };

  const deleteUnavailabilityBlock = async (id) => {
    setUnavailabilitySaveError('');
    try {
      const response = await fetch('/api/booking?view=unavailability-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to remove this block.');
      setUnavailabilityBlocks((current) => current.filter((block) => block.id !== id));
    } catch (error) {
      setUnavailabilitySaveError(error.message || 'Unable to remove this block.');
    }
  };

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

  const [deletingPatientHistoryKey, setDeletingPatientHistoryKey] = useState('');
  const [deletePatientHistoryError, setDeletePatientHistoryError] = useState('');

  const deletePatientHistoryRecord = async (profile) => {
    if (!confirm(tr("Permanently clear the medical history on file for {value0}? This cannot be undone.", { value0: profile.patientName || profile.bookingId }))) return;
    const key = `${profile.bookingId}-${profile.createdAt}`;
    setDeletingPatientHistoryKey(key);
    setDeletePatientHistoryError('');
    try {
      const response = await fetch('/api/booking?view=delete-patient-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: profile.bookingId, createdAt: profile.createdAt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setPatientHistory((prev) => prev.filter((item) => !(item.bookingId === profile.bookingId && item.createdAt === profile.createdAt)));
      setSelectedPatientHistory((current) => (current === profile ? null : current));
    } catch (error) {
      setDeletePatientHistoryError(error.message || 'Unable to clear patient history record');
    } finally {
      setDeletingPatientHistoryKey('');
    }
  };

  const filteredPatientHistory = patientHistory.filter((profile) => {
    const query = patientHistorySearch.trim().toLowerCase();
    return !query || [profile.patientName, profile.bookingId, profile.email, profile.phone]
      .some((value) => value.toLowerCase().includes(query));
  });

  const selectedConditionFlags = selectedPatientHistory
    ? Object.entries(selectedPatientHistory.conditions).filter(([, value]) => value.toLowerCase() === 'yes')
    : [];

  const [therapistAccounts, setTherapistAccounts] = useState([]);
  const [isLoadingTherapistAccounts, setIsLoadingTherapistAccounts] = useState(false);
  const [therapistAccountsError, setTherapistAccountsError] = useState('');
  const [updatingTherapistAccountId, setUpdatingTherapistAccountId] = useState('');

  const loadTherapistAccounts = async () => {
    setIsLoadingTherapistAccounts(true);
    setTherapistAccountsError('');
    try {
      const response = await fetch('/api/booking?view=therapist-accounts');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setTherapistAccounts(data.accounts || []);
    } catch (error) {
      setTherapistAccountsError(error.message || 'Unable to load therapist accounts');
    } finally {
      setIsLoadingTherapistAccounts(false);
    }
  };

  useEffect(() => {
    loadTherapistAccounts();
  }, []);

  useEffect(() => {
    if (activeTab === 'therapist-approvals') loadTherapistAccounts();
  }, [activeTab]);

  const updateTherapistAccountStatus = async (account, status) => {
    if (status === 'rejected' && !confirm(tr("Reject the therapist account request from {value0}?", { value0: account.name || account.username }))) return;
    if (status === 'pending' && !confirm(tr("Revoke access for {value0}? They will not be able to sign in until approved again.", { value0: account.name || account.username }))) return;
    setUpdatingTherapistAccountId(account.id);
    setTherapistAccountsError('');
    try {
      const response = await fetch('/api/booking?view=therapist-account-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setTherapistAccounts((current) => current.map((item) => (item.id === account.id ? { ...item, status } : item)));
    } catch (error) {
      setTherapistAccountsError(error.message || 'Unable to update therapist account');
    } finally {
      setUpdatingTherapistAccountId('');
    }
  };

  const pendingTherapistAccounts = therapistAccounts.filter((account) => account.status === 'pending');

  const adminNavigation = [
    { id: 'schedule', label: 'Home', icon: Home, section: 'Workspace' },
    { id: 'calendar', label: 'Booking Calendar', icon: CalendarDays, section: 'Workspace' },
    { id: 'schedule', label: 'Events & bookings', icon: CalendarIcon, section: 'Workspace' },
    { id: 'reports', label: 'Sales & reports', icon: BarChart3, section: 'Workspace' },
    { id: 'services', label: 'Service catalogue', icon: Layers, section: 'Manage' },
    { id: 'staff', label: 'Staff', icon: Users, section: 'Manage' },
    { id: 'branches', label: 'Branches', icon: MapPin, section: 'Manage' },
    { id: 'availability', label: 'Availability', icon: CalendarX, section: 'Manage' },
    { id: 'patient-history', label: 'Patients', icon: UserRound, section: 'Manage' },
    { id: 'wix-contacts', label: 'Wix contacts import', icon: Upload, section: 'Manage' },
    { id: 'wix-bookings', label: 'Wix bookings import', icon: Database, section: 'Manage' },
    { id: 'packages', label: 'Package tracking', icon: Layers, section: 'Grow' },
    { id: 'therapist-approvals', label: 'Therapist approvals', icon: UserCheck, section: 'Manage', badge: pendingTherapistAccounts.length },
    { id: 'dashboard-users', label: 'Dashboard access', icon: ShieldCheck, section: 'Manage' },
    { id: 'business-profile', label: 'Business profile', icon: Building, section: 'Manage' },
    { id: 'loyalty', label: 'Loyalty program', icon: Award, section: 'Grow' },
    { id: 'marketing', label: 'Email marketing', icon: Megaphone, section: 'Grow' },
    { id: 'google-ads', label: 'Google Ads', icon: TrendingUp, section: 'Grow' },
    { id: 'reviews', label: 'Google Reviews', icon: Star, section: 'Grow' },
  ];
  const visibleAdminNavigation = adminNavigation.filter((item) => {
    if (dashboardUser.role === 'owner') return true;
    if (item.id === 'schedule' || item.id === 'calendar') return true;
    if (dashboardUser.role === 'branch_manager' && item.id === 'reports') return true;
    return false;
  });
  const navigationSections = [...new Set(visibleAdminNavigation.map((item) => item.section))];
  const dashboardBranches = dashboardUser.role === 'owner'
    ? branches
    : branches.filter((branch) => assignedBranchIds.has(String(branch.id)));
  const isBranchReceptionist = dashboardUser.role === 'branch_receptionist';
  const pageTitle = {
    schedule: t.schedule,
    calendar: 'Booking Calendar',
    reports: 'Sales & reports',
    loyalty: 'Loyalty program',
    marketing: 'Email marketing',
    'google-ads': 'Google Ads',
    reviews: 'Google Reviews',
    services: t.services,
    staff: t.staff,
    branches: 'Branches',
    availability: 'Availability',
    'patient-history': 'Patient Summary',
    'wix-contacts': 'Historical Wix contacts',
    'wix-bookings': 'Historical Wix bookings',
    packages: 'Package tracking',
    'therapist-approvals': 'Therapist approvals',
    'business-profile': 'Business profile',
  }[activeTab] || 'Owner dashboard';

  return (
    <div className="min-h-[calc(100vh-58px)] bg-[#f1f3f7] lg:flex">
      <aside className="sticky top-[58px] hidden h-[calc(100vh-58px)] w-64 shrink-0 flex-col bg-[#111722] text-slate-300 lg:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-sm font-black text-slate-950">M</div>
          <div>
            <div className="text-base font-bold tracking-tight text-white">MedBook</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">{tr("Practice manager")}</div>
          </div>
        </div>
        <div className="px-4 py-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{tr("Quick actions")} <ChevronRightIcon className="float-right h-3.5 w-3.5 rotate-90" /></div>
        </div>
        <nav aria-label={tr("Owner dashboard navigation")} className="flex-1 overflow-y-auto px-3 pb-4">
          {navigationSections.map((section) => (
            <div key={section} className="mb-5">
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{tr(section)}</p>
              <div className="space-y-1">
                {visibleAdminNavigation.filter((item) => item.section === section).map((item, index) => {
                  const Icon = item.icon;
                  const selected = activeTab === item.id && !visibleAdminNavigation.slice(0, visibleAdminNavigation.indexOf(item)).some((prior) => prior.id === item.id && prior.section === section);
                  return (
                    <button
                      key={`${item.section}-${item.label}-${index}`}
                      onClick={() => { setActiveTab(item.id); setMobileNavOpen(false); }}
                      aria-current={selected ? 'page' : undefined}
                      className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition ${selected ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-emerald-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
                      <span className="flex-1">{tr(item.label)}</span>
                      {item.badge > 0 && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">{item.badge}</span>}
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
            <div className="min-w-0"><div className="truncate text-xs font-semibold text-white">{tr("Practice owner")}</div><div className="text-[10px] text-slate-500">{tr("Owner account")}</div></div>
            <ShieldCheck className="ml-auto h-4 w-4 shrink-0 text-emerald-300" />
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-[58px] z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:top-[58px]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" aria-label={tr("Toggle dashboard menu")} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"><Menu className="h-4 w-4" /></button>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{businessProfile.businessName || 'MY THAI THAI'}</p>
                <p className="hidden text-[11px] text-slate-500 sm:block">{tr(pageTitle)} <span className="px-1 text-slate-300">/</span> {tr("Owner workspace")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden items-center gap-1.5 text-[11px] font-medium text-slate-500 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {tr("Workspace active")}</span>
              <div className="flex items-center rounded-lg border border-slate-200 p-0.5">
                <button onClick={() => setLang('en')} className={`rounded-md px-2 py-1 text-[10px] font-bold ${lang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>EN</button>
                <button onClick={() => setLang('th')} className={`rounded-md px-2 py-1 text-[10px] font-bold ${lang === 'th' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>ไทย</button>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-950">MT</div>
            </div>
          </div>
          {mobileNavOpen && (
            <nav aria-label={tr("Mobile owner dashboard navigation")} className="mt-3 grid grid-cols-2 gap-1 border-t border-slate-100 pt-3 sm:grid-cols-3">
              {visibleAdminNavigation.map((item, index) => {
                const Icon = item.icon;
                return <button key={`${item.label}-${index}`} onClick={() => { setActiveTab(item.id); setMobileNavOpen(false); }} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold ${activeTab === item.id ? 'bg-emerald-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" />{tr(item.label)}{item.badge > 0 && <span className="ml-auto rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-950">{item.badge}</span>}</button>;
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
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />{tr("Owner dashboard")}</div>
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
              <Settings className="h-4 w-4" />{tr("Edit business profile")}</button>
          </div>
        </div>
        <div className="relative z-10 mt-6 flex flex-wrap items-center gap-2 border-t border-white/15 pt-5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100/70">{tr("Location")}</span>
          <button onClick={() => setSelectedBranchId('all')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${selectedBranchId === 'all' ? 'bg-white text-emerald-950' : 'text-white/80 hover:bg-white/10'}`}>{dashboardUser.role === 'owner' ? t.allBranches : tr("Assigned branches")}</button>
          {dashboardBranches.map((branch) => (
            <button key={branch.id} onClick={() => setSelectedBranchId(branch.id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${selectedBranchId === branch.id ? 'bg-white text-emerald-950' : 'text-white/80 hover:bg-white/10'}`}>{branch.name}</button>
          ))}
          <span className="ml-auto hidden text-xs text-emerald-100/70 sm:inline">{tr("Practice & branch management")}</span>
        </div>
      </section>

      {/* Admin KPI Stat Cards */}
      <div className={`grid grid-cols-2 gap-4 ${isBranchReceptionist ? 'md:grid-cols-2' : 'md:grid-cols-4'}`}>
        {!isBranchReceptionist && <>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-500">{t.revenueToday}</div><span className="rounded-xl bg-emerald-50 p-2 text-emerald-800"><TrendingUp className="h-4 w-4" /></span></div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-emerald-900">${totalRevenue.toFixed(2)}</div>
          <div className="mt-1 text-[11px] text-slate-400">{selectedBranchName || tr("All branches")}</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-500">{t.appointmentsToday}</div><span className="rounded-xl bg-blue-50 p-2 text-blue-800"><CalendarIcon className="h-4 w-4" /></span></div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{dashboardBookings.length}</div>
          <div className="mt-1 text-[11px] text-slate-400">{selectedBranchName || tr("All branches")}</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-500">{t.activeStaff}</div><span className="rounded-xl bg-amber-50 p-2 text-amber-800"><Users className="h-4 w-4" /></span></div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{dashboardTherapists.length}</div>
          <div className="mt-1 text-[11px] text-slate-400">{selectedBranchName || tr("All branches")}</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-500">{t.hstCollected}</div><span className="rounded-xl bg-violet-50 p-2 text-violet-800"><DollarSign className="h-4 w-4" /></span></div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">${hstCollected.toFixed(2)}</div>
          <div className="mt-1 text-[11px] text-slate-400">{selectedBranchName || tr("All branches")} {tr("· Estimated Ontario HST")}</div>
        </div>
        </>}
        {isBranchReceptionist && <>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-500">{t.appointmentsToday}</div><span className="rounded-xl bg-blue-50 p-2 text-blue-800"><CalendarIcon className="h-4 w-4" /></span></div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{dashboardBookings.length}</div>
            <div className="mt-1 text-[11px] text-slate-400">{selectedBranchName || tr("Assigned branches")}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-500">{tr("Active staff")}</div><span className="rounded-xl bg-amber-50 p-2 text-amber-800"><Users className="h-4 w-4" /></span></div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{dashboardTherapists.length}</div>
            <div className="mt-1 text-[11px] text-slate-400">{selectedBranchName || tr("Assigned branches")}</div>
          </div>
        </>}
      </div>

      {activeTab === 'wix-contacts' && <WixContacts />}
      {activeTab === 'wix-bookings' && <WixBookings onViewBookings={() => setActiveTab('schedule')} />}
      {activeTab === 'packages' && <PackageTracking onViewBookings={() => setActiveTab('schedule')} />}

      {activeTab === 'dashboard-users' && dashboardUser.role === 'owner' && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">{tr("Dashboard access")}</h2>
            <p className="mt-1 text-sm text-slate-600">{tr("Create role-limited accounts. Every account must verify sign-in with a one-time code sent to its email address.")}</p>
            <form onSubmit={createDashboardUser} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">{tr("Name")}<input required maxLength={120} value={newDashboardUser.name} onChange={(event) => setNewDashboardUser((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-600">{tr("Email")}<input required type="email" value={newDashboardUser.email} onChange={(event) => setNewDashboardUser((current) => ({ ...current, email: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-600">{tr("Initial password (at least 12 characters)")}<input required type="password" minLength={12} autoComplete="new-password" value={newDashboardUser.password} onChange={(event) => setNewDashboardUser((current) => ({ ...current, password: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-600">{tr("Role")}<select value={newDashboardUser.role} onChange={(event) => setNewDashboardUser((current) => ({ ...current, role: event.target.value, branchIds: event.target.value === 'owner' ? [] : current.branchIds }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
                  <option value="owner">{tr("Owner")}</option>
                  <option value="branch_manager">{tr("Branch manager")}</option>
                  <option value="branch_receptionist">{tr("Branch receptionist")}</option>
                </select>
              </label>
              {newDashboardUser.role !== 'owner' && <fieldset className="sm:col-span-2">
                <legend className="text-xs font-semibold text-slate-600">{tr("Assigned branches")}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {branches.map((branch) => {
                    const id = String(branch.id);
                    const checked = newDashboardUser.branchIds.includes(id);
                    return <label key={id} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${checked ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600'}`}>
                      <input type="checkbox" checked={checked} onChange={() => setNewDashboardUser((current) => ({ ...current, branchIds: checked ? current.branchIds.filter((value) => value !== id) : [...current.branchIds, id] }))} />
                      {branch.name}
                    </label>;
                  })}
                </div>
              </fieldset>}
              <button type="submit" disabled={savingDashboardUser} className="rounded-lg bg-emerald-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2 sm:w-fit">{savingDashboardUser ? tr("Creating…") : tr("Create dashboard account")}</button>
            </form>
            <p className="mt-3 text-xs leading-5 text-slate-500">{tr("The owner sets the initial password. Share it separately through a secure channel; the account’s email is used for sign-in and OTP delivery.")}</p>
            {dashboardUserMessage && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{tr(dashboardUserMessage)}</p>}
            {dashboardUserError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{tr(dashboardUserError)}</p>}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">{tr("Staff accounts")}</h3>
              <button type="button" onClick={loadDashboardUsers} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{tr("Refresh")}</button>
            </div>
            <div className="mt-3 divide-y divide-slate-100">
              {dashboardUsers.length ? dashboardUsers.map((account) => (
                <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{account.name} · {account.email}</p>
                    <p className="mt-1 text-xs capitalize text-slate-500">{tr(account.role.replaceAll('_', ' '))} · {account.branchIds.map((id) => branches.find((branch) => String(branch.id) === String(id))?.name).filter(Boolean).join(', ') || tr("All branches")} · {tr(account.status)}</p>
                  </div>
                  <button type="button" onClick={() => updateDashboardUserStatus(account)} className={`rounded-lg px-3 py-2 text-xs font-bold ${account.status === 'active' ? 'border border-rose-200 text-rose-700 hover:bg-rose-50' : 'border border-emerald-200 text-emerald-800 hover:bg-emerald-50'}`}>{account.status === 'active' ? tr("Disable access") : tr("Restore access")}</button>
                </div>
              )) : <p className="py-4 text-sm text-slate-500">{tr("No staff accounts have been created.")}</p>}
            </div>
          </div>
        </section>
      )}

      {/* TAB CONTENT: SCHEDULE */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-stone-900">{t.schedule}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={loadBookingsFromBackend}
                disabled={isLoadingBookings}
                className="px-3 py-2 border border-stone-300 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-50 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {isLoadingBookings
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {tr("Loading...")}</>
                  : <><Database className="w-3.5 h-3.5" /> {tr("Refresh from database")}</>}
              </button>
              <button
              onClick={() => {
                setCalendarBranch(effectiveSelectedBranchId);
                setActiveTab('calendar');
              }}
              className="px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold hover:bg-emerald-900 transition flex items-center"
              >
                <Plus className="w-4 h-4 mr-1" /> {t.addBooking}
              </button>
            </div>
          </div>
          {bookingLoadError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs">
              {tr(bookingLoadError)}
            </div>
          )}
          {deleteBookingError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs">
              {tr(deleteBookingError)}
            </div>
          )}
          {dashboardUser.role === 'owner' && <ClearBookingHistory onCleared={loadBookingsFromBackend} />}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-stone-50 text-stone-600 font-bold border-b">
                <tr>
                  <th className="p-3">{tr("Ref ID")}</th>
                  <th className="p-3">{tr("Customer")}</th>
                  <th className="p-3">{tr("Service")}</th>
                  <th className="p-3">{tr("Therapist")}</th>
                  <th className="p-3">{tr("Time")}</th>
                  <th className="p-3"><span className="inline-flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> {tr("Database")}</span></th>
                  {!isBranchReceptionist && <th className="p-3">{tr("Total")}</th>}
                  {dashboardUser.role === 'owner' && <th className="p-3">{tr("Actions")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {bookings.map(b => (
                  <tr key={b.id} className="hover:bg-stone-50 transition">
                    <td className="p-3 font-mono font-bold text-stone-900">{b.id}</td>
                    <td className="p-3">
                      <div className="font-bold text-stone-800">{b.customerName}</div>
                      <div className="text-stone-400 text-[11px]">{b.phone}</div>
                      {b.bookingNote && <div className="mt-1 whitespace-pre-wrap text-[11px] text-blue-800">{tr("Team note:")} {b.bookingNote}</div>}
                    </td>
                    <td className="p-3 font-medium text-stone-700">{tr(b.serviceName)}</td>
                    <td className="p-3 text-stone-600">{b.therapistName}</td>
                    <td className="p-3 font-semibold text-stone-800">{formatTime(b.time)}</td>
                    <td className="p-3">
                      {b.syncedToSheets ? (
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-1 rounded-md text-[10px] inline-flex items-center">
                          <Check className="w-3 h-3 mr-1" />{tr("Synced")}</span>
                      ) : (
                        <span className="bg-stone-100 text-stone-600 font-bold px-2 py-1 rounded-md text-[10px]">{tr("Local Only")}</span>
                      )}
                    </td>
                    {!isBranchReceptionist && <td className="p-3 font-bold text-stone-900">${b.total.toFixed(2)}</td>}
                    {dashboardUser.role === 'owner' && <td className="p-3">
                      <button
                        onClick={() => deleteBooking(b.id)}
                        disabled={deletingBookingId === b.id}
                        className="px-2 py-1 border border-red-300 text-red-700 rounded-lg text-[11px] font-bold hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingBookingId === b.id ? tr("Removing...") : tr("Clear")}
                      </button>
                    </td>}
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
              <h2 className="text-lg font-bold text-stone-900">{tr("Booking Calendar")}</h2>
              <p className="text-xs text-stone-500">{tr("Live appointments and quick manual booking.")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative"><span className="sr-only">{tr("Search appointments")}</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-blue-600" /><input type="search" value={calendarSearch} onChange={(event) => setCalendarSearch(event.target.value)} placeholder={tr("Search appointments")} className="h-9 w-48 rounded-full border border-blue-200 pl-9 pr-3 text-xs" /></label>
              <label><span className="sr-only">{tr("Calendar view")}</span><select value={calendarViewMode} onChange={(event) => setCalendarViewMode(event.target.value)} className="h-9 rounded-full border border-blue-200 bg-white px-4 text-xs text-blue-700"><option value="daily">{tr("Daily")}</option><option value="agenda">{tr("Agenda")}</option></select></label>
              <button type="button" aria-label={tr("Calendar filters")} aria-expanded={calendarFiltersOpen} onClick={() => setCalendarFiltersOpen(!calendarFiltersOpen)} className="rounded-full border border-blue-200 p-2 text-blue-600"><Filter className="h-4 w-4" /></button>
              <details className="relative">
                <summary aria-label={tr("Calendar settings")} className="cursor-pointer list-none rounded-full border border-blue-200 p-2 text-blue-600"><Settings className="h-4 w-4" /></summary>
                <div className="absolute right-0 z-20 mt-2 w-56 space-y-3 rounded-xl border border-stone-200 bg-white p-4 text-xs shadow-lg">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={calendarAutoRefresh} onChange={(event) => setCalendarAutoRefresh(event.target.checked)} />{tr("Auto-refresh every 15 seconds")}</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={calendarShowLegend} onChange={(event) => setCalendarShowLegend(event.target.checked)} />{tr("Show therapist legend")}</label>
                </div>
              </details>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-full border border-blue-200 px-4 py-2 text-xs font-semibold text-blue-600">{tr("Manage ▾")}</summary>
                <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-stone-200 bg-white p-2 text-sm shadow-lg">
                  <button type="button" onClick={() => setActiveTab('schedule')} className="w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50">{tr("Appointments")}</button>
                  {dashboardUser.role === 'owner' && <>
                    <button type="button" onClick={() => setActiveTab('availability')} className="w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50">{tr("Staff availability")}</button>
                    <button type="button" onClick={() => setActiveTab('services')} className="w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50">{tr("Services")}</button>
                  </>}
                </div>
              </details>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-full bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700">{tr("Add ▾")}</summary>
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-stone-200 bg-white p-2 text-sm shadow-lg">
                  <button type="button" onClick={(event) => { event.currentTarget.closest('details').open = false; openQuickBooking(); }} className="w-full rounded-lg px-4 py-3 text-left hover:bg-blue-50">{tr("Quick Sale")} <span className="block text-[10px] text-stone-500">{tr("Quick appointment · no payment")}</span></button>
                  <button type="button" onClick={(event) => { event.currentTarget.closest('details').open = false; openQuickBooking(); }} className="w-full border-t border-stone-100 px-4 py-3 text-left hover:bg-blue-50">{tr("Appointment")}</button>
                  {dashboardUser.role === 'owner' && <>
                    <button type="button" onClick={() => {
                      setUnavailabilityForm((current) => ({
                        ...current, scope: calendarTherapist === 'all' ? 'business' : 'therapist',
                        therapistName: therapists.find((item) => String(item.id) === calendarTherapist)?.name || '',
                        branchName: branches.find((item) => String(item.id) === calendarBranch)?.name || '',
                        date: calendarDate,
                      }));
                      setActiveTab('availability');
                    }} className="w-full px-4 py-3 text-left hover:bg-blue-50">{tr("Blocked staff time")}</button>
                    <button type="button" onClick={() => { addServiceRow(); setActiveTab('services'); }} className="w-full border-t border-stone-100 px-4 py-3 text-left hover:bg-blue-50">{tr("Create New Service")}</button>
                  </>}
                </div>
              </details>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t-2 border-blue-600 pt-4">
              <label className="text-xs font-semibold text-stone-600">{tr("Date")}<input type="date" value={calendarDate} onChange={(event) => setCalendarDate(event.target.value)} className="block mt-1 p-2 rounded-lg border border-stone-300" />
              </label>
              {calendarFiltersOpen && <label className="text-xs font-semibold text-stone-600">{tr("Branch")}<select value={calendarBranch} onChange={(event) => setCalendarBranch(event.target.value)} className="block mt-1 p-2 rounded-lg border border-stone-300">
                  <option value="all">{tr("All branches")}</option>
                  {dashboardBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>}
              {calendarFiltersOpen && <label className="text-xs font-semibold text-stone-600">{tr("Therapist")}<select value={calendarTherapist} onChange={(event) => setCalendarTherapist(event.target.value)} className="block mt-1 p-2 rounded-lg border border-stone-300">
                  <option value="all">{tr("All therapists")}</option>
                  {therapists.map((therapist) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}
                </select>
              </label>}
              <button onClick={loadCalendar} disabled={isLoadingCalendar} className="h-9 px-3 bg-emerald-800 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                {isLoadingCalendar ? tr("Loading...") : tr("Refresh")}
              </button>
              {!calendarFiltersOpen && (calendarBranch !== 'all' || calendarTherapist !== 'all') && <button type="button" onClick={() => setCalendarFiltersOpen(true)} className="h-9 rounded-lg border border-blue-200 px-3 text-xs text-blue-700">{tr("Filters:")}{branches.find((item) => String(item.id) === calendarBranch)?.name || tr("All branches")} · {therapists.find((item) => String(item.id) === calendarTherapist)?.name || tr("All therapists")}
              </button>}
          </div>
          {quickBookingNotice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{tr(quickBookingNotice)}</p>}
          {calendarLoadError && <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs">{tr(calendarLoadError)}</div>}
          <WixCalendarSync onSynced={async () => {
            await Promise.all([loadCalendar(), loadBookingsFromBackend()]);
          }} />
          {calendarWarnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs">{tr("Calendar access warning:")}{calendarWarnings.join(' · ')}
            </div>
          )}
          {calendarUnavailability.length > 0 && (
            <div className="p-3 bg-stone-100 border border-stone-300 text-stone-800 rounded-xl text-xs space-y-1.5">
              <p className="font-bold uppercase tracking-wide text-stone-600">{tr("Blocked / unavailable this day")}</p>
              {calendarUnavailability.map((block) => (
                <p key={block.id} className="flex items-center gap-1.5">
                  <CalendarX className="w-3.5 h-3.5 shrink-0 text-stone-500" />
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${block.scope === 'business' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{block.scope === 'business' ? tr("Business-wide") : block.therapistName}</span>
                  {block.startTime}–{block.endTime}{block.reason ? tr(" · {value0}", { value0: block.reason }) : ''}
                </p>
              ))}
            </div>
          )}
          {calendarUrl && (
            <a href={calendarUrl} target="_blank" rel="noreferrer" className="inline-flex text-xs font-semibold text-emerald-800 underline">{tr("Open the primary Google Calendar")}</a>
          )}
          {calendarViewMode === 'daily' && <div className="rounded-xl overflow-hidden border border-stone-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3 bg-stone-50 border-b border-stone-200">
              <div>
                <p className="font-bold text-stone-900">{new Date(`${calendarDate}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                <p className="text-xs text-stone-500">{tr("MY THAI THAI · live primary calendar view")}</p>
              </div>
              <CalendarIcon className="w-5 h-5 text-emerald-700" />
            </div>
            <div className="max-h-[620px] overflow-y-auto">
              {Array.from({ length: 12 }, (_, index) => index + 8).map((hour) => {
                const hourLabel = new Date(2000, 0, 1, hour).toLocaleTimeString(locale, { hour: 'numeric' });
                const hourEvents = visibleCalendarEvents.filter((event) => Number(event.localTime?.split(':')[0]) === hour);
                const hourBlocks = calendarUnavailability.filter((block) => Number(block.startTime?.split(':')[0]) <= hour && Number(block.endTime?.split(':')[0]) > hour);
                return (
                  <div key={hour} className="grid grid-cols-[72px_1fr] min-h-[58px] border-b border-stone-100">
                    <div className="p-2 text-[11px] text-stone-400 text-right border-r border-stone-100">{formatTime(hourLabel)}</div>
                    <div className="p-1.5 space-y-1">
                      {hour >= 10 && <button type="button" onClick={() => openQuickBooking(AVAILABLE_TIMES[(hour - 10) * 4])} aria-label={tr("Add appointment at {value0}", { value0: hourLabel })} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50">{tr("+ Book")} {formatTime(hourLabel)}</button>}
                      {hourBlocks.map((block) => (
                        <div key={`block-${block.id}`} className="flex items-center gap-1.5 rounded-lg border-l-4 border-stone-400 bg-stone-100 px-3 py-2 text-xs text-stone-600">
                          <CalendarX className="w-3.5 h-3.5 shrink-0" />
                          <span>{block.scope === 'business' ? tr("Business-wide unavailable") : tr("{value0} unavailable", { value0: block.therapistName })}{block.reason ? tr(" · {value0}", { value0: block.reason }) : ''}</span>
                        </div>
                      ))}
                      {hourEvents.map((event) => (
                        <button key={event.id} type="button" onClick={() => { setSelectedCalendarEvent(event); setIssuedReceipt(null); setReceiptError(''); setReceiptNotice(''); }} className={`block w-full rounded-lg border-l-4 px-3 py-2 text-left text-xs transition hover:brightness-95 ${getTherapistCalendarColor(event.therapistName, therapists).event}`}>
                          <div className={`font-bold flex items-center gap-1.5 ${getTherapistCalendarColor(event.therapistName, therapists).text}`}>
                            {event.isCouple && <Users className="w-3 h-3 shrink-0" aria-label={tr("Couple massage")} />}
                            <span className="truncate">{event.summary}</span>
                            {event.booking?.status === 'Cancelled' && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">{tr("Cancelled")}</span>}
                          </div>
                          <div className={getTherapistCalendarColor(event.therapistName, therapists).text}>{formatTime(event.timeRange || event.localTime)} · {event.therapistName || event.calendarName.replace(' - MY THAI THAI', '')}</div>
                          {event.booking?.bookingNote && <div className="mt-1 whitespace-pre-wrap text-[11px]">{tr("Team note:")} {event.booking.bookingNote}</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>}
          <p className="text-xs text-stone-500">
            {calendarAutoRefresh ? tr("Updates automatically every 15 seconds while this tab is visible.") : tr("Auto-refresh is paused. Use Refresh to load current appointments.")}{tr("The daily view and appointment list use the same search, date, branch, and therapist filters.")}</p>
          {calendarShowLegend && <div className="flex flex-wrap gap-3 items-center rounded-xl bg-stone-50 border border-stone-200 px-3 py-2">
            <span className="text-xs font-bold text-stone-700">{tr("Therapists:")}</span>
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
                <span className="w-2.5 h-2.5 rounded-full bg-stone-400" />{tr("Any Available")}</span>
            )}
          </div>}
          {visibleCalendarEvents.length === 0 && !isLoadingCalendar ? (
            <p className="py-8 text-center text-sm text-stone-500">{tr("No appointments match this date, search, branch and therapist. Adjust your filters or add an appointment.")}</p>
          ) : (
            <div className="space-y-3">
              {visibleCalendarEvents.map((event) => (
                <div key={event.id} className={`p-4 rounded-xl border border-stone-200 ${getTherapistCalendarColor(event.therapistName, therapists).event}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button type="button" onClick={() => { setSelectedCalendarEvent(event); setIssuedReceipt(null); setReceiptError(''); setReceiptNotice(''); }} className="min-w-0 text-left">
                      <span className="font-bold text-stone-900 inline-flex items-center gap-1.5">
                        {event.isCouple && <Users className="w-3.5 h-3.5 text-rose-500 shrink-0" aria-label={tr("Couple massage")} />}
                        {event.summary}
                        {event.booking?.status === 'Cancelled' && <span className="text-[10px] font-bold uppercase tracking-wide text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">{tr("Cancelled")}</span>}
                      </span>
                      <span className="mt-1 block text-xs text-stone-500">{event.therapistName || event.calendarName} · {event.location}</span>
                      {event.booking?.bookingNote && <span className="mt-1 block whitespace-pre-wrap text-xs text-blue-800">{tr("Team note:")} {event.booking.bookingNote}</span>}
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-sm font-semibold text-emerald-800">{formatTime(event.timeRange || event.localTime)}</span>
                      <button type="button" onClick={() => { setSelectedCalendarEvent(event); setIssuedReceipt(null); setReceiptError(''); setReceiptNotice(''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-emerald-900 transition hover:bg-emerald-50"><ReceiptText className="h-3.5 w-3.5" />{tr("Open appointment")}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {quickBooking && <QuickBooking
        {...quickBooking}
        branches={dashboardBranches}
        services={services}
        therapists={therapists}
        times={AVAILABLE_TIMES}
        isScheduled={isTherapistScheduledAtBranch}
        onClose={() => setQuickBooking(null)}
        onSaved={async ({ date, branchId, therapistId, notice }) => {
          setQuickBooking(null);
          setQuickBookingNotice(notice);
          setActiveTab('calendar');
          setCalendarDate(date);
          setCalendarBranch(branchId);
          setCalendarTherapist(therapistId);
          if (activeTab === 'calendar' && date === calendarDate && branchId === calendarBranch && therapistId === calendarTherapist) await loadCalendar();
          await loadBookingsFromBackend();
        }}
      />}

      {/* TAB CONTENT: SERVICES CATALOGUE MANAGER */}
      {activeTab === 'services' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{t.services}</h2>
              <p className="text-xs text-stone-500">{tr("Add, edit, deactivate, or remove services. Changes appear on the booking portal immediately after saving.")}</p>
            </div>
            <button
              onClick={addServiceRow}
              className="px-4 py-2 bg-amber-700 text-white rounded-xl text-xs font-bold hover:bg-amber-800 transition flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" /> {t.addService}
            </button>
          </div>

          {servicesError && (
            <p role="alert" className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{tr(servicesError)}</p>
          )}
          {serviceSaveError && (
            <p role="alert" className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{tr(serviceSaveError)}</p>
          )}
          {serviceSaveMessage && (
            <p role="status" className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{tr(serviceSaveMessage)}</p>
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
                  <th className="p-2">{tr("Tax rate")}</th>
                  <th className="p-2">{t.isRmt}</th>
                  <th className="p-2">{tr("Active")}</th>
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
                        placeholder={tr("Description")}
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
                          <option key={cat} value={cat}>{tr(cat)}</option>
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
                        aria-label={tr("Remove {value0}", { value0: s.name || 'service' })}
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
              {isSavingServices ? tr("Saving…") : tr("Save services")}
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: BRANCHES MANAGER */}
      {activeTab === 'branches' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{tr("Branches")}</h2>
              <p className="text-xs text-stone-500">{tr("Add, edit, or deactivate locations. Changes appear on the booking portal immediately after saving.")}</p>
            </div>
            <button
              onClick={addBranchRow}
              className="px-4 py-2 bg-amber-700 text-white rounded-xl text-xs font-bold hover:bg-amber-800 transition flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" />{tr("Add branch")}</button>
          </div>

          {branchesError && (
            <p role="alert" className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{tr(branchesError)}</p>
          )}
          {branchSaveError && (
            <p role="alert" className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{tr(branchSaveError)}</p>
          )}
          {branchSaveMessage && (
            <p role="status" className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{tr(branchSaveMessage)}</p>
          )}

          <div className="space-y-3">
            {branchForm.map((branch) => (
              <div key={branch.id} className="grid gap-2.5 sm:grid-cols-12 items-center border border-stone-200 rounded-xl p-3">
                <input
                  type="text"
                  placeholder={tr("Branch name")}
                  value={branch.name}
                  onChange={(e) => updateBranchField(branch.id, 'name', e.target.value)}
                  className="sm:col-span-3 p-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder={tr("Street address")}
                  value={branch.address}
                  onChange={(e) => updateBranchField(branch.id, 'address', e.target.value)}
                  className="sm:col-span-3 p-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder={tr("City, Province")}
                  value={branch.city}
                  onChange={(e) => updateBranchField(branch.id, 'city', e.target.value)}
                  className="sm:col-span-2 p-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder={tr("Phone")}
                  value={branch.phone}
                  onChange={(e) => updateBranchField(branch.id, 'phone', e.target.value)}
                  className="sm:col-span-2 p-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <label className="sm:col-span-1 flex items-center gap-1.5 text-[11px] font-semibold text-stone-600">
                  <input
                    type="checkbox"
                    checked={branch.active !== false}
                    onChange={(e) => updateBranchField(branch.id, 'active', e.target.checked)}
                  />{tr("Active")}</label>
                <button
                  type="button"
                  onClick={() => removeBranchRow(branch.id)}
                  className="sm:col-span-1 inline-flex items-center justify-center text-red-600 hover:text-red-800"
                  aria-label={tr("Remove {value0}", { value0: branch.name || 'branch' })}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <fieldset className="sm:col-span-12 pt-1 border-t border-stone-100 mt-1">
                  <legend className="text-xs font-bold text-stone-700">{tr("Customer payment choices (enable at least one)")}</legend>
                  <div className="flex flex-wrap gap-4 mt-2">
                    {[['clinic', 'allowClinicPayment', 'Pay at clinic (no deposit)'], ['deposit', 'allowDepositPayment', '$10 deposit'], ['full', 'allowFullPayment', 'Pay in full online']].map(([option, field, label]) => (
                      <label key={option} className="flex items-center gap-1.5 text-xs text-stone-600">
                        <input type="checkbox" checked={branchPaymentOptions(branch)[option]} onChange={(e) => updateBranchField(branch.id, field, e.target.checked)} />
                        {tr(label)}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={saveBranchForm}
              disabled={isSavingBranches}
              className="px-5 py-2.5 bg-emerald-800 text-white font-semibold rounded-xl hover:bg-emerald-900 disabled:opacity-50 transition text-sm"
            >
              {isSavingBranches ? tr("Saving…") : tr("Save branches")}
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: AVAILABILITY */}
      {activeTab === 'availability' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{tr("Availability")}</h2>
              <p className="text-xs text-stone-500">{tr("Block off business-wide closures or a single therapist's breaks/time off. Blocks automatically stop new bookings and show up on the Booking Calendar and in the therapist portal.")}</p>
            </div>
            <form onSubmit={createUnavailabilityBlock} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-stone-600">{tr("Scope")}<select value={unavailabilityForm.scope} onChange={(e) => setUnavailabilityForm((current) => ({ ...current, scope: e.target.value, therapistName: e.target.value === 'business' ? '' : current.therapistName }))} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm">
                  <option value="business">{tr("Business-wide closure")}</option>
                  <option value="therapist">{tr("Single therapist")}</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-stone-600">{tr("Branch (optional)")}<select value={unavailabilityForm.branchName} onChange={(e) => setUnavailabilityForm((current) => ({ ...current, branchName: e.target.value }))} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm">
                  <option value="">{tr("All branches")}</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.address || branch.name}>{branch.name}</option>)}
                </select>
              </label>
              {unavailabilityForm.scope === 'therapist' && (
                <label className="text-xs font-semibold text-stone-600">{tr("Therapist")}<select required value={unavailabilityForm.therapistName} onChange={(e) => setUnavailabilityForm((current) => ({ ...current, therapistName: e.target.value }))} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm">
                    <option value="">{tr("Select therapist")}</option>
                    {therapists.map((therapist) => <option key={therapist.id} value={therapist.name}>{therapist.name}</option>)}
                  </select>
                </label>
              )}
              <label className="text-xs font-semibold text-stone-600">{tr("Date")}<input type="date" required value={unavailabilityForm.date} onChange={(e) => setUnavailabilityForm((current) => ({ ...current, date: e.target.value }))} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-stone-600">{tr("Start time")}<input type="time" required value={unavailabilityForm.startTime} onChange={(e) => setUnavailabilityForm((current) => ({ ...current, startTime: e.target.value }))} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-stone-600">{tr("End time")}<input type="time" required value={unavailabilityForm.endTime} onChange={(e) => setUnavailabilityForm((current) => ({ ...current, endTime: e.target.value }))} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-stone-600 sm:col-span-2">{tr("Reason (optional)")}<input type="text" value={unavailabilityForm.reason} onChange={(e) => setUnavailabilityForm((current) => ({ ...current, reason: e.target.value }))} placeholder={tr("Holiday closure, staff training, break…")} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </label>
              <div className="flex items-end">
                <button type="submit" disabled={isSavingUnavailability} className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-900 disabled:opacity-50">{isSavingUnavailability ? tr("Saving…") : tr("Add block")}</button>
              </div>
            </form>
            {unavailabilitySaveError && <p className="text-sm font-medium text-red-600">{tr(unavailabilitySaveError)}</p>}
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-900">{tr("Scheduled blocks")}</h3>
              <button onClick={loadUnavailability} disabled={isLoadingUnavailability} className="text-xs font-semibold text-emerald-800 hover:underline disabled:opacity-50">{tr("Refresh")}</button>
            </div>
            {unavailabilityLoadError && <p className="px-6 py-3 text-sm text-red-600">{tr(unavailabilityLoadError)}</p>}
            {unavailabilityBlocks.length ? (
              <div className="divide-y divide-stone-100">
                {unavailabilityBlocks.map((block) => (
                  <div key={block.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                    <div>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${block.scope === 'business' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{block.scope === 'business' ? tr("Business-wide") : block.therapistName}</span>
                      <p className="mt-1 text-sm font-semibold text-stone-800">{block.date} · {block.startTime}–{block.endTime} {block.branchName ? tr("· {value0}", { value0: block.branchName }) : ''}</p>
                      {block.reason && <p className="text-xs text-stone-500">{block.reason}</p>}
                    </div>
                    <button onClick={() => deleteUnavailabilityBlock(block.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />{tr("Remove")}</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-6 py-6 text-sm text-stone-500">{isLoadingUnavailability ? tr("Loading…") : tr("No blocks scheduled.")}</p>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: STAFF & THERAPISTS */}
      {activeTab === 'staff' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{t.staff}</h2>
              <p className="text-xs text-stone-500">{tr("Manage registered therapists, credentials, and which branch each therapist works at on each day of the week — supports rotation between branches. Changes sync to the booking portal and the therapist portal.")}</p>
            </div>
            <button
              onClick={addTherapistRow}
              className="px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold hover:bg-emerald-900 transition flex items-center shadow-sm"
            >
              <Plus className="w-4 h-4 mr-1.5" /> {t.addTherapist}
            </button>
          </div>

          {therapistsError && (
            <p role="alert" className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{tr(therapistsError)}</p>
          )}
          {therapistSaveError && (
            <p role="alert" className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{tr(therapistSaveError)}</p>
          )}
          {therapistSaveMessage && (
            <p role="status" className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{tr(therapistSaveMessage)}</p>
          )}

          <div className="space-y-4">
            {therapistForm.map((th) => (
              <div key={th.id} className="p-4 rounded-xl border border-stone-200 bg-stone-50/50 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">{tr("Full Name *")}</label>
                    <input
                      type="text"
                      placeholder={tr("e.g. Somsak P., RMT")}
                      value={th.name}
                      onChange={(e) => updateTherapistField(th.id, 'name', e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">{tr("Rating (1.0 - 5.0)")}</label>
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
                  <label className="block text-xs font-bold text-stone-700 mb-1">{tr("Professional Bio / Specialty")}</label>
                  <input
                    type="text"
                    placeholder={tr("e.g. 8+ years deep tissue and Wat Pho traditional practitioner")}
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
                    <span>{tr("Traditional Thai Certified")}</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer font-medium text-stone-800">
                    <input
                      type="checkbox"
                      checked={th.rmtCertified}
                      onChange={(e) => updateTherapistField(th.id, 'rmtCertified', e.target.checked)}
                      className="rounded text-blue-700 focus:ring-blue-600 w-4 h-4"
                    />
                    <span>{tr("RMT Healthcare Certified (Ontario CMTO)")}</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer font-medium text-stone-800">
                    <input
                      type="checkbox"
                      checked={th.active !== false}
                      onChange={(e) => updateTherapistField(th.id, 'active', e.target.checked)}
                      className="rounded text-emerald-700 focus:ring-emerald-600 w-4 h-4"
                    />
                    <span>{tr("Active")}</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">{tr("Branch rotation — pick which branch this therapist works at on each day (leave \"Off\" if they don't work that day)")}</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                    {WEEKDAYS.map((day) => (
                      <div key={day.key}>
                        <label className="block text-[10px] font-bold text-stone-500 mb-0.5 uppercase">{tr(day.label)}</label>
                        <select
                          value={th.schedule?.[day.key] ?? ''}
                          onChange={(e) => updateTherapistScheduleDay(th.id, day.key, e.target.value)}
                          className="w-full p-1.5 text-[11px] rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                        >
                          <option value="">{tr("Off")}</option>
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
              <div className="col-span-full py-8 text-center text-stone-400 text-xs">{tr("No therapists listed. Click \"")}{t.addTherapist}{tr("\" above to register staff members.")}</div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={saveTherapistForm}
              disabled={isSavingTherapists}
              className="px-5 py-2.5 bg-emerald-800 text-white font-semibold rounded-xl hover:bg-emerald-900 disabled:opacity-50 transition text-sm"
            >
              {isSavingTherapists ? tr("Saving…") : tr("Save therapists & rotation")}
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
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-200">{tr("Reward your regulars")}</p>
                    <h2 className="mt-1 text-xl font-bold">{tr("MY THAI THAI Rewards")}</h2>
                    <p className="mt-1 max-w-2xl text-sm text-indigo-100">{tr("Manage member tiers, award points for completed visits, and record in-clinic reward redemptions.")}</p>
                  </div>
                </div>
                <button type="button" onClick={loadLoyaltyDashboard} disabled={isLoadingLoyalty} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLoyalty ? 'animate-spin' : ''}`} />{tr("Refresh")}</button>
              </div>
            </div>
          </section>

          {loyaltyError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{tr(loyaltyError)}</div>}
          {loyaltyNotice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{tr(loyaltyNotice)}</div>}
          {isLoadingLoyalty && !loyaltyDashboard && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{tr("Loading loyalty members and rewards…")}</div>}

          {loyaltyDashboard && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ['Members', loyaltyDashboard.summary.members.toLocaleString(locale), Users, 'bg-blue-50 text-blue-700'],
                  ['Points outstanding', loyaltyDashboard.summary.availablePoints.toLocaleString(locale), Sparkles, 'bg-indigo-50 text-indigo-700'],
                  ['Visits ready to award', loyaltyDashboard.summary.pendingVisits.toLocaleString(locale), CheckCircle2, 'bg-emerald-50 text-emerald-700'],
                ].map(([label, value, Icon, style]) => (
                  <section key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{tr(label)}</span><span className={`rounded-lg p-2 ${style}`}><Icon className="h-4 w-4" /></span></div>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{typeof value === 'string' ? tr(value) : value}</p>
                  </section>
                ))}
              </div>

              <form onSubmit={saveLoyaltySettings} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{tr("Program settings")}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{tr("Configure Standard, Gold and Platinum benefits. Point awards use service amounts actually paid, and existing ledger entries are unchanged.")}</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                    <input type="checkbox" checked={loyaltySettings.enabled} onChange={(event) => setLoyaltySettings((current) => ({ ...current, enabled: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-600" />{tr("Program accepting members")}</label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs font-semibold text-slate-600">{tr("Standard points per $1 paid")}<input type="number" min="0.01" max="100" step="0.01" required value={loyaltySettings.pointsPerDollar} onChange={(event) => setLoyaltySettings((current) => ({ ...current, pointsPerDollar: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">{tr("First single-session multiplier")}<input type="number" min="1" max="100" step="0.1" required value={loyaltySettings.firstSessionMultiplier} onChange={(event) => setLoyaltySettings((current) => ({ ...current, firstSessionMultiplier: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">{tr("Points per reward")}<input type="number" min="1" max="1000000" step="1" required value={loyaltySettings.redemptionPoints} onChange={(event) => setLoyaltySettings((current) => ({ ...current, redemptionPoints: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">{tr("Reward value ($)")}<input type="number" min="0.01" max="10000" step="0.01" required value={loyaltySettings.redemptionValue} onChange={(event) => setLoyaltySettings((current) => ({ ...current, redemptionValue: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                  </label>
                </div>
                <section className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                  <h4 className="text-sm font-semibold text-indigo-950">{tr("Gold monthly")}</h4>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-xs font-semibold text-slate-700">{tr("Monthly fee ($)")}<input type="number" min="0" max="100000" step="0.01" required value={loyaltySettings.membershipPlans.gold.monthlyFee} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, gold: { ...current.membershipPlans.gold, monthlyFee: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">{tr("Service discount (%)")}<input type="number" min="0" max="100" step="0.1" required value={loyaltySettings.membershipPlans.gold.discountPercent} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, gold: { ...current.membershipPlans.gold, discountPercent: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">{tr("Points multiplier")}<input type="number" min="0" max="100" step="0.1" required value={loyaltySettings.membershipPlans.gold.pointsMultiplier} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, gold: { ...current.membershipPlans.gold, pointsMultiplier: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">{tr("Free Hot Stone add-ons / month")}<input type="number" min="0" max="100" step="1" required value={loyaltySettings.membershipPlans.gold.freeHotStonePerMonth} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, gold: { ...current.membershipPlans.gold, freeHotStonePerMonth: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                  </div>
                </section>
                <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <h4 className="text-sm font-semibold text-amber-950">{tr("Platinum company top-up")}</h4>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-xs font-semibold text-slate-700">{tr("Top-up price ($)")}<input type="number" min="0" max="100000" step="0.01" required value={loyaltySettings.membershipPlans.platinum.topUpPrice} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, platinum: { ...current.membershipPlans.platinum, topUpPrice: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">{tr("Prepaid hours")}<input type="number" min="0.01" max="10000" step="0.25" required value={loyaltySettings.membershipPlans.platinum.includedHours} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, platinum: { ...current.membershipPlans.platinum, includedHours: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">{tr("Service discount (%)")}<input type="number" min="0" max="100" step="0.1" required value={loyaltySettings.membershipPlans.platinum.discountPercent} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, platinum: { ...current.membershipPlans.platinum, discountPercent: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">{tr("Hot Stone add-on discount ($)")}<input type="number" min="0" max="10000" step="0.01" required value={loyaltySettings.membershipPlans.platinum.hotStoneDiscount} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, platinum: { ...current.membershipPlans.platinum, hotStoneDiscount: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700" title={tr("Charged only when a Platinum member adds the Hot Stone add-on to a booking.")}>{tr("Platinum Hot Stone surcharge ($)")}<input type="number" min="0" max="10000" step="0.01" required value={loyaltySettings.membershipPlans.platinum.hotStoneSurcharge} onChange={(event) => setLoyaltySettings((current) => ({ ...current, membershipPlans: { ...current.membershipPlans, platinum: { ...current.membershipPlans.platinum, hotStoneSurcharge: event.target.value } } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                  </div>
                  <p className="text-[11px] leading-5 text-slate-600">{tr("Company employees are matched by their enrolled email and optional company ID. Record a confirmed top-up from the member row; completed visits consume their service duration from the hours balance.")}</p>
                </section>
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div><h4 className="text-sm font-semibold text-slate-900">{tr("Member tiers")}</h4><p className="mt-0.5 text-[11px] text-slate-500">{tr("Tier level is based on lifetime points earned. The first tier must begin at 0 points.")}</p></div>
                    <button type="button" disabled={loyaltySettings.tiers.length >= 6} onClick={() => setLoyaltySettings((current) => ({ ...current, tiers: [...current.tiers, { name: `Tier ${current.tiers.length + 1}`, threshold: Number(current.tiers[current.tiers.length - 1]?.threshold || 0) + 500 }] }))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">{tr("Add tier")}</button>
                  </div>
                  <div className="space-y-2">
                    {loyaltySettings.tiers.map((tier, index) => (
                      <div key={`tier-${index}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                        <label className="sr-only" htmlFor={`loyalty-tier-name-${index}`}>{tr("Tier")} {index + 1} {tr("name")}</label>
                        <input id={`loyalty-tier-name-${index}`} required maxLength={40} value={tier.name} onChange={(event) => setLoyaltySettings((current) => ({ ...current, tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-xs" placeholder={tr("Tier name")} />
                        <label className="sr-only" htmlFor={`loyalty-tier-points-${index}`}>{tr("Tier")} {index + 1} {tr("points threshold")}</label>
                        <input id={`loyalty-tier-points-${index}`} type="number" min={index === 0 ? 0 : 1} step="1" required value={tier.threshold} disabled={index === 0} onChange={(event) => setLoyaltySettings((current) => ({ ...current, tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, threshold: event.target.value } : item) }))} className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:bg-slate-50" placeholder={tr("Points threshold")} />
                        <button type="button" aria-label={tr("Remove tier {value0}", { value0: tier.name || index + 1 })} disabled={index === 0} onClick={() => setLoyaltySettings((current) => ({ ...current, tiers: current.tiers.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-lg border border-slate-200 px-3 text-slate-500 hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30"><X className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-[11px] leading-5 text-slate-500">{tr("Example reward:")} {loyaltySettings.redemptionPoints || 0} {tr("points = $")}{Number(loyaltySettings.redemptionValue || 0).toFixed(2)} {tr("off in clinic.")}</p>
                  <button type="submit" disabled={isSavingLoyalty || isLoadingLoyalty} className="inline-flex items-center gap-2 rounded-lg bg-indigo-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">{isSavingLoyalty ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{tr("Save program settings")}</button>
                </div>
              </form>

              <form onSubmit={onboardLoyaltyMember} className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm sm:p-6">
                <div><h3 className="text-base font-semibold text-slate-900">{tr("Onboard a member")}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{tr("Find a recent customer by name, email or phone. For Platinum, use the employee's work email, add the company and ID, then optionally confirm the initial payment and add the configured hours in this same step.")}</p></div>
                <div className="relative max-w-xl">
                  <label className="relative block">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input type="search" value={loyaltyOnboardingSearch} onChange={(event) => setLoyaltyOnboardingSearch(event.target.value)} placeholder={tr("Find a booking customer by name, email or phone")} aria-label={tr("Find a customer to enroll")} className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
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
                            <span className="block text-[11px] text-slate-500">{customer.email}{customer.phone ? tr(" · {value0}", { value0: customer.phone }) : ''}</span>
                          </button>
                        ))}
                      </div>
                    ) : <p className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 shadow-lg">{tr("No booking customer matches that search.")}</p>;
                  })()}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-xs font-semibold text-slate-600">{tr("Member name")}<input required maxLength={120} value={newLoyaltyMember.name} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, name: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-600">{tr("Email")}<input required type="email" maxLength={254} value={newLoyaltyMember.email} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, email: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-600">{tr("Phone (optional)")}<input type="tel" maxLength={50} value={newLoyaltyMember.phone} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, phone: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-600">{tr("Membership type")}<select value={newLoyaltyMember.membershipType} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, membershipType: event.target.value, organization: event.target.value === 'platinum' ? current.organization : '', companyId: event.target.value === 'platinum' ? current.companyId : '', paidThrough: event.target.value === 'gold' ? current.paidThrough : '', initialTopUpPaid: event.target.value === 'platinum' ? current.initialTopUpPaid : false }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option value="regular">{tr("Standard · Free points")}</option><option value="gold">{tr("Gold · Monthly")}</option><option value="platinum">{tr("Platinum · Company top-up")}</option></select></label>
                  {newLoyaltyMember.membershipType === 'platinum' && <>
                    <label className="text-xs font-semibold text-slate-600">{tr("Company name")}<input required maxLength={120} value={newLoyaltyMember.organization} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, organization: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                    <label className="text-xs font-semibold text-slate-600">{tr("Company ID (optional if using work email)")}<input maxLength={120} value={newLoyaltyMember.companyId} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, companyId: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                    <label className="text-xs font-semibold text-slate-600">{tr("Company registration/contact email")}<input type="email" maxLength={254} value={newLoyaltyMember.companyContactEmail} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, companyContactEmail: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder={tr("Company contact email")} /></label>
                    <label className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs leading-5 text-indigo-950">
                      <input type="checkbox" checked={newLoyaltyMember.isPrimaryOwner} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, isPrimaryOwner: event.target.checked, initialTopUpPaid: event.target.checked ? current.initialTopUpPaid : false }))} className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-700" />
                      <span><strong>{tr("Primary owner/contact:")}</strong> {tr("this person's own top-ups fund the one shared prepaid-hour balance for")} {newLoyaltyMember.organization || tr("this company")}{tr(". Every employee draws from that same pool — leave unchecked for a regular employee (they cannot be topped up directly).")}</span>
                    </label>
                    <label className={`sm:col-span-2 flex items-start gap-2 rounded-lg border p-3 text-xs leading-5 ${newLoyaltyMember.isPrimaryOwner ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                      <input type="checkbox" disabled={!newLoyaltyMember.isPrimaryOwner} checked={newLoyaltyMember.initialTopUpPaid} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, initialTopUpPaid: event.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-700" />
                      <span><strong>{tr("Payment confirmed:")}</strong> {tr("record the configured $")}{Number(loyaltySettings.membershipPlans.platinum.topUpPrice).toFixed(2)} {tr("top-up and add")} {loyaltySettings.membershipPlans.platinum.includedHours} {tr("hours now.")}{!newLoyaltyMember.isPrimaryOwner ? tr(" Only the primary owner/contact can be topped up.") : tr(" Leave unchecked for a pending company claim.")}</span>
                    </label>
                  </>}
                  {newLoyaltyMember.membershipType === 'gold' && <label className="text-xs font-semibold text-slate-600">{tr("Paid through")}<input type="date" value={newLoyaltyMember.paidThrough} onChange={(event) => setNewLoyaltyMember((current) => ({ ...current, paidThrough: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>}
                </div>
                <button type="submit" disabled={isOnboardingLoyaltyMember || !loyaltySettings.enabled} className="inline-flex items-center gap-2 rounded-lg bg-indigo-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">{isOnboardingLoyaltyMember ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}{isOnboardingLoyaltyMember ? tr("Saving membership…") : newLoyaltyMember.membershipType === 'platinum' && newLoyaltyMember.initialTopUpPaid ? tr("Enroll & record paid top-up") : tr("Save member & email details")}</button>
              </form>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-900">{tr("Confirm completed visits")}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{tr("Confirm completed, paid member visits, redeem a Gold monthly Hot Stone add-on, or consume Platinum prepaid hours. Each visit can only be recorded once.")}</p>
                </div>
                {loyaltyDashboard.eligibleBookings.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-5 py-3">{tr("Member")}</th><th className="px-4 py-3">{tr("Visit")}</th><th className="px-4 py-3 text-right">{tr("Paid")}</th><th className="px-5 py-3 text-right">{tr("Points")}</th><th className="px-5 py-3 text-right">{tr("Action")}</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {loyaltyDashboard.eligibleBookings.map((booking) => (
                          <tr key={booking.id}>
                            <td className="px-5 py-3 font-medium text-slate-900">{booking.customerName}<span className="mt-0.5 block text-[10px] font-normal text-slate-500">{booking.email}</span></td>
                            <td className="px-4 py-3 text-slate-700">{booking.date}<span className="mt-0.5 block text-[10px] text-slate-500">{tr(booking.serviceName)} · {booking.id}</span></td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-700">${booking.paidAmount.toFixed(2)}</td>
                            <td className="px-5 py-3 text-right font-semibold text-indigo-800">{booking.points ? tr("+{value0} pts", { value0: booking.points }) : booking.hoursToUse ? tr("{value0} hrs", { value0: booking.hoursToUse.toFixed(2) }) : booking.freeHotStone ? tr("Free add-on") : '—'}{booking.firstSession && <span className="mt-0.5 block text-[10px] font-normal">{tr("First session ·")} {booking.pointsMultiplier}{tr("x")}</span>}</td>
                            <td className="px-5 py-3 text-right"><button type="button" disabled={loyaltyActionId === booking.id || !loyaltySettings.enabled} onClick={() => awardLoyaltyPoints(booking)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-950 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />{loyaltyActionId === booking.id ? tr("Awarding…") : tr("Confirm & award")}</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="p-6 text-center text-sm text-slate-500">{tr("No completed member visits or benefits are waiting to be recorded.")}</p>}
              </section>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div><h3 className="text-base font-semibold text-slate-900">{tr("Members & balances")}</h3><p className="mt-1 text-xs text-slate-500">{tr("Search by member, email, phone, company or company ID; check eligibility, record top-ups and redeem points.")}</p></div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <label className="sr-only" htmlFor="loyalty-member-type-filter">{tr("Filter members by membership type")}</label>
                    <select id="loyalty-member-type-filter" value={loyaltyMemberTypeFilter} onChange={(event) => setLoyaltyMemberTypeFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <option value="all">{tr("All memberships")}</option><option value="gold">{tr("Gold")}</option><option value="platinum">{tr("Platinum company")}</option><option value="silver">{tr("Legacy Silver")}</option><option value="regular">{tr("Standard points")}</option>
                    </select>
                    <label className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input type="search" value={loyaltyMemberSearch} onChange={(event) => setLoyaltyMemberSearch(event.target.value)} placeholder={tr("Search member or company")} aria-label={tr("Search loyalty members")} className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
                  </div>
                </div>
                {(() => {
                  const filteredMembers = loyaltyDashboard.members
                    .filter((member) => loyaltyMemberTypeFilter === 'all' || member.membershipType === loyaltyMemberTypeFilter)
                    .filter((member) => [member.name, member.email, member.phone, member.organization, member.companyId, member.companyContactEmail].some((value) => (value || '').toLowerCase().includes(loyaltyMemberSearch.trim().toLowerCase())));
                  return filteredMembers.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[920px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-5 py-3">{tr("Member")}</th><th className="px-4 py-3">{tr("Membership")}</th><th className="px-4 py-3">{tr("Eligibility")}</th><th className="px-4 py-3 text-right">{tr("Balance")}</th><th className="px-4 py-3 text-right">{tr("Lifetime earned")}</th><th className="px-5 py-3 text-right">{tr("Actions")}</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredMembers.map((member) => (
                            <tr key={member.email} className="hover:bg-slate-50">
                              <td className="px-5 py-3 font-medium text-slate-900">{member.name || tr("Member")}<span className="mt-0.5 block text-[10px] font-normal text-slate-500">{member.email}{member.phone ? tr(" · {value0}", { value0: member.phone }) : ''}</span></td>
                              <td className="px-4 py-3"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-800">{member.membershipType === 'gold' ? tr("Gold") : member.membershipType === 'platinum' ? tr("Platinum · Company") : member.membershipType === 'silver' ? tr("Legacy Silver · Corporate") : tr("Standard · {value0}", { value0: member.tier })}</span>{member.membershipType === 'platinum' && member.isPrimaryContact && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{tr("Primary contact")}</span>}{member.organization && <span className="mt-1 block text-[10px] text-slate-500">{member.organization}{member.companyId ? tr(" · ID {value0}", { value0: member.companyId }) : ''}{member.companyContactEmail ? tr(" · Contact: {value0}", { value0: member.companyContactEmail }) : ''}</span>}</td>
                              <td className="px-4 py-3 text-xs">{member.membershipType === 'regular' ? <span className="text-slate-500">{tr("Points program")}</span> : member.membershipType === 'platinum' ? <><span className={member.membershipActive ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{member.membershipActive ? tr("{value0}% off active", { value0: member.membershipDiscountPercent }) : tr("Top-up required")}</span><span className="mt-1 block text-[10px] text-slate-500">{member.prepaidHoursBalance.toFixed(2)} {tr("shared prepaid hours remain · $")}{loyaltySettings.membershipPlans.platinum.hotStoneDiscount} {tr("off Hot Stone add-on")}</span></> : <><span className={member.membershipActive ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{member.membershipActive ? tr("{value0}% off active", { value0: member.membershipDiscountPercent }) : tr("Payment required")}</span><span className="mt-1 block text-[10px] text-slate-500">{tr("Paid through:")} {member.paidThrough || tr("not recorded")}{member.membershipType === 'gold' ? tr(" · Hot Stone add-on {value0} this month", { value0: member.freeHotStoneAvailable ? 'available' : 'used' }) : ''}</span></>}</td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{member.pointsBalance.toLocaleString(locale)} {tr("pts")}{member.membershipType === 'platinum' && <span className="mt-1 block text-[10px] font-normal text-slate-500">{member.prepaidHoursBalance.toFixed(2)} {tr("hrs shared")}</span>}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-600">{member.lifetimePoints.toLocaleString(locale)} {tr("pts")}</td>
                              <td className="space-y-1 px-5 py-3 text-right">
                                <button type="button" disabled={!loyaltySettings.enabled || member.pointsBalance < loyaltySettings.redemptionPoints || !member.receiptCandidates?.length} onClick={() => { setSelectedLoyaltyMember(member); setLoyaltyRedeemPoints(String(loyaltySettings.redemptionPoints)); setLoyaltyRedeemBookingId(member.receiptCandidates?.[0]?.bookingId || ''); }} className="rounded-lg border border-indigo-200 px-3 py-2 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40">{tr("Redeem points")}</button>
                                {member.membershipType === 'platinum' && member.isPrimaryContact && <button type="button" disabled={!loyaltySettings.enabled} onClick={() => setSelectedTopUpMember(member)} className="block ml-auto rounded-lg border border-amber-200 px-3 py-2 text-[11px] font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-40">{tr("Record top-up")}</button>}
                                {member.membershipType === 'platinum' && !member.isPrimaryContact && <button type="button" disabled={loyaltyActionId === member.email} onClick={() => makePrimaryContact(member)} className="block ml-auto rounded-lg border border-indigo-200 px-3 py-2 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-40">{tr("Make primary contact")}</button>}
                                {['gold', 'silver'].includes(member.membershipType) && <button type="button" onClick={() => { setSelectedMembershipPayment(member); setMembershipPaidThrough(member.paidThrough || ''); }} className="block ml-auto rounded-lg border border-emerald-200 px-3 py-2 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50">{tr("Record payment")}</button>}
                                {member.membershipType === 'platinum' && member.organization && member.companyContactEmail && <button type="button" disabled={copyingPortalFor === `${member.organization}:portal`} onClick={() => copyCompanyPortalLink(member, 'portal')} className="block ml-auto rounded-lg border border-sky-200 px-3 py-2 text-[11px] font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-40">{copyingPortalFor === `${member.organization}:portal` ? tr("Copying…") : tr("Copy portal link")}</button>}
                                {member.membershipType === 'platinum' && member.organization && member.companyContactEmail && <button type="button" disabled={copyingPortalFor === `${member.organization}:join`} onClick={() => copyCompanyPortalLink(member, 'join')} className="block ml-auto rounded-lg border border-sky-200 px-3 py-2 text-[11px] font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-40">{copyingPortalFor === `${member.organization}:join` ? tr("Copying…") : tr("Copy employee signup link")}</button>}
                                <button type="button" onClick={() => setMemberPendingRemoval(member)} className="block ml-auto rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50">{tr("Remove member")}</button>
                                {['silver', 'platinum'].includes(member.membershipType) && member.organization && <button type="button" onClick={() => setCompanyPendingRemoval(member.organization)} className="block ml-auto rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50">{tr("Remove company")}</button>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="p-8 text-center text-sm text-slate-500">{loyaltyDashboard.members.length ? tr("No members match your search.") : tr("No members yet. Customers can join Rewards during online booking.")}</p>;
                })()}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-900">{tr("Recent rewards activity")}</h3>
                  <button type="button" onClick={openLedgerReset} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />{tr("Reset ledger")}</button>
                </div>
                <div className="mt-3 divide-y divide-slate-100">
                  {recentLoyaltyTransactions.length ? (
                    recentLoyaltyTransactions.map((transaction) => (
                        <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                          <div><p className="font-semibold text-slate-800">{transaction.memberName}</p><p className="mt-0.5 text-slate-500">{transaction.description} · {transaction.createdAt ? new Date(transaction.createdAt).toLocaleDateString(locale) : ''}{transaction.bookingId ? tr(" · Booking {value0}", { value0: transaction.bookingId }) : ''}{transaction.receiptNumber ? tr(" · Receipt {value0}", { value0: transaction.receiptNumber }) : ''}</p></div>
                          <span className={`font-bold tabular-nums ${transaction.points >= 0 && transaction.hours >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{transaction.hours ? tr("{value0}{value1} hrs", { value0: transaction.hours > 0 ? '+' : '', value1: transaction.hours.toFixed(2) }) : tr("{value0}{value1} pts", { value0: transaction.points > 0 ? '+' : '', value1: transaction.points })}</span>
                        </div>
                      ))
                  ) : <p className="py-4 text-sm text-slate-500">{tr("No reward activity recorded yet.")}</p>}
                </div>
              </section>
            </>
          )}

          {selectedLoyaltyMember && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedLoyaltyMember(null); }}>
              <form onSubmit={redeemLoyaltyPoints} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="redeem-loyalty-title">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">{tr("In-clinic reward")}</p><h3 id="redeem-loyalty-title" className="mt-1 text-lg font-bold text-slate-900">{tr("Redeem points")}</h3><p className="mt-1 text-xs text-slate-500">{selectedLoyaltyMember.name} · {selectedLoyaltyMember.email}</p></div>
                  <button type="button" onClick={() => setSelectedLoyaltyMember(null)} aria-label={tr("Close redemption dialog")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                </div>
                <p className="rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">{tr("Available:")} <strong>{selectedLoyaltyMember.pointsBalance.toLocaleString(locale)} {tr("points")}</strong>{tr(". Every")} {loyaltySettings.redemptionPoints.toLocaleString(locale)} {tr("points gives $")}{Number(loyaltySettings.redemptionValue).toFixed(2)} {tr("off. Choose the paid booking below; the discount will be linked to its receipt number when staff issue the receipt.")}</p>
                <label className="block text-xs font-semibold text-slate-600">{tr("Points to redeem")}<input type="number" min={loyaltySettings.redemptionPoints} max={selectedLoyaltyMember.pointsBalance} step={loyaltySettings.redemptionPoints} required value={loyaltyRedeemPoints} onChange={(event) => setLoyaltyRedeemPoints(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                </label>
                <label className="block text-xs font-semibold text-slate-600">{tr("Paid booking / receipt to apply the discount to")}<select required value={loyaltyRedeemBookingId} onChange={(event) => setLoyaltyRedeemBookingId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900">
                    {(selectedLoyaltyMember.receiptCandidates || []).map((candidate) => (
                      <option key={candidate.bookingId} value={candidate.bookingId}>{candidate.date} · {tr(candidate.serviceName)} · ${candidate.total.toFixed(2)} · {candidate.bookingId}</option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-600">{tr("Discount to apply")}</span><strong className="text-lg text-indigo-900">${((Number(loyaltyRedeemPoints) / loyaltySettings.redemptionPoints) * loyaltySettings.redemptionValue || 0).toFixed(2)}</strong></div>
                <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setSelectedLoyaltyMember(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">{tr("Cancel")}</button><button type="submit" disabled={!!loyaltyActionId || !loyaltyRedeemBookingId || !Number.isInteger(Number(loyaltyRedeemPoints)) || Number(loyaltyRedeemPoints) < loyaltySettings.redemptionPoints || Number(loyaltyRedeemPoints) > selectedLoyaltyMember.pointsBalance || Number(loyaltyRedeemPoints) % loyaltySettings.redemptionPoints !== 0} className="rounded-lg bg-indigo-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">{loyaltyActionId ? tr("Recording…") : tr("Confirm redemption")}</button></div>
              </form>
            </div>
          )}
          {selectedMembershipPayment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMembershipPayment(null); }}>
              <form onSubmit={recordMembershipPayment} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="membership-payment-title">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">{tr("External payment record")}</p><h3 id="membership-payment-title" className="mt-1 text-lg font-bold text-slate-900">{tr("Record membership payment")}</h3><p className="mt-1 text-xs text-slate-500">{selectedMembershipPayment.membershipType === 'silver' ? selectedMembershipPayment.organization : selectedMembershipPayment.email}</p></div>
                  <button type="button" onClick={() => setSelectedMembershipPayment(null)} aria-label={tr("Close payment dialog")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                </div>
                <p className="rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">{tr("Record the date through which the payment was received.")} {selectedMembershipPayment.membershipType === 'silver' ? tr("This updates all employees onboarded under this corporate account and emails each one.") : tr("This activates the member discount and emails a payment confirmation.")}</p>
                <label className="block text-xs font-semibold text-slate-600">{tr("Paid through")}<input type="date" required value={membershipPaidThrough} onChange={(event) => setMembershipPaidThrough(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                </label>
                <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setSelectedMembershipPayment(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">{tr("Cancel")}</button><button type="submit" disabled={!!loyaltyActionId || !membershipPaidThrough} className="rounded-lg bg-emerald-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{loyaltyActionId ? tr("Recording…") : tr("Record payment & notify")}</button></div>
              </form>
            </div>
          )}
          {selectedTopUpMember && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTopUpMember(null); }}>
              <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="platinum-topup-title">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">{tr("Confirm external payment")}</p><h3 id="platinum-topup-title" className="mt-1 text-lg font-bold text-slate-900">{tr("Record Platinum top-up")}</h3><p className="mt-1 text-xs text-slate-500">{selectedTopUpMember.name} · {selectedTopUpMember.email}</p></div>
                  <button type="button" onClick={() => setSelectedTopUpMember(null)} aria-label={tr("Close Platinum top-up dialog")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                </div>
                <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-950">{tr("Only continue after confirming receipt of")} <strong>${Number(loyaltySettings.membershipPlans.platinum.topUpPrice).toFixed(2)}</strong>{tr(". This adds")} <strong>{loyaltySettings.membershipPlans.platinum.includedHours} {tr("prepaid hours")}</strong> {tr("to")} {selectedTopUpMember.organization || tr("the employee account")}{tr("; completed sessions deduct their duration.")}</p>
                <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setSelectedTopUpMember(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">{tr("Cancel")}</button><button type="button" onClick={recordPlatinumTopUp} disabled={!!loyaltyActionId} className="rounded-lg bg-amber-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{loyaltyActionId ? tr("Recording…") : tr("Payment received · add hours")}</button></div>
              </div>
            </div>
          )}
          {memberPendingRemoval && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMemberPendingRemoval(null); }}>
              <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="remove-member-title">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">{tr("Remove from loyalty program")}</p><h3 id="remove-member-title" className="mt-1 text-lg font-bold text-slate-900">{tr("Remove")} {memberPendingRemoval.name || memberPendingRemoval.email}?</h3><p className="mt-1 text-xs text-slate-500">{memberPendingRemoval.email} · {tr(memberPendingRemoval.membershipType)}</p></div>
                  <button type="button" onClick={() => setMemberPendingRemoval(null)} aria-label={tr("Close remove member dialog")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                </div>
                <p className="rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-950">{tr("This immediately removes the member from the loyalty program. Their points/hours balance and membership benefits will no longer apply. This does not affect past receipts. They will be emailed a notice.")}</p>
                <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setMemberPendingRemoval(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">{tr("Cancel")}</button><button type="button" onClick={removeLoyaltyMember} disabled={isRemovingLoyaltyEntry} className="rounded-lg bg-rose-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{isRemovingLoyaltyEntry ? tr("Removing…") : tr("Remove member")}</button></div>
              </div>
            </div>
          )}
          {isLedgerResetOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsLedgerResetOpen(false); }}>
              <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="reset-ledger-title">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">{tr("Manual reset")}</p><h3 id="reset-ledger-title" className="mt-1 text-lg font-bold text-slate-900">{tr("Clear loyalty ledger")}</h3><p className="mt-1 text-xs text-slate-500">{tr("Deletes recorded points, prepaid hours and redemptions.")}</p></div>
                  <button type="button" onClick={() => setIsLedgerResetOpen(false)} aria-label={tr("Close reset ledger dialog")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[['member', 'One member'], ['all', 'Entire ledger']].map(([value, label]) => (
                    <button key={value} type="button" onClick={() => { setLedgerResetScope(value); setLedgerResetConfirm(''); }} className={`rounded-lg border px-3 py-2.5 text-xs font-semibold ${ledgerResetScope === value ? 'border-rose-700 bg-rose-50 text-rose-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{tr(label)}</button>
                  ))}
                </div>
                {ledgerResetScope === 'member' ? (
                  <label className="block text-xs font-semibold text-slate-600">{tr("Member")}<select value={ledgerResetEmail} onChange={(event) => setLedgerResetEmail(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900">
                      <option value="">{tr("Select a member…")}</option>
                      {(loyaltyDashboard?.members || []).map((member) => (
                        <option key={member.email} value={member.email}>{member.name || member.email} · {member.email}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="block text-xs font-semibold text-slate-600">{tr("Type CLEAR LEDGER to confirm")}<input type="text" value={ledgerResetConfirm} onChange={(event) => setLedgerResetConfirm(event.target.value)} placeholder={tr("CLEAR LEDGER")} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
                  </label>
                )}
                <p className="rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-950">{ledgerResetScope === 'all'
                  ? tr("This permanently deletes every ledger entry for every member. All point balances and Platinum prepaid hours reset to zero. Members themselves are not removed, and past receipts are unaffected. This cannot be undone.")
                  : tr("This permanently deletes every ledger entry for the selected member. Their point balance and Platinum prepaid hours reset to zero. Their membership stays active and past receipts are unaffected. This cannot be undone.")}</p>
                <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setIsLedgerResetOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">{tr("Cancel")}</button><button type="button" onClick={clearLoyaltyLedger} disabled={isClearingLedger || (ledgerResetScope === 'member' ? !ledgerResetEmail : ledgerResetConfirm.trim().toUpperCase() !== 'CLEAR LEDGER')} className="rounded-lg bg-rose-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{isClearingLedger ? tr("Clearing…") : ledgerResetScope === 'all' ? tr("Clear entire ledger") : tr("Clear member ledger")}</button></div>
              </div>
            </div>
          )}
          {companyPendingRemoval && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCompanyPendingRemoval(''); }}>
              <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="remove-company-title">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">{tr("Remove corporate account")}</p><h3 id="remove-company-title" className="mt-1 text-lg font-bold text-slate-900">{tr("Remove all members from")} {companyPendingRemoval}?</h3></div>
                  <button type="button" onClick={() => setCompanyPendingRemoval('')} aria-label={tr("Close remove company dialog")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                </div>
                <p className="rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-950">{tr("This removes every Platinum or Legacy Silver employee enrolled under")} <strong>{companyPendingRemoval}</strong> {tr("from the loyalty program. Each employee will be emailed a removal notice (with the company contact copied, if one is on file). This does not affect past receipts.")}</p>
                <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setCompanyPendingRemoval('')} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">{tr("Cancel")}</button><button type="button" onClick={removeLoyaltyCompany} disabled={isRemovingLoyaltyEntry} className="rounded-lg bg-rose-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{isRemovingLoyaltyEntry ? tr("Removing…") : tr("Remove company")}</button></div>
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
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">{tr("Grow your practice")}</p>
                    <h2 className="mt-1 text-xl font-bold">{tr("Google Ads performance")}</h2>
                    <p className="mt-1 max-w-2xl text-sm text-slate-300">{tr("Explore campaign results over a date range you choose.")}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={loadGoogleAdsReport} disabled={isLoadingGoogleAds} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingGoogleAds ? 'animate-spin' : ''}`} />{tr("Refresh report")}</button>
                  <a href="https://ads.google.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-blue-50">{tr("Open Google Ads")}<Globe className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-[11px] font-semibold text-slate-500">{tr("From")}<input type="date" value={googleAdsStartDate} max={googleAdsEndDate} onChange={(event) => setGoogleAdsStartDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" />
              </label>
              <label className="block text-[11px] font-semibold text-slate-500">{tr("To")}<input type="date" value={googleAdsEndDate} min={googleAdsStartDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setGoogleAdsEndDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" />
              </label>
              <button type="button" onClick={() => loadGoogleAdsReport()} disabled={isLoadingGoogleAds || !googleAdsStartDate || !googleAdsEndDate || googleAdsStartDate > googleAdsEndDate} className="rounded-lg bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">{tr("Apply range")}</button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold text-slate-500">{tr("Quick range")}</span>
              {[7, 30, 90].map((days) => (
                <button key={days} type="button" onClick={() => applyGoogleAdsPreset(days)} disabled={isLoadingGoogleAds} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50">{tr("Last")} {days} {tr("days")}</button>
              ))}
            </div>
          </section>

          {googleAdsError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{tr(googleAdsError)}</div>}
          {isLoadingGoogleAds && !googleAdsReport && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{tr("Connecting securely to Google Ads…")}</div>}

          {googleAdsReport?.configured === false && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertCircle className="h-4 w-4 shrink-0" />{tr("Google Ads reporting is unavailable. Check the server integration settings and refresh.")}</div>
          )}

          {googleAdsReport?.configured && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">{tr("Account")} <span className="font-semibold text-slate-700">{googleAdsReport.customerId}</span> · {googleAdsReport.dateRange}</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{tr("Connected")}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {[
                  ['Impressions', Number(googleAdsReport.totals.impressions).toLocaleString(locale), Eye, 'bg-blue-50 text-blue-700'],
                  ['Clicks', Number(googleAdsReport.totals.clicks).toLocaleString(locale), MousePointerClick, 'bg-violet-50 text-violet-700'],
                  ['Ad spend', googleAdsReport.currencyCode ? new Intl.NumberFormat(locale, { style: 'currency', currency: googleAdsReport.currencyCode }).format(googleAdsReport.totals.cost) : `${Number(googleAdsReport.totals.cost).toLocaleString(locale)} (currency unavailable)`, DollarSign, 'bg-amber-50 text-amber-700'],
                  ['Conversions', Number(googleAdsReport.totals.conversions).toLocaleString(locale, { maximumFractionDigits: 1 }), CheckCircle2, 'bg-emerald-50 text-emerald-700'],
                ].map(([label, value, Icon, iconStyle]) => (
                  <section key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-slate-500">{tr(label)}</span><span className={`rounded-lg p-2 ${iconStyle}`}><Icon className="h-4 w-4" /></span></div>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{typeof value === 'string' ? tr(value) : value}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{googleAdsReport.dateRange}</p>
                  </section>
                ))}
              </div>
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div><h3 className="text-base font-semibold text-slate-900">{tr("Campaigns")}</h3><p className="mt-1 text-xs text-slate-500">{tr("Search, filter and sort results for the selected reporting period.")}</p></div>
                  <span className="text-xs text-slate-500">{visibleGoogleAdsCampaigns.length} {tr("of")} {googleAdsReport.campaigns.length} {tr("campaigns")}</span>
                </div>
                <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                  <label className="relative min-w-[190px] flex-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input type="search" value={googleAdsCampaignSearch} onChange={(event) => setGoogleAdsCampaignSearch(event.target.value)} placeholder={tr("Search campaigns")} aria-label={tr("Search campaigns")} className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </label>
                  <label className="sr-only" htmlFor="google-ads-status">{tr("Campaign status")}</label>
                  <select id="google-ads-status" value={googleAdsCampaignStatus} onChange={(event) => setGoogleAdsCampaignStatus(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                    <option value="all">{tr("All statuses")}</option>
                    <option value="ENABLED">{tr("Enabled")}</option>
                    <option value="PAUSED">{tr("Paused")}</option>
                  </select>
                  <label className="sr-only" htmlFor="google-ads-sort">{tr("Sort campaigns by")}</label>
                  <select id="google-ads-sort" value={googleAdsCampaignSort} onChange={(event) => setGoogleAdsCampaignSort(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                    <option value="impressions">{tr("Sort: Impressions")}</option>
                    <option value="clicks">{tr("Sort: Clicks")}</option>
                    <option value="cost">{tr("Sort: Spend")}</option>
                    <option value="conversions">{tr("Sort: Conversions")}</option>
                    <option value="name">{tr("Sort: Name")}</option>
                  </select>
                </div>
                {visibleGoogleAdsCampaigns.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-5 py-3">{tr("Campaign")}</th><th className="px-4 py-3">{tr("Status")}</th><th className="px-4 py-3 text-right">{tr("Impressions")}</th><th className="px-4 py-3 text-right">{tr("Clicks")}</th><th className="px-4 py-3 text-right">{tr("Spend")}</th><th className="px-5 py-3 text-right">{tr("Conversions")}</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleGoogleAdsCampaigns.map((campaign) => (
                          <tr key={campaign.id} className="hover:bg-slate-50">
                            <td className="px-5 py-3 font-medium text-slate-900">{campaign.name}<span className="mt-0.5 block text-[10px] font-normal text-slate-400">{tr("ID")} {campaign.id}</span></td>
                            <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${campaign.status === 'ENABLED' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{tr(campaign.status.toLowerCase().replaceAll('_', ' '))}</span></td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-700">{campaign.impressions.toLocaleString(locale)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-700">{campaign.clicks.toLocaleString(locale)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-700">{googleAdsReport.currencyCode ? new Intl.NumberFormat(locale, { style: 'currency', currency: googleAdsReport.currencyCode }).format(campaign.cost) : campaign.cost.toLocaleString(locale)}</td>
                            <td className="px-5 py-3 text-right tabular-nums text-slate-700">{campaign.conversions.toLocaleString(locale, { maximumFractionDigits: 1 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="p-8 text-center text-sm text-slate-500">{googleAdsReport.campaigns.length ? tr("No campaigns match the current search and filters.") : tr("No campaigns were returned for the selected dates.")}</p>}
              </section>
              <p className="text-xs leading-5 text-slate-500">{tr("Reporting is read-only. Create, edit, and manage budgets from Google Ads. Metrics are provided by Google Ads and may be delayed.")}</p>
            </>
          )}
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-amber-900 px-5 py-6 text-white sm:px-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className="rounded-xl bg-white/10 p-3 text-amber-200"><Star className="h-5 w-5" /></span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">{tr("Grow your practice")}</p>
                    <h2 className="mt-1 text-xl font-bold">{tr("Google Reviews")}</h2>
                    <p className="mt-1 max-w-2xl text-sm text-slate-300">{tr("See your latest Google Business Profile reviews and rating at a glance.")}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={loadGoogleReviews} disabled={isLoadingGoogleReviews} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingGoogleReviews ? 'animate-spin' : ''}`} />{tr("Refresh")}</button>
                  {googleReviews?.reviewUrl && (
                    <button type="button" onClick={openReviewRequests} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-amber-50">{tr("Ask for a review")}<Mail className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {googleReviews?.mapsUrl && (
                    <a href={googleReviews.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-amber-50">{tr("View on Google")}</a>
                  )}
                </div>
              </div>
            </div>
          </section>

          {googleReviewsError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{tr(googleReviewsError)}</div>}
          {isLoadingGoogleReviews && !googleReviews && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{tr("Fetching your Google reviews…")}</div>}

          {googleReviews?.enabled === false && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertCircle className="h-4 w-4 shrink-0" />{tr("Google Reviews are not connected yet. Add")}<code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono">GOOGLE_PLACES_API_KEY</code> {tr("and")} <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono">GOOGLE_PLACE_ID</code>{tr("to the server environment, then refresh.")}</div>
          )}

          {googleReviews?.enabled && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium text-slate-500">{tr("Average rating")}</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-950">{googleReviews.rating?.toFixed(1) ?? '—'}</span>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star key={index} className={`h-4 w-4 ${index < Math.round(googleReviews.rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      ))}
                    </div>
                  </div>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium text-slate-500">{tr("Total ratings")}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-950">{Number(googleReviews.totalRatings || 0).toLocaleString(locale)}</p>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium text-slate-500">{tr("Business")}</p>
                  <p className="mt-2 truncate text-lg font-semibold text-slate-950">{googleReviews.businessName || tr("Not available")}</p>
                </section>
              </div>

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-900">{tr("Most recent reviews")}</h3>
                  <p className="mt-1 text-xs text-slate-500">{tr("Google surfaces up to 5 recent reviews through the Places API.")}</p>
                </div>
                {googleReviews.reviews.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">{tr("No reviews are available yet.")}</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {googleReviews.reviews.map((review, index) => (
                      <li key={`${review.authorName}-${index}`} className="flex gap-3 px-5 py-4">
                        {review.authorPhotoUrl ? (
                          <img src={review.authorPhotoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{(review.authorName || '?').charAt(0).toUpperCase()}</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">{review.authorName}</span>
                            <span className="text-[11px] text-slate-400">{review.relativeTime}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-0.5">
                            {Array.from({ length: 5 }, (_, starIndex) => (
                              <Star key={starIndex} className={`h-3.5 w-3.5 ${starIndex < review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                            ))}
                          </div>
                          {review.text && <p className="mt-2 text-sm leading-6 text-slate-600">{review.text}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <p className="text-xs leading-5 text-slate-500">{tr("Reviews are read-only and refresh from Google every few minutes. Use \"Ask for a review\" to email past customers a link to your Google review form.")}</p>
            </>
          )}

          {reviewRequestOpen && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-8">
              <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-950">{tr("Ask past customers for a review")}</h3>
                    <p className="mt-1 text-xs text-slate-500">{tr("Emails a Google review link to customers who have already attended an appointment")}{reviewRequestData?.lookbackDays ? tr(" in the last {value0} days", { value0: reviewRequestData.lookbackDays }) : ''}.
                      {reviewRequestData?.senderEmail ? tr(" Sent from {value0}.", { value0: reviewRequestData.senderEmail }) : ''}
                    </p>
                  </div>
                  <button type="button" onClick={() => setReviewRequestOpen(false)} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100"><X className="h-4 w-4" /></button>
                </div>

                <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
                  {reviewRequestError && <div role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{tr(reviewRequestError)}</div>}
                  {reviewRequestResult && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{reviewRequestResult}</div>}
                  {reviewRequestData?.sendBlockReason && <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{tr(reviewRequestData.sendBlockReason)}</div>}

                  {isLoadingReviewRequests && <p className="py-8 text-center text-sm text-slate-500">{tr("Finding customers who have visited…")}</p>}

                  {!isLoadingReviewRequests && reviewRequestData && !reviewRequestData.candidates?.length && (
                    <div className="py-8 text-center text-sm text-slate-500">
                      <p className="font-semibold text-slate-700">{tr("No completed visits to ask yet.")}</p>
                      {reviewRequestData.stats && (
                        <p className="mx-auto mt-2 max-w-sm text-xs leading-5">{tr("Checked")}{reviewRequestData.stats.totalBookings} {tr("booking")}{reviewRequestData.stats.totalBookings === 1 ? '' : tr("s")}:
                          {' '}{reviewRequestData.stats.notVisitedYet}{tr("not finished yet,")}{' '}{reviewRequestData.stats.cancelled}{tr("cancelled,")}{' '}{reviewRequestData.stats.missingEmail}{tr("without a valid email,")}{' '}{reviewRequestData.stats.tooOld} {tr("older than")} {reviewRequestData.lookbackDays}{tr("days. A customer appears here once their appointment end time has passed.")}</p>
                      )}
                    </div>
                  )}

                  {!isLoadingReviewRequests && !!reviewRequestData?.candidates?.length && (
                    <>
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-600">{reviewRequestSelected.length} {tr("of")} {reviewRequestData.candidates.length} {tr("selected")}</span>
                        <div className="flex gap-3">
                          <button type="button" onClick={() => setReviewRequestSelected(reviewRequestData.candidates.filter((c) => !c.unsubscribed).map((c) => c.email))} className="font-semibold text-emerald-800 hover:underline">{tr("Select all")}</button>
                          <button type="button" onClick={() => setReviewRequestSelected([])} className="font-semibold text-slate-500 hover:underline">{tr("Clear")}</button>
                        </div>
                      </div>
                      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                        {reviewRequestData.candidates.map((candidate) => (
                          <li key={candidate.email} className="flex items-start gap-3 px-3 py-2.5">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 accent-emerald-700 disabled:opacity-40"
                              checked={reviewRequestSelected.includes(candidate.email)}
                              disabled={candidate.unsubscribed}
                              onChange={() => toggleReviewRequestRecipient(candidate.email)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{candidate.name || candidate.email}</p>
                              <p className="truncate text-xs text-slate-500">{candidate.email}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{tr("Last visit")}{candidate.visitDate}{candidate.serviceName ? tr(" · {value0}", { value0: candidate.serviceName }) : ''}
                              </p>
                              {candidate.unsubscribed && <p className="mt-0.5 text-xs font-semibold text-amber-800">{tr("Unsubscribed from emails")}</p>}
                              {!candidate.unsubscribed && candidate.lastRequestedAt && (
                                <p className="mt-0.5 text-xs text-slate-400">{tr("Already asked on")} {candidate.lastRequestedAt.slice(0, 10)}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
                  <button type="button" onClick={loadReviewRequests} disabled={isLoadingReviewRequests || isSendingReviewRequests} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingReviewRequests ? 'animate-spin' : ''}`} />{tr("Refresh")}</button>
                  <button
                    type="button"
                    onClick={sendReviewRequests}
                    disabled={isSendingReviewRequests || isLoadingReviewRequests || !reviewRequestSelected.length || reviewRequestData?.sendReady === false}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Mail className="h-4 w-4" />{isSendingReviewRequests ? tr("Sending…") : tr("Send to {value0}", { value0: reviewRequestSelected.length })}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'marketing' && (
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-4">
              <span className="rounded-xl bg-violet-50 p-3 text-violet-800"><Megaphone className="h-5 w-5" /></span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-800">{tr("Grow your practice")}</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">{tr("Email marketing")}</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">{tr("Build an audience with chat, review your message, and send from mythaithaimassage@gmail.com.")}</p>
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-950">{tr("Campaigns go only to people who checked the optional marketing consent box when booking and remain subscribed. Each email includes an unsubscribe link. Appointment confirmations and receipts are separate.")}</div>
          </section>
          {campaignError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{tr(campaignError)}</div>}
          {campaignNotice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{tr(campaignNotice)}</div>}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-bold text-slate-900">{tr("Audience assistant")}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{tr("Describe a segment in your own words, or switch to manual filters to pick it yourself. The list is rebuilt from the live database every time, so deleted customers are removed automatically. Gemini only ever receives your description and the branch, service, and membership names — never customer or patient data.")}</p></div>
              {campaignAudience && <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900">{campaignAudience.count} {tr("matched /")} {campaignAudience.subscriberCount} {tr("opted in")}</span>}
            </div>
            <div className="mt-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {[['assistant', 'Describe with Gemini'], ['manual', 'Manual filters']].map(([mode, label]) => (
                <button key={mode} type="button" onClick={() => setCampaignAudienceMode(mode)} disabled={isBuildingCampaignAudience || isSendingCampaign} className={`rounded-lg px-3.5 py-2 text-xs font-bold transition disabled:opacity-50 ${campaignAudienceMode === mode ? 'bg-emerald-950 text-white' : 'text-slate-600 hover:text-emerald-900'}`}>{tr(label)}</button>
              ))}
            </div>
            {campaignAudienceMode === 'assistant' && campaignAudienceOptions && !campaignAudienceOptions.geminiReady && <p className="mt-2 text-xs font-semibold text-amber-800">{tr(campaignAudienceOptions.geminiBlockReason)}</p>}
            <div aria-live="polite" className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
              {campaignConversation.map((entry, index) => <div key={`${entry.role}-${index}`} className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs leading-5 ${entry.role === 'user' ? 'ml-auto bg-emerald-950 text-white' : 'bg-white text-slate-700 shadow-sm'}`}>{entry.role === "assistant" ? tr(entry.text) : entry.text}</div>)}
              {isBuildingCampaignAudience && <p className="text-xs text-slate-500">{tr("Checking opted-in contacts and booking history…")}</p>}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); askCampaignAudience(); }} className={`mt-3 gap-2 ${campaignAudienceMode === 'assistant' ? 'flex' : 'hidden'}`}>
              <input value={campaignChatInput} onChange={(event) => setCampaignChatInput(event.target.value)} maxLength={300} disabled={isSendingCampaign} placeholder={tr("e.g. All active opted-in subscribers")} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50" />
              <button type="submit" disabled={isBuildingCampaignAudience || isSendingCampaign || !campaignChatInput.trim()} className="shrink-0 rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{isBuildingCampaignAudience ? tr("Thinking…") : tr("Find audience")}</button>
            </form>
            <div className={`mt-3 flex-wrap gap-2 ${campaignAudienceMode === 'assistant' ? 'flex' : 'hidden'}`}>
              {[
                'All active opted-in subscribers',
                'Customers who visit every Wednesday',
                `Most recent customers at ${branches[0]?.name || 'a branch'} in the last 30 days`,
                `All opted-in customers at ${branches[0]?.name || 'a branch'}`,
              ].map((example) => <button key={example} type="button" onClick={() => { setCampaignChatInput(example); askCampaignAudience(example); }} disabled={isBuildingCampaignAudience || isSendingCampaign} className="rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50">{tr(example)}</button>)}
            </div>
            {campaignAudienceMode === 'manual' && <form onSubmit={(event) => { event.preventDefault(); findCampaignAudienceManually(); }} className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{tr("Membership")}</span>
                  <select value={campaignManualFilters.membershipType} onChange={(event) => setCampaignManualFilters((current) => ({ ...current, membershipType: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100">
                    <option value="">{tr("Any membership")}</option>
                    {(campaignAudienceOptions?.membershipTypes || []).map((tier) => <option key={tier} value={tier}>{tr(tier.charAt(0).toUpperCase() + tier.slice(1))}</option>)}
                  </select>
                </label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{tr("Branch")}</span>
                  <select value={campaignManualFilters.branch} onChange={(event) => setCampaignManualFilters((current) => ({ ...current, branch: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100">
                    <option value="">{tr("Any branch")}</option>
                    {(campaignAudienceOptions?.branches || []).map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                  </select>
                </label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{tr("Service")}</span>
                  <select value={campaignManualFilters.service} onChange={(event) => setCampaignManualFilters((current) => ({ ...current, service: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100">
                    <option value="">{tr("Any service")}</option>
                    {(campaignAudienceOptions?.services || []).map((service) => <option key={service} value={service}>{service}</option>)}
                  </select>
                </label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{tr("Visits on a weekday")}</span>
                  <select value={campaignManualFilters.weekday} onChange={(event) => setCampaignManualFilters((current) => ({ ...current, weekday: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100">
                    <option value="">{tr("Any day")}</option>
                    {(campaignAudienceOptions?.weekdays || []).map((day) => <option key={day} value={day}>{tr(day.charAt(0).toUpperCase() + day.slice(1))}</option>)}
                  </select>
                </label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{tr("Booked in the last (days)")}</span>
                  <input type="number" min={1} max={365} value={campaignManualFilters.days} onChange={(event) => setCampaignManualFilters((current) => ({ ...current, days: event.target.value }))} placeholder={tr("e.g. 30")} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" />
                </label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{tr("Most recent customers")}</span>
                  <input type="number" min={1} max={50} value={campaignManualFilters.limit} onChange={(event) => setCampaignManualFilters((current) => ({ ...current, limit: event.target.value }))} placeholder={tr("e.g. 20")} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={campaignManualFilters.recurring} disabled={!campaignManualFilters.weekday} onChange={(event) => setCampaignManualFilters((current) => ({ ...current, recurring: event.target.checked }))} className="h-4 w-4 rounded border-slate-300" />{tr("Only regulars (two or more visits that weekday)")}</label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={campaignManualFilters.allOptedIn} onChange={(event) => setCampaignManualFilters((current) => ({ ...current, allOptedIn: event.target.checked }))} className="h-4 w-4 rounded border-slate-300" />{tr("All active opted-in subscribers")}</label>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] leading-4 text-slate-500">{tr("Manual filters run entirely on your own data — nothing is sent to an AI service.")}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setCampaignManualFilters({ membershipType: '', branch: '', service: '', weekday: '', recurring: false, days: '', limit: '', allOptedIn: false })} disabled={isBuildingCampaignAudience || isSendingCampaign} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50">{tr("Clear filters")}</button>
                  <button type="submit" disabled={isBuildingCampaignAudience || isSendingCampaign} className="rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{isBuildingCampaignAudience ? tr("Matching…") : tr("Find audience")}</button>
                </div>
              </div>
            </form>}
            {campaignAudience && <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-bold text-slate-900">{tr(campaignAudience.description)}</p>
              <p className="mt-1 text-xs text-slate-500">{campaignAudience.count ? tr("Examples: {value0}", { value0: campaignAudience.sampleNames.join(', ') }) : campaignAudience.subscriberCount ? tr("No opted-in subscribers match that description yet.") : tr("There are no opted-in subscribers yet. New customers can choose marketing emails in the booking form.")}</p>
              {campaignAudience.count < campaignAudience.subscriberCount && campaignAudience.subscriberCount > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{tr("This filter matches")} {campaignAudience.count} {tr("of")} {campaignAudience.subscriberCount} {tr("active opted-in subscribers. A branch, weekday, or date filter requires a matching booking in the history. Choose “All active opted-in subscribers” above to include everyone.")}</p>}
              {campaignAudience.removedContacts?.length > 0 && <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-600">{campaignAudience.removedContacts.length} {tr("contact")}{campaignAudience.removedContacts.length === 1 ? '' : tr("s")} {tr("with no remaining customer records")} {campaignAudience.removedContacts.length === 1 ? tr("was") : tr("were")} {tr("removed from the marketing list.")}</p>}
              {!campaignAudience.sendReady && <p className="mt-2 text-xs font-semibold text-amber-800">{tr(campaignAudience.sendBlockReason)}</p>}
              {campaignAudience.count > 50 && <p className="mt-2 text-xs font-semibold text-amber-800">{tr("Campaigns are limited to 50 recipients per send. Narrow this group before sending.")}</p>}
              <p className="mt-2 text-[10px] leading-4 text-slate-400">{tr("Audience matching uses historical booking dates, not verified attendance or visit frequency.")}</p>
            </div>}
          </section>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
            <form onSubmit={saveCampaignDraft} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div><h3 className="font-bold text-slate-900">{tr("Campaign message")}</h3><p className="mt-1 text-xs text-slate-500">{tr("Use the writing assistant to create an editable draft, then review, save, or send it.")}</p></div>
              <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{tr("What should this campaign say?")}</span><textarea rows={2} maxLength={500} value={campaignGoal} onChange={(event) => setCampaignGoal(event.target.value)} disabled={isGeneratingCampaignCopy || isSendingCampaign} placeholder={tr("e.g. Write a friendly note inviting this audience to take time for self-care. Do not include an offer.")} className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-5 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50" /></label>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="max-w-lg text-[10px] leading-4 text-slate-500">{tr("Gemini receives only your campaign goal and the aggregate audience description—not customer names, emails, or booking rows. The generated copy is not sent until you review and confirm.")}</p>
                  <button type="button" onClick={generateCampaignCopy} disabled={!campaignAudience || !campaignAudience.copyAssistantReady || !campaignGoal.trim() || isGeneratingCampaignCopy || isSendingCampaign || isBuildingCampaignAudience} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-violet-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45"><Sparkles className="h-4 w-4" />{isGeneratingCampaignCopy ? tr("Generating…") : tr("Generate campaign")}</button>
                </div>
                {campaignAudience && !campaignAudience.copyAssistantReady && <p className="mt-2 text-xs font-semibold text-amber-800">{tr(campaignAudience.copyAssistantBlockReason)}</p>}
              </div>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{tr("Subject line")}</span><input maxLength={180} required value={campaignSubject} onChange={(event) => setCampaignSubject(event.target.value)} placeholder={tr("A little time for yourself…")} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{tr("Preview text")}</span><input maxLength={200} value={campaignPreview} onChange={(event) => setCampaignPreview(event.target.value)} placeholder={tr("A short summary shown in the inbox")} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{tr("Message")}</span><textarea required rows={8} maxLength={5000} value={campaignMessage} onChange={(event) => setCampaignMessage(event.target.value)} placeholder={tr("Write a helpful, considerate message for your subscribers…")} className="w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm leading-6 outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100" /></label>
              <div className="flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-4">
                <span className="self-center text-[11px] text-slate-400">{campaignMessage.length}{tr("/5000 characters")}</span>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Check className="h-4 w-4" />{tr("Save draft")}</button>
                  <button type="button" onClick={sendCampaign} disabled={isSendingCampaign || isBuildingCampaignAudience || !campaignAudience?.sendReady || !campaignAudience?.count || campaignAudience.count > 50 || !campaignSubject.trim() || !campaignMessage.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"><Mail className="h-4 w-4" />{isSendingCampaign ? tr("Sending…") : tr("Send to {value0}", { value0: campaignAudience?.count || 0 })}</button>
                </div>
              </div>
            </form>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-2"><Eye className="h-4 w-4 text-slate-500" /><h3 className="font-bold text-slate-900">{tr("Email preview")}</h3></div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3"><p className="text-[10px] text-slate-400">{tr("MY THAI THAI · to your subscribers")}</p><p className="mt-1 text-xs font-bold text-slate-800">{campaignSubject || tr("Your campaign subject")}</p><p className="mt-1 truncate text-[11px] text-slate-500">{campaignPreview || tr("Preview text appears here")}</p></div>
                <div className="min-h-48 whitespace-pre-wrap px-5 py-5 text-sm leading-6 text-slate-700">{campaignMessage || tr("Your message preview will appear here as you write.")}<div className="mt-8 border-t border-slate-100 pt-4 text-[10px] leading-5 text-slate-400">{tr("MY THAI THAI · Business mailing address from profile")}<br />{tr("You are receiving this because you opted in to promotional emails.")}<br /><span className="underline">{tr("Unsubscribe")}</span></div></div>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">{tr("Campaign emails include your business mailing address and an unsubscribe link. Sending requires Gmail OAuth and a mailing address in Business profile.")}</p>
            </section>
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-slate-900">{tr("Saved drafts")}</h3><p className="mt-1 text-xs text-slate-500">{tr("Stored only on this device")}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{campaignDrafts.length}</span></div>
            {campaignDrafts.length ? <div className="space-y-2">{campaignDrafts.map((draft) => <div key={draft.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><button type="button" onClick={() => { setCampaignSubject(draft.subject); setCampaignPreview(draft.preview); setCampaignMessage(draft.message); setCampaignNotice('Draft loaded for editing.'); setCampaignError(''); }} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold text-slate-800">{draft.subject}</span><span className="text-[10px] text-slate-400">{tr("Updated")} {new Date(draft.updatedAt).toLocaleString(locale)}</span></button><button type="button" onClick={() => removeCampaignDraft(draft.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-700">{tr("Delete")}</button></div>)}</div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{tr("No campaign drafts saved yet.")}</p>}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div><h3 className="font-bold text-slate-900">{tr("Campaign history")}</h3><p className="mt-1 text-xs text-slate-500">{tr("Logged to BigQuery with a campaign ID for future reference/audit")}</p></div>
              <button type="button" onClick={loadCampaignHistory} disabled={isLoadingCampaignHistory} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{isLoadingCampaignHistory ? tr("Refreshing…") : tr("Refresh")}</button>
            </div>
            {campaignHistoryError && <div role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{tr(campaignHistoryError)}</div>}
            {campaignHistory.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead><tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400"><th className="py-2 pr-4">{tr("Sent")}</th><th className="py-2 pr-4">{tr("Subject")}</th><th className="py-2 pr-4">{tr("Audience")}</th><th className="py-2 pr-4 text-right">{tr("Sent / Failed")}</th><th className="py-2 pr-4">{tr("Campaign ID")}</th></tr></thead>
                  <tbody>
                    {campaignHistory.map((campaign) => (
                      <tr key={campaign.campaignId} className="border-b border-slate-50 text-slate-600">
                        <td className="py-2.5 pr-4 whitespace-nowrap">{campaign.sentAt ? new Date(campaign.sentAt).toLocaleString(locale) : '—'}</td>
                        <td className="py-2.5 pr-4 font-semibold text-slate-800">{campaign.subject || '—'}</td>
                        <td className="py-2.5 pr-4 max-w-xs truncate">{campaign.audienceDescription || '—'}</td>
                        <td className="py-2.5 pr-4 text-right"><span className="font-semibold text-emerald-800">{campaign.sentCount}</span>{campaign.failedCount ? <span className="ml-1 font-semibold text-rose-700">/ {campaign.failedCount} {tr("failed")}</span> : ''}</td>
                        <td className="py-2.5 pr-4 font-mono text-[10px] text-slate-400">{campaign.campaignId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{isLoadingCampaignHistory ? tr("Loading campaign history…") : tr("No campaigns sent yet.")}</p>}
          </section>
        </div>
      )}

      {activeTab === 'business-profile' && (
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-white to-emerald-50/60 px-5 py-5 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800">
                  <Building className="h-4 w-4" />{tr("Owner settings")}</div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">{tr("Business profile")}</h2>
                <p className="mt-1 text-sm text-slate-500">{tr("Manage the identity and contact details associated with your practice.")}</p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />{tr("Synced across owner devices")}</span>
            </div>
          </div>

          {businessProfileError && <div role="alert" className="mx-5 mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:mx-8">{tr(businessProfileError)}</div>}
          {businessProfileMessage && <div role="status" className="mx-5 mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:mx-8">{tr(businessProfileMessage)}</div>}
          {isLoadingBusinessProfile ? (
            <div className="p-10 text-center text-sm text-slate-500">{tr("Loading business profile…")}</div>
          ) : !hasLoadedBusinessProfile ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600">{tr("The saved profile could not be loaded. Retry before making changes.")}</p>
              <button type="button" onClick={loadBusinessProfile} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">{tr("Retry loading")}</button>
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
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{tr(field.label)}{field.required && <span className="ml-1 text-rose-600">*</span>}</span>
                      <input
                        type={field.type}
                        required={field.required}
                        maxLength={field.key === 'businessName' ? 100 : field.key === 'photoUrl' ? 2048 : 250}
                        value={businessProfile[field.key] || ''}
                        onChange={(event) => {
                          setBusinessProfile((profile) => ({ ...profile, [field.key]: event.target.value }));
                          setBusinessProfileMessage('');
                        }}
                        placeholder={field.placeholder ? tr(field.placeholder) : undefined}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                      />
                      {field.key === 'photoUrl' && <span className="mt-1.5 block text-xs leading-5 text-slate-500">{tr("Paste a publicly accessible image URL. Leave blank to use the business initials.")}</span>}
                    </label>
                  ))}
                </div>
                <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="inline-flex items-start gap-1.5 text-xs leading-5 text-slate-500"><Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />{tr("Profile details are stored in your connected database and available when you sign in on another device.")}</p>
                  <button type="submit" disabled={isSavingBusinessProfile || !hasLoadedBusinessProfile} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-950 px-5 py-3 text-sm font-bold text-white shadow-md shadow-emerald-950/10 transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">
                    {isSavingBusinessProfile ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {isSavingBusinessProfile ? tr("Saving…") : tr("Save profile")}
                  </button>
                </div>
              </form>

              <aside className="self-start rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">{tr("Profile preview")}</p>
                <BusinessPhoto businessName={businessProfile.businessName || 'Your business'} photoUrl={businessProfile.photoUrl} className="mt-5 h-14 w-14 rounded-2xl object-cover text-lg shadow-md" />
                <h3 className="mt-4 text-lg font-bold text-slate-900">{businessProfile.businessName || tr("Your business name")}</h3>
                {businessProfile.legalName && <p className="mt-0.5 text-xs text-slate-500">{businessProfile.legalName}</p>}
                <p className="mt-1 text-sm leading-5 text-slate-500">{businessProfile.tagline || tr("Add a short introduction to your practice.")}</p>
                <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-sm text-slate-600">
                  {businessProfile.email && <div className="flex items-start gap-2.5"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span className="break-all">{businessProfile.email}</span></div>}
                  {businessProfile.phone && <div className="flex items-start gap-2.5"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span>{businessProfile.phone}</span></div>}
                  {businessProfile.website && <div className="flex items-start gap-2.5"><Globe className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span className="break-all">{businessProfile.website}</span></div>}
                  {businessProfile.address && <div className="flex items-start gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><span>{businessProfile.address}</span></div>}
                  {businessProfile.taxRegistrationNumber && <div className="text-xs text-slate-500">{tr("GST/HST No.")} {businessProfile.taxRegistrationNumber}</div>}
                </div>
              </aside>
            </div>
          )}
        </section>
      )}

      {activeTab === 'therapist-approvals' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{tr("Therapist account approvals")}</h2>
              <p className="text-xs text-slate-500 mt-1">{tr("New therapist sign-ups appear here. Approved therapists can sign in to the therapist view.")}</p>
            </div>
            <button onClick={loadTherapistAccounts} disabled={isLoadingTherapistAccounts} className="px-3 py-2 rounded-xl bg-emerald-800 text-white text-xs font-bold disabled:opacity-50">
              {isLoadingTherapistAccounts ? tr("Loading...") : tr("Refresh")}
            </button>
          </div>
          {therapistAccountsError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">{tr(therapistAccountsError)}</div>}
          {[
            { title: 'Pending approval', accounts: pendingTherapistAccounts, empty: 'No therapist sign-ups are waiting for approval.' },
            { title: 'Approved', accounts: therapistAccounts.filter((account) => account.status === 'approved'), empty: 'No approved therapist accounts yet.' },
            { title: 'Rejected', accounts: therapistAccounts.filter((account) => account.status === 'rejected'), empty: '' },
          ].filter((group) => group.empty || group.accounts.length).map((group) => (
            <section key={group.title} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{tr(group.title)} ({group.accounts.length})</h3>
              {group.accounts.length === 0 ? (
                <div className="p-6 text-center rounded-xl bg-slate-50 text-slate-500 text-sm">{isLoadingTherapistAccounts ? tr("Loading...") : tr(group.empty)}</div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {group.accounts.map((account) => (
                    <div key={account.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900">{account.name || account.username}</div>
                        <div className="text-[11px] text-slate-500 mt-1">@{account.username} {tr("· Signed up")} {account.createdAt ? new Date(account.createdAt).toLocaleString(locale) : tr("date unknown")}</div>
                      </div>
                      <div className="flex gap-2">
                        {account.status !== 'approved' && (
                          <button onClick={() => updateTherapistAccountStatus(account, 'approved')} disabled={updatingTherapistAccountId === account.id} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"><Check className="w-3.5 h-3.5" /> {tr("Approve")}</button>
                        )}
                        {account.status === 'pending' && (
                          <button onClick={() => updateTherapistAccountStatus(account, 'rejected')} disabled={updatingTherapistAccountId === account.id} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-bold hover:bg-red-50 disabled:opacity-50"><X className="w-3.5 h-3.5" /> {tr("Reject")}</button>
                        )}
                        {account.status === 'approved' && (
                          <button onClick={() => updateTherapistAccountStatus(account, 'pending')} disabled={updatingTherapistAccountId === account.id} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50"><Ban className="w-3.5 h-3.5" /> {tr("Revoke access")}</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* TAB CONTENT: FINANCIAL REPORTS */}
      {activeTab === 'patient-history' && (
        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{tr("Patient History Profiles")}</h2>
              <p className="text-xs text-stone-500 mt-1">{tr("Confidential health information. Access only for authorized clinic staff.")}</p>
            </div>
            <div className="flex gap-2">
              <input
                value={patientHistorySearch}
                onChange={(event) => setPatientHistorySearch(event.target.value)}
                placeholder={tr("Search patient or booking...")}
                className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
              />
              <button onClick={loadPatientHistory} disabled={isLoadingPatientHistory} className="px-3 py-2 rounded-xl bg-emerald-800 text-white text-xs font-bold disabled:opacity-50">
                {isLoadingPatientHistory ? tr("Loading...") : tr("Refresh")}
              </button>
            </div>
          </div>
          {patientHistoryLoadError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">{tr(patientHistoryLoadError)}</div>}
          {deletePatientHistoryError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">{tr(deletePatientHistoryError)}</div>}
          {!patientHistoryLoadError && patientHistory.length === 0 && !isLoadingPatientHistory && (
            <div className="p-8 text-center rounded-xl bg-stone-50 text-stone-500 text-sm">{tr("No patient history profiles found.")}</div>
          )}
          {patientHistory.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.6fr)] gap-5">
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                <div className="text-xs font-bold text-stone-500">{filteredPatientHistory.length} {tr("profile(s)")}</div>
                {filteredPatientHistory.map((profile) => (
                  <button
                    key={`${profile.bookingId}-${profile.createdAt}`}
                    onClick={() => setSelectedPatientHistory(profile)}
                    className={`w-full text-left p-3 rounded-xl border transition ${selectedPatientHistory === profile ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-emerald-300'}`}
                  >
                    <div className="font-bold text-sm text-stone-900">{profile.patientName}</div>
                    <div className="text-[11px] text-stone-500 mt-1">{profile.bookingId} · {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString(locale) : tr("No date")}</div>
                    <div className="text-[11px] text-stone-600 mt-1">{profile.email || profile.phone}</div>
                  </button>
                ))}
              </div>
              {selectedPatientHistory && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold text-stone-900">{selectedPatientHistory.patientName}</h3>
                      <p className="text-xs text-stone-500">{selectedPatientHistory.bookingId} · {selectedPatientHistory.dateOfBirth || tr("DOB not provided")} · {selectedPatientHistory.gender || tr("Gender not provided")}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold"><ShieldCheck className="w-3.5 h-3.5" /> {tr("Consent:")} {selectedPatientHistory.consent || tr("Not recorded")}</span>
                    <button
                      onClick={() => deletePatientHistoryRecord(selectedPatientHistory)}
                      disabled={deletingPatientHistoryKey === `${selectedPatientHistory.bookingId}-${selectedPatientHistory.createdAt}`}
                      className="px-3 py-2 border border-red-300 text-red-700 rounded-xl text-xs font-bold hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                    >
                      {deletingPatientHistoryKey === `${selectedPatientHistory.bookingId}-${selectedPatientHistory.createdAt}` ? tr("Clearing...") : tr("Clear this record")}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ['Conditions flagged', selectedConditionFlags.length, 'bg-red-50 text-red-800'],
                      ['Pressure', selectedPatientHistory.pressure || 'Not set', 'bg-amber-50 text-amber-800'],
                      ['Pain areas', selectedPatientHistory.painAreas ? 'Recorded' : 'None listed', 'bg-blue-50 text-blue-800'],
                      ['Body areas', selectedPatientHistory.bodyAreas ? selectedPatientHistory.bodyAreas.split(',').length : 0, 'bg-purple-50 text-purple-800'],
                    ].map(([label, value, style]) => <div key={label} className={`rounded-xl p-3 ${style}`}><div className="text-[10px] font-bold uppercase">{tr(label)}</div><div className="text-lg font-black mt-1">{typeof value === "string" ? tr(value) : value}</div></div>)}
                  </div>
                  {selectedConditionFlags.length > 0 && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                      <h4 className="text-xs font-bold text-red-900 mb-2">{tr("Reported health conditions")}</h4>
                      <div className="flex flex-wrap gap-2">{selectedConditionFlags.map(([key]) => <span key={key} className="px-2 py-1 rounded-lg bg-white border border-red-200 text-[11px] text-red-800">{tr(key)}</span>)}</div>
                    </div>
                  )}
                  <BodyAreaMap value={selectedPatientHistory.bodyAreas} gender={selectedPatientHistory.gender} readOnly />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-4 rounded-xl bg-stone-50 space-y-2">
                      <h4 className="font-bold text-stone-800">{tr("Contact")}</h4>
                      <div>{selectedPatientHistory.email || tr("No email")}</div><div>{selectedPatientHistory.phone || tr("No phone")}</div>
                      <div>{[selectedPatientHistory.address, selectedPatientHistory.city, selectedPatientHistory.postalCode].filter(Boolean).join(', ') || tr("No address")}</div>
                    </div>
                    <div className="p-4 rounded-xl bg-stone-50 space-y-2">
                      <h4 className="font-bold text-stone-800">{tr("Treatment notes")}</h4>
                      <div><strong>{tr("Body areas:")}</strong> {selectedPatientHistory.bodyAreas ? selectedPatientHistory.bodyAreas.split(",").map((area) => tr(area.trim())).join(", ") : tr("None listed")}</div>
                      <div><strong>{tr("Pain/discomfort:")}</strong> {selectedPatientHistory.painAreas || tr("None listed")}</div>
                      <div><strong>{tr("Additional details:")}</strong> {selectedPatientHistory.details || tr("None listed")}</div>
                    </div>
                  </div>
                  <details className="border border-stone-200 rounded-xl p-4">
                    <summary className="cursor-pointer text-xs font-bold text-stone-700">{tr("View full medical questionnaire")}</summary>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                      {Object.entries(selectedPatientHistory.conditions).map(([key, value]) => <div key={key} className="flex justify-between border-b border-stone-100 py-1"><span>{tr(key)}</span><strong>{tr(value || "Not answered")}</strong></div>)}
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
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800">{tr("Business intelligence")}</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">{tr("Sales & reports")}</h2>
              <p className="mt-1 text-sm text-slate-500">{tr("Track sales, collections, and appointment trends.")}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-[11px] font-semibold text-slate-500">{tr("From")}<input type="date" value={reportStartDate} max={reportEndDate} onChange={(event) => setReportStartDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" /></label>
              <label className="text-[11px] font-semibold text-slate-500">{tr("To")}<input type="date" value={reportEndDate} min={reportStartDate} onChange={(event) => setReportEndDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" /></label>
              <button onClick={loadBookingsFromBackend} disabled={isLoadingBookings} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{isLoadingBookings ? tr("Refreshing…") : tr("Refresh data")}</button>
            </div>
          </div>
          {bookingLoadError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{tr(bookingLoadError)}</div>}
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800">{tr("Daily reports")}</p>
              <h3 className="mt-1 text-base font-bold text-slate-950">{tr("Therapist hours & branch audit")}</h3>
              <p className="mt-1 text-xs text-slate-500">{tr("Download a PDF of therapist hours served, or a per-branch audit of therapist working hours, for a single day.")}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-[11px] font-semibold text-slate-500">{tr("Report date")}<input type="date" value={dailyReportDate} onChange={(event) => setDailyReportDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" /></label>
              <label className="text-[11px] font-semibold text-slate-500">{tr("Branch")}<select value={dailyReportBranchId} onChange={(event) => setDailyReportBranchId(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800"><option value="all">{tr("All branches")}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
              <button type="button" onClick={downloadTherapistHoursPdf} className="inline-flex items-center gap-2 rounded-lg bg-emerald-950 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><Download className="h-3.5 w-3.5" />{tr("Therapist hours (PDF)")}</button>
              <button type="button" onClick={downloadBranchAuditPdf} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" />{tr("Branch audit (PDF)")}</button>
            </div>
          </div>
          {(() => {
            const rows = dashboardBookings.filter((booking) => booking.date >= reportStartDate && booking.date <= reportEndDate);
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
              return { key, label: day.toLocaleDateString(locale, { month: 'short', day: 'numeric' }), value: rows.filter((booking) => booking.date === key).reduce((sum, booking) => sum + (Number(booking.paidAmount) || 0), 0) };
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
                  {stats.map(([label, value, style, Icon]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-xs font-semibold text-slate-500">{tr(label)}<span className={`rounded-xl p-2 ${style}`}><Icon className="h-4 w-4" /></span></div><div className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{label === 'Appointments' ? value : tr("${value0}", { value0: Number(value).toFixed(2) })}</div><p className="mt-1 text-[11px] text-slate-400">{tr("Selected reporting period")}</p></div>)}
                </div>
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between"><div><h3 className="font-bold text-slate-900">{tr("Payments collected")}</h3><p className="mt-1 text-xs text-slate-500">{tr("Daily totals · last 7 days in this period")}</p></div><span className="text-xs font-bold text-emerald-800">${collected.toFixed(2)}</span></div>
                    <div className="mt-7 flex h-48 items-end gap-3 border-b border-slate-100 px-1">
                      {trend.map((item) => <div key={item.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div className="flex w-full flex-1 items-end"><div title={`$${item.value.toFixed(2)}`} className="w-full rounded-t-md bg-gradient-to-t from-emerald-800 to-emerald-500 transition hover:from-emerald-700" style={{ height: `${Math.max(item.value ? 8 : 2, (item.value / maxTrend) * 100)}%` }} /></div><span className="pb-2 text-[10px] text-slate-400">{tr(item.label)}</span></div>)}
                    </div>
                    <p className="mt-4 text-xs text-slate-500">{tr("Estimated HST collected:")} <strong className="text-slate-800">${taxCollected.toFixed(2)}</strong></p>
                  </section>
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="font-bold text-slate-900">{tr("Top services")}</h3><p className="mt-1 text-xs text-slate-500">{tr("By gross sales in selected period")}</p>
                    <div className="mt-5 space-y-4">
                      {serviceTotals.length ? serviceTotals.map((service) => <div key={service.name}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-700">{tr(service.name)}</span><span className="shrink-0 font-bold text-slate-900">${service.revenue.toFixed(2)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.max(5, (service.revenue / Math.max(1, serviceTotals[0].revenue)) * 100)}%` }} /></div><p className="mt-1 text-[10px] text-slate-400">{service.count} {tr("appointment")}{service.count === 1 ? '' : tr("s")}</p></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{tr("No sales recorded for this date range.")}</p>}
                    </div>
                  </section>
                </div>
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-slate-900">{tr("Recent sales")}</h3><p className="mt-1 text-xs text-slate-500">{tr("Appointment totals and payments received")}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">{rows.length} {tr("records")}</span></div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400"><th className="py-3 pr-4">{tr("Date / receipt")}</th><th className="py-3 pr-4">{tr("Patient")}</th><th className="py-3 pr-4">{tr("Service")}</th><th className="py-3 pr-4">{tr("Location")}</th><th className="py-3 pr-4 text-right">{tr("Paid")}</th><th className="py-3 text-right">{tr("Total")}</th></tr></thead><tbody>{rows.slice().sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0, 12).map((booking) => <tr key={booking.id} className="border-b border-slate-50 text-slate-600"><td className="py-3 pr-4"><span className="font-semibold text-slate-800">{booking.date}</span><span className="block font-mono text-[10px] text-slate-400">{booking.id}</span></td><td className="py-3 pr-4">{booking.customerName}</td><td className="py-3 pr-4">{tr(booking.serviceName)}</td><td className="py-3 pr-4">{booking.branchName}</td><td className="py-3 pr-4 text-right font-semibold">${(Number(booking.paidAmount) || 0).toFixed(2)}</td><td className="py-3 text-right font-bold text-slate-900">${(Number(booking.total) || 0).toFixed(2)}</td></tr>)}</tbody></table>{rows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{tr("No bookings in this reporting period.")}</p>}</div>
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
              <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">{tr("Appointment details")}</p><h2 id="appointment-receipt-title" className="mt-1 text-lg font-bold">{issuedReceipt?.booking?.customerName || selectedCalendarEvent.booking?.customerName || selectedCalendarEvent.summary}</h2><p className="mt-1 text-xs text-emerald-100/80">{selectedCalendarEvent.booking?.id || tr("Calendar event")} · {formatTime(selectedCalendarEvent.timeRange || selectedCalendarEvent.localTime)}</p></div>
              <button type="button" aria-label={tr("Close appointment details")} onClick={() => setSelectedCalendarEvent(null)} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-5 p-5 sm:p-6">
              {receiptError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{tr(receiptError)}</div>}
              {receiptNotice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">{tr(receiptNotice)}</div>}
              {(() => {
                const booking = issuedReceipt?.booking || selectedCalendarEvent.booking;
                const paidInFull = booking && (Number(booking.total) > 0 || Boolean(booking.receiptNumber)) && Number(booking.paidAmount) + 0.005 >= Number(booking.total);
                const needsDetails = booking?.autoLinked && !booking.receiptNumber && (!booking.email || !(Number(booking.total) > 0));
                return booking ? (
                  <>
                    {booking.autoLinked && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">{tr("This appointment was booked directly on the calendar and was automatically linked to a new booking record.")}{needsDetails ? tr("Add the missing details below to enable receipt issuing.") : ''}
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
                        ['Appointment time', selectedCalendarEvent.timeRange || selectedCalendarEvent.localTime],
                        ['Payment method', booking.paymentOption || 'Not recorded'],
                      ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{tr(label)}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{label === "Appointment time" ? formatTime(value || "") : ["Service", "Payment method", "Email", "Phone"].includes(label) ? tr(value || "Not recorded") : value || tr("Not recorded")}</p></div>)}
                    </div>
                    {(() => {
                      const currentTherapist = booking.therapistName || selectedCalendarEvent.therapistName || '';
                      const isCancelled = String(booking.status || '') === 'Cancelled';
                      const options = therapists
                        .filter((therapist) => therapist.active !== false)
                        .map((therapist) => therapist.name)
                        .filter((name) => name && name !== currentTherapist);
                      return (
                        <div className="rounded-xl border border-slate-200 px-3.5 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{tr("Therapist")}</p>
                              <p className="mt-1 inline-flex items-center gap-1.5 break-words text-sm font-semibold text-slate-800"><UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />{currentTherapist || tr("Unassigned")}</p>
                            </div>
                            {!isCancelled && !issuedReceipt && (
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={therapistReassignTo}
                                  onChange={(event) => setTherapistReassignTo(event.target.value)}
                                  aria-label={tr("Reassign this appointment to another therapist")}
                                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-800"
                                >
                                  <option value="">{tr("Change therapist…")}</option>
                                  {currentTherapist !== 'Any Available' && <option value="Any Available">{tr("Any Available")}</option>}
                                  {options.map((name) => <option key={name} value={name}>{name}</option>)}
                                </select>
                                <button
                                  type="button"
                                  onClick={reassignTherapist}
                                  disabled={!therapistReassignTo || isReassigningTherapist}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                                >
                                  {isReassigningTherapist ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                  {isReassigningTherapist ? tr("Saving…") : tr("Assign")}
                                </button>
                              </div>
                            )}
                          </div>
                          {!isCancelled && !issuedReceipt && (
                            <p className="mt-2 text-[11px] leading-4 text-slate-500">{tr("Only therapists who are free at this date and time can be assigned. The calendar event is updated to match.")}</p>
                          )}
                        </div>
                      );
                    })()}
                    <div className="rounded-xl border border-slate-200 px-4 py-3">
                      <div className="flex justify-between text-sm text-slate-500"><span>{tr("Amount paid")}</span><span>${Number(booking.paidAmount || 0).toFixed(2)}</span></div>
                      <div className="mt-2 flex justify-between text-sm font-bold text-slate-900"><span>{tr("Appointment total")}</span><span>${Number(booking.total || 0).toFixed(2)}</span></div>
                    </div>
                    {!issuedReceipt && needsDetails && linkEventForm && (
                      <form onSubmit={completeBookingDetails} className="space-y-3 rounded-xl border border-slate-200 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-semibold text-slate-600">{tr("Patient email")}<input required type="email" value={linkEventForm.email} onChange={(event) => setLinkEventForm((current) => ({ ...current, email: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">{tr("Phone")}<input value={linkEventForm.phone} onChange={(event) => setLinkEventForm((current) => ({ ...current, phone: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">{tr("Payment method")}<select value={linkEventForm.paymentOption} onChange={(event) => setLinkEventForm((current) => ({ ...current, paymentOption: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                              <option>{tr("Cash")}</option>
                              <option>{tr("Card")}</option>
                              <option>{tr("E-transfer")}</option>
                              <option>{tr("Other")}</option>
                            </select>
                          </label>
                          <label className="text-xs font-semibold text-slate-600">{tr("Appointment total ($)")}<input required type="number" min="0" step="0.01" value={linkEventForm.total} onChange={(event) => setLinkEventForm((current) => ({ ...current, total: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">{tr("Amount paid ($)")}<input type="number" min="0" step="0.01" value={linkEventForm.paidAmount} onChange={(event) => setLinkEventForm((current) => ({ ...current, paidAmount: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          </label>
                        </div>
                        <button type="submit" disabled={isLinkingEvent} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{isLinkingEvent ? tr("Saving…") : tr("Save details")}</button>
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
                          <span className="block text-sm font-semibold text-slate-900">{paidInFull ? tr("Paid already") : tr("Paid already — mark as fully paid")}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-slate-500">{isMarkingPaid ? tr("Recording payment…") : paidInFull ? tr("Full payment is recorded for this booking.") : tr("Check this if payment has been received. It records ${value0} as paid and enables receipt issuing.", { value0: Number(booking.total).toFixed(2) })}</span>
                        </span>
                      </label>
                    )}
                    {issuedReceipt && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                        <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">{tr("Receipt issued")}</p><p className="mt-1 font-mono text-sm font-bold text-slate-900">{issuedReceipt.receipt.number}</p></div><CheckCircle2 className="h-5 w-5 text-emerald-700" /></div>
                        {issuedReceipt.receipt.membershipDiscountAmount > 0 && <div className="mt-3 flex justify-between border-t border-emerald-100 pt-3 text-sm"><span className="text-slate-600">{tr(issuedReceipt.receipt.membershipDiscountLabel)} ({issuedReceipt.receipt.membershipDiscountPercent}%)</span><span>-${issuedReceipt.receipt.membershipDiscountAmount.toFixed(2)}</span></div>}
                        {issuedReceipt.receipt.loyaltyDiscount > 0 && <div className="mt-3 flex justify-between border-t border-emerald-100 pt-3 text-sm"><span className="text-slate-600">{tr("Loyalty discount ·")} {issuedReceipt.receipt.pointsRedeemed.toLocaleString(locale)} {tr("points")}</span><span>-${issuedReceipt.receipt.loyaltyDiscount.toFixed(2)}</span></div>}
                        {issuedReceipt.receipt.manualDiscount > 0 && <div className="mt-3 flex justify-between border-t border-emerald-100 pt-3 text-sm"><span className="text-slate-600">{tr("Manual discount")}</span><span>-${issuedReceipt.receipt.manualDiscount.toFixed(2)}</span></div>}
                        <div className="mt-3 flex justify-between border-t border-emerald-100 pt-3 text-sm"><span className="text-slate-600">{tr(issuedReceipt.receipt.taxLabel)}</span><span>${issuedReceipt.receipt.tax.toFixed(2)}</span></div>
                        <div className="mt-2 flex justify-between text-sm font-bold"><span>{tr("Total paid")}</span><span>${issuedReceipt.receipt.total.toFixed(2)}</span></div>
                        {issuedReceipt.receipt.reconciliation && <p role="status" className="mt-3 text-xs text-emerald-900">{tr("Reconciliation confirmed. Booking total and paid amount synced to the database: $")}{issuedReceipt.receipt.total.toFixed(2)}.</p>}
                        {issuedReceipt.receipt.overpaymentAmount > 0 && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{tr("Recorded payment: $")}{issuedReceipt.receipt.recordedPaidAmount.toFixed(2)}{tr(". Excess recorded payment: $")}{issuedReceipt.receipt.overpaymentAmount.toFixed(2)}{tr(". Reconcile manually; no automatic refund has been issued.")}</p>}
                        {issuedReceipt.receipt.packageUsage && <p className="mt-3 rounded-lg bg-emerald-100 p-3 text-xs text-emerald-950">{issuedReceipt.receipt.packageUsage.description} {tr("Allocated prepaid value: $")}{issuedReceipt.receipt.packageUsage.allocatedTotal.toFixed(2)}{tr(". New payment: $0.00.")}</p>}
                        <p className="mt-3 text-xs text-emerald-900">{tr("Loyalty balance:")} {issuedReceipt.receipt.pointsBalance.toLocaleString(locale)} {tr("points.")}</p>
                        <p className="mt-3 text-xs text-emerald-900">{tr("Receipt email sent to")} {issuedReceipt.booking.email}.</p>
                      </div>
                    )}
                    {!issuedReceipt && !needsDetails && (
                      <label className="block rounded-xl border border-slate-200 p-4 text-xs font-semibold text-slate-600">{tr("Manual discount ($) — optional")}<input type="number" min="0" step="0.01" placeholder="0.00" value={booking.receiptNumber ? booking.receiptManualDiscount || 0 : manualReceiptDiscount} disabled={isIssuingReceipt || Boolean(booking.receiptNumber) || /prepaid package redemption/i.test(booking.paymentOption || '')} onChange={(event) => { setManualReceiptDiscount(event.target.value); setConfirmReceiptReconciliation(false); }} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
                        <span className="mt-2 block font-normal leading-5">{booking.receiptNumber ? tr("An issued receipt keeps its original discount.") : /prepaid package redemption/i.test(booking.paymentOption || '') ? tr("Verified prepaid package allocations cannot be discounted.") : tr("Deducted before HST, after membership and loyalty discounts. Leave blank for no discount. Confirm reconciliation below to update the booking total and paid amount when issuing the receipt.")}</span>
                      </label>
                    )}
                    {!issuedReceipt && !needsDetails && !booking.receiptNumber && Number(manualReceiptDiscount) > 0 && (
                      <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <input type="checkbox" checked={confirmReceiptReconciliation} disabled={isIssuingReceipt} onChange={(event) => setConfirmReceiptReconciliation(event.target.checked)} className="mt-0.5 h-4 w-4" />
                        <span className="text-xs text-amber-950"><strong className="block">{tr("Confirm reconciliation")}</strong><span className="mt-1 block leading-5">{tr("I confirm any payment adjustment or refund has been handled. Issuing the receipt will save the discounted total and paid amount to the database and refresh the bookings list. No Square refund is sent automatically.")}</span></span>
                      </label>
                    )}
                    {!issuedReceipt && !needsDetails && (
                      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-5 text-slate-500">{!paidInFull ? tr("Receipts are available only after full payment is recorded.") : !booking.email ? tr("Add a valid patient email to the booking before issuing a receipt.") : !booking.id ? tr("This appointment is not linked to a booking record.") : tr("A receipt will be emailed to the patient and recorded with this booking.")}</p>
                        <button type="button" disabled={isIssuingReceipt || !paidInFull || !booking.email || !booking.id || (!booking.receiptNumber && Number(manualReceiptDiscount) > 0 && !confirmReceiptReconciliation)} onClick={() => issueReceipt(booking.id)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><ReceiptText className="h-4 w-4" />{isIssuingReceipt ? tr("Issuing…") : tr("Issue & email receipt")}</button>
                      </div>
                    )}
                    {booking.id && (
                      <BookingNote key={booking.id} bookingId={booking.id} initialNote={booking.bookingNote || selectedCalendarEvent.booking?.bookingNote || ''} onSaved={async (note) => {
                        setSelectedCalendarEvent((current) => current ? { ...current, booking: { ...current.booking, bookingNote: note } } : current);
                        setIssuedReceipt((current) => current ? { ...current, booking: { ...current.booking, bookingNote: note } } : current);
                        setBookings((current) => current.map((item) => item.id === booking.id ? { ...item, bookingNote: note } : item));
                        await Promise.all([loadCalendar(), loadBookingsFromBackend()]);
                      }} />
                    )}
                    {booking.id && (
                      <div className="space-y-3 border-t border-slate-100 pt-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">{tr("Notes")}</h4>
                        {appointmentNotesError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{tr(appointmentNotesError)}</div>}
                        <div className="flex items-start gap-2">
                          <textarea
                            value={newAppointmentNote}
                            onChange={(event) => setNewAppointmentNote(event.target.value)}
                            placeholder={tr("Log a quick note about this appointment...")}
                            rows={2}
                            maxLength={2000}
                            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm resize-none"
                          />
                          <button
                            type="button"
                            disabled={isSavingAppointmentNote || !newAppointmentNote.trim()}
                            onClick={addAppointmentNote}
                            className="shrink-0 rounded-xl bg-emerald-950 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSavingAppointmentNote ? tr("Saving…") : tr("Add note")}
                          </button>
                        </div>
                        {isLoadingAppointmentNotes ? (
                          <p className="text-xs text-slate-400">{tr("Loading notes…")}</p>
                        ) : appointmentNotes.length === 0 ? (
                          <p className="text-xs text-slate-400">{tr("No notes logged for this appointment yet.")}</p>
                        ) : (
                          <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
                            {appointmentNotes.map((item) => (
                              <li key={item.noteId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                                <p className="whitespace-pre-wrap text-slate-800">{item.note}</p>
                                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.createdBy} · {item.createdAt ? new Date(item.createdAt).toLocaleString(locale) : ''}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{tr("This calendar event could not be automatically linked to a booking record. Reload the calendar to try again.")}</div>
                );
              })()}
            </div>
            {issuedReceipt && <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-4"><button type="button" onClick={() => printIssuedReceipt(issuedReceipt)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"><Download className="h-4 w-4" />{tr("Print / save PDF")}</button></div>}
          </section>
        </div>
      )}
        </main>
      </div>
    </div>
  );
}