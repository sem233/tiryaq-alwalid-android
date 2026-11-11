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
  checkNotificationPermissionState,
  ensureAndroidNotificationChannel,
  getAudioContext,
  getSelectedSystemRingtoneInfo,
  markUserInteraction,
  playSuccessChime,
  requestAllNotificationPermissions,
  scheduleBackgroundMedicationAlarms,
  scheduleClosedAppTestNotification,
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
  const [closedTestCountdown, setClosedTestCountdown] = useState<number | null>(null);
  const [alarmBannerText, setAlarmBannerText] = useState(
    'بحساب الأيام التلقائي، وصلت بعض الأدوية إلى الحد الأدنى وتتطلب الشراء الفوري من الصيدلية.'
  );
  const [notifPerm, setNotifPerm] = useState<'granted' | 'denied' | 'default' | 'unsupported'>(
    'default'
  );

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [refillMedId, setRefillMedId] = useState<string | null>(null);
  const [adjustMedId, setAdjustMedId] = useState<string | null>(null);
  const [deleteMedId, setDeleteMedId] = useState<string | null>(null);
  const [isRingtoneModalOpen, setIsRingtoneModalOpen] = useState(false);

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

  // Sync medicines to localStorage and schedule background Android alarms
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(medicines));
    } catch {
      // ignore
    }
    scheduleBackgroundMedicationAlarms(medicines);
  }, [medicines]);

  // Countdown timer for closed-app test alarm
  useEffect(() => {
    if (closedTestCountdown === null) return;
    if (closedTestCountdown <= 0) {
      setClosedTestCountdown(null);
      return;
    }
    const timer = setTimeout(() => {
      setClosedTestCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [closedTestCountdown]);

  // Initial permission check, system ringtone info sync, and background visibility sync
  useEffect(() => {
    getSelectedSystemRingtoneInfo();
    ensureAndroidNotificationChannel();
    checkNotificationPermissionState().then((state) => {
      setNotifPerm(state);
    });
    checkAllMedicationsRefillStatus(medicines);

    const enableAudioOnUserGesture = () => {
      markUserInteraction();
      getAudioContext();
      document.removeEventListener('click', enableAudioOnUserGesture);
      document.removeEventListener('keydown', enableAudioOnUserGesture);
      document.removeEventListener('touchstart', enableAudioOnUserGesture);
    };
    document.addEventListener('click', enableAudioOnUserGesture);
    document.addEventListener('keydown', enableAudioOnUserGesture);
    document.addEventListener('touchstart', enableAudioOnUserGesture);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        scheduleBackgroundMedicationAlarms(medicines);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = setInterval(() => {
      checkAllMedicationsRefillStatus(medicines);
    }, 60000);

    return () => {
      clearInterval(interval);
      document.removeEventListener('click', enableAudioOnUserGesture);
      document.removeEventListener('keydown', enableAudioOnUserGesture);
      document.removeEventListener('touchstart', enableAudioOnUserGesture);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [medicines, checkAllMedicationsRefillStatus]);

  const toggleTestAlarm = () => {
    markUserInteraction();
    if (isAlarmRinging || isTestAlarmActive) {
      stopContinuousAlarm();
    } else {
      setIsTestAlarmActive(true);
      startContinuousAlarm('هذه تجربة لفحص نغمة الرنين المستمر والتأكد من وضوح الصوت.');
    }
  };

  const handleQuickClosedAppTest = async () => {
    markUserInteraction();
    stopContinuousSoundLoop();
    setIsAlarmRinging(false);
    setIsTestAlarmActive(false);
    const scheduled = await scheduleClosedAppTestNotification(10, alarmBannerText);
    if (scheduled) {
      setClosedTestCountdown(10);
      showToast(
        'تم ضبط منبه الاختبار بعد 10 ثوانٍ! أغلق التطبيق تماماً الآن للتجربة.',
        'success'
      );
    } else {
      showToast('يرجى السماح بصلاحية الإشعارات أولاً لتجربة الإشعار', 'warning');
    }
  };

  const requestNotificationPermission = async () => {
    markUserInteraction();
    try {
      const permission = await requestAllNotificationPermissions();
      setNotifPerm(permission);
      if (permission === 'granted') {
        await scheduleBackgroundMedicationAlarms(medicines);
        showToast('تم تفعيل الإشعارات الخلفية القوية بنجاح!', 'success');
        await triggerStrongAndroidNotification(
          'ترياق الوالد | تم التفعيل',
          'سيصلك تنبيه تلقائي قوي بصوت هاتفك بمجرد وصول أي دواء لموعد التجديد حتى والتطبيق مغلق.'
        );
      } else if (permission === 'denied') {
        showToast('يرجى السماح بالإشعارات من إعدادات الهاتف لتفعيل التنبيهات', 'warning');
      }
    } catch {
      showToast('تعذر طلب صلاحية الإشعارات', 'warning');
    }
  };

  const handleSaveMedicine = (medData: Omit<Medicine, 'id'>, existingId?: string) => {
    markUserInteraction();
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
    markUserInteraction();
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
    markUserInteraction();
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
      className="min-h-screen w-full max-w-full overflow-x-hidden text-slate-800 flex flex-col selection:bg-emerald-100 selection:text-emerald-900"
    >
      {/* شريط الإنذار الصوتي الفوري (يظهر عند اقتراب نفاد أي دواء) */}
      {isAlarmRinging && (
        <div
          id="alarmBanner"
          className="bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 text-white shadow-xl px-3.5 sm:px-4 py-3 sticky top-0 z-50 transition-all"
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-xl shrink-0 pulse-urgent">
                <i className="fa-solid fa-bell animate-bounce"></i>
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-black text-xs sm:text-base tracking-wide flex flex-wrap items-center gap-1.5">
                  <span>تنبيه عاجل: موعد تجديد وشراء دواء للوالد!</span>
                  <span className="text-[10px] sm:text-xs bg-white text-rose-700 font-extrabold px-2 py-0.5 rounded-full">
                    رنين متواصل
                  </span>
                </h2>
                <p
                  id="alarmBannerText"
                  className="text-[11px] sm:text-xs text-rose-100 font-semibold mt-0.5 leading-snug"
                >
                  {alarmBannerText}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => stopContinuousAlarm(false)}
                className="w-full sm:w-auto px-5 py-2 bg-white hover:bg-rose-50 text-rose-700 font-black rounded-xl text-xs sm:text-sm shadow transition flex items-center justify-center gap-2 active:scale-95"
              >
                <i className="fa-solid fa-bell-slash"></i>
                <span>إيقاف الرنين الآن</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* شريط العد التنازلي لاختبار وصول الإشعار والتطبيق مغلق تماماً */}
      {closedTestCountdown !== null && (
        <div
          id="closedTestBanner"
          className="bg-emerald-700 text-white shadow-lg px-3.5 py-2.5 sticky top-0 z-50 text-center text-xs sm:text-sm font-black animate-pulse"
        >
          ⏱️ اختبار الإشعار والتطبيق ميت/مغلق: اخرج من التطبيق أو امسحه من الخلفية الآن! سيرن الهاتف
          بنغمة هاتفك المختارة بعد ({closedTestCountdown}) ثانية...
        </div>
      )}

      {/* ترويسة الصفحة وقائمة التحكم بمحاذات متوافقة تماماً مع شاشة الهاتف */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 backdrop-blur-md bg-white/95">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
          {/* الصف الأول في الهاتف: الشعار والعنوان + زر إضافة دواء */}
          <div className="flex items-center justify-between gap-2 w-full lg:w-auto">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-lg sm:text-xl shadow-md shadow-emerald-500/20 shrink-0">
                <i className="fa-solid fa-prescription-bottle-medical"></i>
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base sm:text-xl font-black text-slate-900 leading-tight">
                  ترياق الوالد
                </h1>
                <p className="text-[10px] sm:text-xs text-slate-500 font-bold flex items-center gap-1 leading-tight mt-0.5">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="line-clamp-1">
                    نظام الحساب التلقائي والتذكير المسبق بتجديد الأدوية
                  </span>
                </p>
              </div>
            </div>

            {/* زر الإضافة السريع في الهاتف بأعلى اليسار داخل حدود الشاشة تماماً */}
            <button
              type="button"
              onClick={() => {
                setEditingMedId(null);
                setIsFormModalOpen(true);
              }}
              className="lg:hidden px-3 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5 shrink-0 active:scale-95"
            >
              <i className="fa-solid fa-plus"></i>
              <span>إضافة دواء</span>
            </button>
          </div>

          {/* أزرار الإجراءات السريعة بمحاذات متناسقة للهاتف والكمبيوتر */}
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-1.5 sm:gap-2 w-full lg:w-auto">
            <button
              type="button"
              id="testAlarmBtn"
              onClick={toggleTestAlarm}
              className={`flex-1 lg:flex-initial justify-center px-2 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold border transition flex items-center gap-1 whitespace-nowrap active:scale-95 ${
                isTestAlarmActive
                  ? 'bg-rose-100 text-rose-700 border-rose-300'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
              }`}
            >
              {isTestAlarmActive ? (
                <>
                  <i className="fa-solid fa-stop text-rose-600"></i>
                  <span>إيقاف التجربة</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-volume-high text-emerald-600"></i>
                  <span>تجربة الرنين</span>
                </>
              )}
            </button>

            <button
              type="button"
              id="ringtonePickerBtn"
              onClick={() => setIsRingtoneModalOpen(true)}
              className="flex-1 lg:flex-initial justify-center px-2 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition flex items-center gap-1 whitespace-nowrap active:scale-95"
            >
              <i className="fa-solid fa-music text-emerald-600"></i>
              <span>نغمة الهاتف</span>
            </button>

            <button
              type="button"
              id="closedAppTestBtn"
              onClick={handleQuickClosedAppTest}
              className="flex-1 lg:flex-initial justify-center px-2 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 transition flex items-center gap-1 whitespace-nowrap active:scale-95"
            >
              <i className="fa-solid fa-clock text-rose-600"></i>
              <span>اختبار وهو مغلق</span>
            </button>

            {notifPerm !== 'unsupported' && (
              <button
                type="button"
                id="notifPermBtn"
                onClick={requestNotificationPermission}
                className={`flex-1 lg:flex-initial justify-center px-2 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold border transition flex items-center gap-1 whitespace-nowrap active:scale-95 ${
                  notifPerm === 'granted'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : notifPerm === 'denied'
                    ? 'border-amber-200 bg-amber-50 text-amber-800 opacity-75'
                    : 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800'
                }`}
              >
                <i className="fa-solid fa-bell"></i>
                <span id="notifStatusText">
                  {notifPerm === 'granted' ? 'الإشعارات مفعلة' : 'تفعيل الإشعارات'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              title="طباعة الكشف"
              aria-label="طباعة الكشف"
              className="px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition flex items-center justify-center gap-1.5 shrink-0"
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
              className="hidden lg:flex px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition items-center gap-1.5 whitespace-nowrap active:scale-95"
            >
              <i className="fa-solid fa-plus"></i>
              <span>إضافة دواء</span>
            </button>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="max-w-7xl mx-auto px-3.5 sm:px-6 py-4 sm:py-6 flex-1 w-full space-y-4 sm:space-y-6">
        {/* بطاقات الإحصائيات السريعة */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-sm flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] sm:text-xs font-bold text-slate-500 block mb-0.5 leading-snug">
                إجمالي الأدوية المسجلة
              </span>
              <span
                id="statTotalMeds"
                className="text-2xl sm:text-3xl font-black text-slate-800"
              >
                {stats.totalMeds}
              </span>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg sm:text-xl shrink-0">
              <i className="fa-solid fa-pills"></i>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-rose-200 shadow-sm flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] sm:text-xs font-bold text-rose-500 block mb-0.5 leading-snug">
                تجديد عاجل مطلوب
              </span>
              <span
                id="statUrgentMeds"
                className="text-2xl sm:text-3xl font-black text-rose-600"
              >
                {stats.urgentCount}
              </span>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-lg sm:text-xl shrink-0 pulse-urgent">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-sm flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] sm:text-xs font-bold text-slate-500 block mb-0.5 leading-snug">
                الكبسولات المتوفرة حالياً
              </span>
              <span
                id="statTotalPills"
                className="text-2xl sm:text-3xl font-black text-emerald-600"
              >
                {stats.totalPills}
              </span>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg sm:text-xl shrink-0">
              <i className="fa-solid fa-capsules"></i>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-sm flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] sm:text-xs font-bold text-slate-500 block mb-0.5 leading-snug">
                علاجات مزمنة ومستمرة
              </span>
              <span
                id="statChronicMeds"
                className="text-2xl sm:text-3xl font-black text-purple-600"
              >
                {stats.chronicCount}
              </span>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-lg sm:text-xl shrink-0">
              <i className="fa-solid fa-infinity"></i>
            </div>
          </div>
        </div>

        {/* شريط البحث والتصفية بمحاذات متجاوبة للهاتف */}
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-3">
          {/* حقل البحث */}
          <div className="relative w-full md:w-80">
            <i className="fa-solid fa-magnifying-glass absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              type="text"
              id="searchInput"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم الدواء أو الملاحظات..."
              className="w-full pr-10 pl-4 py-2.5 sm:py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-xs sm:text-sm font-semibold outline-none transition"
            />
          </div>

          {/* أزرار التصفية */}
          <div className="grid grid-cols-3 md:flex items-center gap-1.5 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setCurrentFilter('all')}
              className={`filter-btn justify-center px-2.5 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
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
              className={`filter-btn justify-center px-2.5 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
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
              className={`filter-btn justify-center px-2.5 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
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
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4"
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
            className="text-center py-12 sm:py-16 bg-white rounded-3xl border border-slate-200 p-6 sm:p-8"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl sm:text-3xl mx-auto mb-4">
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
        isOpen={isRingtoneModalOpen}
        onClose={() => setIsRingtoneModalOpen(false)}
        onShowToast={showToast}
        urgentSummary={alarmBannerText}
      />

      {/* رسالة تنبيه منبثقة عائمة (Toast Message) */}
      {toast.visible && (
        <div
          id="toast"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md px-4 py-3 rounded-2xl bg-slate-900/95 text-white text-xs sm:text-sm font-bold shadow-2xl backdrop-blur-md flex items-center gap-3 transition-all duration-300"
        >
          <i
            className={
              toast.type === 'success'
                ? 'fa-solid fa-circle-check text-emerald-400 text-base shrink-0'
                : toast.type === 'warning'
                ? 'fa-solid fa-triangle-exclamation text-amber-400 text-base shrink-0'
                : 'fa-solid fa-circle-info text-blue-400 text-base shrink-0'
            }
          ></i>
          <span id="toastMsg" className="leading-snug">
            {toast.message}
          </span>
        </div>
      )}

      {/* تذييل الصفحة النظيف */}
      <footer className="bg-white border-t border-slate-200 py-5 mt-8 sm:mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="font-bold text-slate-700">
              نظام الحساب التلقائي والرنين الفوري نشط
            </span>
          </div>
          <div className="text-[11px] sm:text-xs">
            حساب تلقائي 100% بمرور الأيام • بدون تسجيل يومي • حفظ دائم محلياً على جهازك
          </div>
        </div>
      </footer>
    </div>
  );
}
