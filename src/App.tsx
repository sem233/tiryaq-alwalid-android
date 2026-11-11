/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  STORAGE_KEY,
  calculateMedicationMetrics,
  calculatePortfolioStats,
  formatIsoDate,
  getDefaultSampleMedicines,
  getUrgentMedicinesList,
  type Medicine,
} from './utils/medicationLogic';
import {
  getAudioContext,
  markUserInteraction,
  playSuccessChime,
  startContinuousSoundLoop,
  stopContinuousSoundLoop,
  triggerStrongAndroidNotification,
} from './utils/soundEngine';
import { MedicineCard } from './components/MedicineCard';
import {
  AdjustBalanceModal,
  DeleteConfirmModal,
  MedicineFormModal,
  QuickRefillModal,
} from './components/MedicineModals';
import { AndroidGithubModal } from './components/AndroidGithubModal';
import { usePWAInstall } from './hooks/usePWAInstall';

type FilterType = 'all' | 'urgent' | 'safe';

export default function App() {
  const [medicines, setMedicines] = useState<Medicine[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore corrupted storage
    }
    const defaults = getDefaultSampleMedicines();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    } catch {
      // ignore
    }
    return defaults;
  });

  const [currentFilter, setCurrentFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Alarm & Notification state
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);
  const [isTestAlarmActive, setIsTestAlarmActive] = useState(false);
  const [alarmBannerText, setAlarmBannerText] = useState(
    'بحساب الأيام التلقائي، وصلت بعض الأدوية إلى الحد الأدنى وتتطلب الشراء الفوري من الصيدلية.'
  );
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [refillMedId, setRefillMedId] = useState<string | null>(null);
  const [adjustMedId, setAdjustMedId] = useState<string | null>(null);
  const [deleteMedId, setDeleteMedId] = useState<string | null>(null);
  const [isAndroidModalOpen, setIsAndroidModalOpen] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'warning' | 'info';
  }>({
    visible: false,
    message: 'تمت العملية بنجاح',
    type: 'success',
  });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // PWA & Offline status
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const showToast = useCallback(
    (message: string, type: 'success' | 'warning' | 'info' = 'success') => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      setToast({ visible: true, message, type });
      toastTimerRef.current = setTimeout(() => {
        setToast((prev) => ({ ...prev, visible: false }));
      }, 3500);
    },
    []
  );

  const startContinuousAlarm = useCallback((message: string) => {
    setIsAlarmRinging(true);
    if (message) {
      setAlarmBannerText(message);
    }
    startContinuousSoundLoop();
  }, []);

  const stopContinuousAlarm = useCallback(
    (silent = false) => {
      stopContinuousSoundLoop();
      setIsAlarmRinging(false);
      setIsTestAlarmActive(false);
      if (!silent) {
        showToast('تم إيقاف الرنين مؤقتاً', 'info');
      }
    },
    [showToast]
  );

  const checkAllMedicationsRefillStatus = useCallback(
    (medsList: Medicine[]) => {
      const urgentMeds = getUrgentMedicinesList(medsList);
      if (urgentMeds.length > 0) {
        const first = urgentMeds[0];
        const message =
          first.pills <= 0
            ? `تنبيه: دواء (${first.name}) نفد تماماً بحساب الأيام التلقائي! اشترِ العلبة الآن.`
            : `تنبيه عاجل: دواء (${first.name}) سينفد خلال ${first.days} يوم (متبقي ${first.pills} كبسولة).`;

        startContinuousAlarm(message);
        triggerStrongAndroidNotification('ترياق الوالد | تنبيه تجديد عاجل', message);
      } else {
        stopContinuousSoundLoop();
        setIsAlarmRinging(false);
        setIsTestAlarmActive(false);
      }
    },
    [startContinuousAlarm]
  );

  // Sync medicines to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(medicines));
    } catch {
      // ignore
    }
  }, [medicines]);

  // Initial check + 60-second automatic interval + user gesture audio unlock
  useEffect(() => {
    checkAllMedicationsRefillStatus(medicines);

    const enableAudioOnUserGesture = () => {
      markUserInteraction();
      getAudioContext();
      document.removeEventListener('click', enableAudioOnUserGesture);
      document.removeEventListener('keydown', enableAudioOnUserGesture);
    };
    document.addEventListener('click', enableAudioOnUserGesture);
    document.addEventListener('keydown', enableAudioOnUserGesture);

    const interval = setInterval(() => {
      checkAllMedicationsRefillStatus(medicines);
    }, 60000);

    return () => {
      clearInterval(interval);
      document.removeEventListener('click', enableAudioOnUserGesture);
      document.removeEventListener('keydown', enableAudioOnUserGesture);
    };
  }, [medicines, checkAllMedicationsRefillStatus]);

  // Online / Offline connectivity listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleTestAlarm = () => {
    markUserInteraction();
    if (isAlarmRinging || isTestAlarmActive) {
      stopContinuousAlarm();
    } else {
      setIsTestAlarmActive(true);
      startContinuousAlarm('هذه تجربة لفحص نغمة الرنين المستمر والتأكد من وضوح الصوت.');
    }
  };

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      showToast('متصفحك لا يدعم خاصية الإشعارات', 'warning');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotifPerm(permission);
      if (permission === 'granted') {
        showToast('تم تفعيل إشعارات التجديد القوية بنجاح!', 'success');
        await triggerStrongAndroidNotification(
          'ترياق الوالد | تم التفعيل',
          'سيصلك تنبيه تلقائي قوي مع اهتزاز ورنين بمجرد وصول أي دواء لموعد التجديد.'
        );
      } else if (permission === 'denied') {
        showToast('تم حظر الإشعارات من إعدادات المتصفح/الهاتف', 'warning');
      }
    } catch {
      showToast('تعذر طلب صلاحية الإشعارات', 'warning');
    }
  };

  const handleSaveMedicine = (medData: Omit<Medicine, 'id'>, existingId?: string) => {
    let nextMeds: Medicine[];
    if (existingId) {
      nextMeds = medicines.map((m) => (m.id === existingId ? { ...medData, id: existingId } : m));
      showToast(`تم تحديث بيانات (${medData.name})`, 'success');
    } else {
      const newMed: Medicine = {
        ...medData,
        id: 'med_' + Date.now(),
      };
      nextMeds = [newMed, ...medicines];
      showToast(`تمت إضافة (${medData.name}) وبدء الحساب التلقائي`, 'success');
      playSuccessChime();
    }
    setMedicines(nextMeds);
    setIsFormModalOpen(false);
    setEditingMedId(null);
    checkAllMedicationsRefillStatus(nextMeds);
  };

  const handleConfirmRefill = (medId: string, newPackCount: number, carryOver: boolean) => {
    const target = medicines.find((m) => m.id === medId);
    if (!target) return;

    const metrics = calculateMedicationMetrics(target);
    const shouldCarry = carryOver && metrics.currentPills > 0;
    const totalStartingPills = shouldCarry
      ? +(newPackCount + metrics.currentPills).toFixed(2)
      : newPackCount;

    const nextMeds = medicines.map((m) =>
      m.id === medId
        ? {
            ...m,
            initialPills: totalStartingPills,
            startDate: formatIsoDate(),
          }
        : m
    );

    setMedicines(nextMeds);
    setRefillMedId(null);
    playSuccessChime();
    showToast(`مبارك! تم تجديد (${target.name}) برصيد ${totalStartingPills} حبة`, 'success');
    checkAllMedicationsRefillStatus(nextMeds);
  };

  const handleConfirmAdjust = (medId: string, actualCount: number) => {
    const target = medicines.find((m) => m.id === medId);
    if (!target) return;

    const nextMeds = medicines.map((m) =>
      m.id === medId
        ? {
            ...m,
            initialPills: actualCount,
            startDate: formatIsoDate(),
          }
        : m
    );

    setMedicines(nextMeds);
    setAdjustMedId(null);
    playSuccessChime();
    showToast(`تمت مزامنة رصيد (${target.name}) ليكون ${actualCount} حبة من اليوم`, 'success');
    checkAllMedicationsRefillStatus(nextMeds);
  };

  const handleConfirmDelete = (medId: string) => {
    const target = medicines.find((m) => m.id === medId);
    const name = target ? target.name : 'الدواء';
    const nextMeds = medicines.filter((m) => m.id !== medId);
    setMedicines(nextMeds);
    setDeleteMedId(null);
    showToast(`تم حذف (${name})`, 'info');
    checkAllMedicationsRefillStatus(nextMeds);
  };

  const stats = calculatePortfolioStats(medicines);

  const filteredMedicines = medicines.filter((med) => {
    const metrics = calculateMedicationMetrics(med);
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      med.name.toLowerCase().includes(q) ||
      (med.notes && med.notes.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (currentFilter === 'urgent') return metrics.isUrgent;
    if (currentFilter === 'safe') return !metrics.isUrgent;
    return true;
  });

  const editingMedicine = editingMedId
    ? medicines.find((m) => m.id === editingMedId) || null
    : null;
  const refillMedicine = refillMedId ? medicines.find((m) => m.id === refillMedId) || null : null;
  const adjustMedicine = adjustMedId ? medicines.find((m) => m.id === adjustMedId) || null : null;
  const deleteMedicine = deleteMedId ? medicines.find((m) => m.id === deleteMedId) || null : null;

  return (
    <div
      dir="rtl"
      className="min-h-screen text-slate-800 flex flex-col selection:bg-emerald-100 selection:text-emerald-900"
    >
      {/* شريط الإنذار الصوتي الفوري (يظهر عند اقتراب نفاد أي دواء) */}
      {isAlarmRinging && (
        <div
          id="alarmBanner"
          className="bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 text-white shadow-xl px-4 py-3 sticky top-0 z-50 transition-all"
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-xl shrink-0 pulse-urgent">
                <i className="fa-solid fa-bell animate-bounce"></i>
              </span>
              <div>
                <h2 className="font-black text-sm sm:text-base tracking-wide flex items-center gap-2">
                  <span>تنبيه عاجل: موعد تجديد وشراء دواء للوالد!</span>
                  <span className="text-xs bg-white text-rose-700 font-extrabold px-2 py-0.5 rounded-full">
                    رنين متواصل
                  </span>
                </h2>
                <p id="alarmBannerText" className="text-xs text-rose-100 font-semibold mt-0.5">
                  {alarmBannerText}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => stopContinuousAlarm(false)}
                className="w-full sm:w-auto px-5 py-2 bg-white hover:bg-rose-50 text-rose-700 font-black rounded-xl text-xs sm:text-sm shadow transition flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-bell-slash"></i>
                <span>إيقاف الرنين الآن</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ترويسة الصفحة وقائمة التحكم */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 backdrop-blur-md bg-white/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          {/* شعار التطبيق وعنوانه */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl shadow-md shadow-emerald-500/20">
              <i className="fa-solid fa-prescription-bottle-medical"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
                  ترياق الوالد
                </h1>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <i className="fa-brands fa-android text-emerald-600"></i>
                  <span>نسخة الأندرويد</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                نظام الحساب التلقائي والتذكير المسبق بتجديد الأدوية
              </p>
            </div>
          </div>

          {/* أزرار الإجراءات السريعة */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* زر التثبيت المباشر على الأندرويد إذا كان متاحاً */}
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await install();
                  if (ok) showToast('تم تثبيت التطبيق على الهاتف بنجاح!', 'success');
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition flex items-center gap-1.5"
              >
                <i className="fa-solid fa-mobile-screen-button text-emerald-400"></i>
                <span>تثبيت على الهاتف</span>
              </button>
            )}

            {/* زر الأندرويد (APK) والرفع إلى GitHub Releases */}
            <button
              type="button"
              id="androidGithubBtn"
              onClick={() => setIsAndroidModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 transition flex items-center gap-1.5"
            >
              <i className="fa-brands fa-android text-emerald-600 text-sm"></i>
              <span>تطبيق الأندرويد &amp; GitHub APK</span>
            </button>

            <button
              type="button"
              id="testAlarmBtn"
              onClick={toggleTestAlarm}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                isTestAlarmActive
                  ? 'bg-rose-100 text-rose-700 border-rose-300'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
              }`}
            >
              {isTestAlarmActive ? (
                <>
                  <i className="fa-solid fa-stop text-rose-600"></i>
                  <span className="hidden md:inline">إيقاف التجربة</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-volume-high text-emerald-600"></i>
                  <span className="hidden md:inline">تجربة الرنين</span>
                </>
              )}
            </button>

            {notifPerm !== 'unsupported' && (
              <button
                type="button"
                id="notifPermBtn"
                onClick={requestNotificationPermission}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                  notifPerm === 'granted'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : notifPerm === 'denied'
                    ? 'border-amber-200 bg-amber-50 text-amber-800 opacity-60'
                    : 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800'
                }`}
              >
                <i className="fa-solid fa-bell"></i>
                <span id="notifStatusText">
                  {notifPerm === 'granted'
                    ? 'الإشعارات مفعلة'
                    : notifPerm === 'denied'
                    ? 'الإشعارات محظورة'
                    : 'تفعيل الإشعارات'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition flex items-center gap-1.5"
            >
              <i className="fa-solid fa-print"></i>
              <span className="hidden md:inline">طباعة الكشف</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingMedId(null);
                setIsFormModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5"
            >
              <i className="fa-solid fa-plus"></i>
              <span>إضافة دواء</span>
            </button>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">
        {/* بطاقات الإحصائيات السريعة */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 block mb-1">
                إجمالي الأدوية المسجلة
              </span>
              <span
                id="statTotalMeds"
                className="text-2xl sm:text-3xl font-black text-slate-800"
              >
                {stats.totalMeds}
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl shrink-0">
              <i className="fa-solid fa-pills"></i>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-rose-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-rose-500 block mb-1">
                تجديد عاجل مطلوب
              </span>
              <span
                id="statUrgentMeds"
                className="text-2xl sm:text-3xl font-black text-rose-600"
              >
                {stats.urgentCount}
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl shrink-0 pulse-urgent">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 block mb-1">
                الكبسولات المتوفرة حالياً
              </span>
              <span
                id="statTotalPills"
                className="text-2xl sm:text-3xl font-black text-emerald-600"
              >
                {stats.totalPills}
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shrink-0">
              <i className="fa-solid fa-capsules"></i>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 block mb-1">
                علاجات مزمنة ومستمرة
              </span>
              <span
                id="statChronicMeds"
                className="text-2xl sm:text-3xl font-black text-purple-600"
              >
                {stats.chronicCount}
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl shrink-0">
              <i className="fa-solid fa-infinity"></i>
            </div>
          </div>
        </div>

        {/* شريط البحث والتصفية */}
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
          {/* حقل البحث */}
          <div className="relative w-full md:w-80">
            <i className="fa-solid fa-magnifying-glass absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              type="text"
              id="searchInput"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم الدواء أو الملاحظات..."
              className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-xs sm:text-sm font-semibold outline-none transition"
            />
          </div>

          {/* أزرار التصفية */}
          <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => setCurrentFilter('all')}
              className={`filter-btn px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                currentFilter === 'all'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>كل الأدوية</span>
              <span
                id="countFilterAll"
                className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px]"
              >
                {stats.totalMeds}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentFilter('urgent')}
              className={`filter-btn px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                currentFilter === 'urgent'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>تجديد عاجل</span>
              <span
                id="countFilterUrgent"
                className="px-1.5 py-0.5 rounded-md bg-rose-200 text-rose-800 text-[10px]"
              >
                {stats.urgentCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentFilter('safe')}
              className={`filter-btn px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                currentFilter === 'safe'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>آمن ومستقر</span>
              <span
                id="countFilterSafe"
                className="px-1.5 py-0.5 rounded-md bg-emerald-200 text-emerald-800 text-[10px]"
              >
                {stats.safeCount}
              </span>
            </button>
          </div>
        </div>

        {/* شبكة بطاقات الأدوية بالحساب التلقائي */}
        {filteredMedicines.length > 0 ? (
          <div
            id="medicinesGrid"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filteredMedicines.map((med) => (
              <MedicineCard
                key={med.id}
                med={med}
                onEdit={(id) => {
                  setEditingMedId(id);
                  setIsFormModalOpen(true);
                }}
                onDelete={(id) => setDeleteMedId(id)}
                onAdjust={(id) => setAdjustMedId(id)}
                onRefill={(id) => setRefillMedId(id)}
              />
            ))}
          </div>
        ) : (
          <div
            id="emptyState"
            className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8"
          >
            <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-3xl mx-auto mb-4">
              <i className="fa-solid fa-box-open"></i>
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-800 mb-1">
              لا توجد أدوية مطابقة للبحث أو التصفية
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto mb-5 font-semibold">
              أضف أدوية الوالد لبدء الحساب التلقائي اليومي وتلقي التنبيهات المسبقة قبل نفاد العلبة.
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingMedId(null);
                setIsFormModalOpen(true);
              }}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition inline-flex items-center gap-2"
            >
              <i className="fa-solid fa-plus"></i> إضافة دواء جديد
            </button>
          </div>
        )}
      </main>

      {/* النوافذ المنبثقة لإدارة الأدوية */}
      <MedicineFormModal
        isOpen={isFormModalOpen}
        editingMedicine={editingMedicine}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingMedId(null);
        }}
        onSave={handleSaveMedicine}
      />

      <QuickRefillModal
        medicine={refillMedicine}
        onClose={() => setRefillMedId(null)}
        onConfirm={handleConfirmRefill}
      />

      <AdjustBalanceModal
        medicine={adjustMedicine}
        onClose={() => setAdjustMedId(null)}
        onConfirm={handleConfirmAdjust}
      />

      <DeleteConfirmModal
        medicine={deleteMedicine}
        onClose={() => setDeleteMedId(null)}
        onConfirm={handleConfirmDelete}
      />

      <AndroidGithubModal
        isOpen={isAndroidModalOpen}
        onClose={() => setIsAndroidModalOpen(false)}
        onShowToast={showToast}
      />

      {/* مؤشر العمل بدون إنترنت (Offline PWA Indicator) */}
      {!isOnline && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-lg">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span>وضع عدم الاتصال (Offline) — يعمل التطبيق بكامل كفاءته محلياً</span>
        </div>
      )}

      {/* رسالة تنبيه منبثقة عائمة (Toast Message) */}
      {toast.visible && (
        <div
          id="toast"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-slate-900/90 text-white text-sm font-bold shadow-2xl backdrop-blur-md flex items-center gap-3 transition-all duration-300"
        >
          <i
            className={
              toast.type === 'success'
                ? 'fa-solid fa-circle-check text-emerald-400 text-base'
                : toast.type === 'warning'
                ? 'fa-solid fa-triangle-exclamation text-amber-400 text-base'
                : 'fa-solid fa-circle-info text-blue-400 text-base'
            }
          ></i>
          <span id="toastMsg">{toast.message}</span>
        </div>
      )}

      {/* تذييل الصفحة */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="font-bold text-slate-700">
              نظام الحساب التلقائي والرنين الفوري نشط (جاهز للتثبيت على الأندرويد)
            </span>
          </div>
          <div>
            حساب تلقائي 100% بمرور الأيام • بدون تسجيل يومي • حفظ دائم محلياً على هاتفك
          </div>
        </div>
      </footer>
    </div>
  );
}
