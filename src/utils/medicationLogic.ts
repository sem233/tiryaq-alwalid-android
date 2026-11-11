export type MedicineType =
  | 'أقراص'
  | 'كبسولات'
  | 'شريط'
  | 'شراب / مل'
  | 'حقن / أمبول'
  | 'بخاخ'
  | 'أخرى';

export type CourseType = 'chronic' | 'fixed';

export interface Medicine {
  id: string;
  name: string;
  type: MedicineType | string;
  initialPills: number;
  dailyDose: number;
  startDate: string; // YYYY-MM-DD
  courseType: CourseType;
  courseDays: number | null;
  warningDays: number;
  notes: string;
}

export interface CourseInfo {
  daysElapsed: number;
  totalCourse: number;
  courseRemainingDays: number;
  isCourseFinished: boolean;
}

export interface MedicationMetrics {
  daysElapsed: number;
  consumedPills: number;
  currentPills: number;
  initialPills: number;
  daysRemaining: number;
  refillDateFormatted: string;
  percentage: number;
  isUrgent: boolean;
  isDepleted: boolean;
  courseInfo: CourseInfo | null;
}

export const STORAGE_KEY = 'tiryaq_elderly_medicines_v4';

export function formatIsoDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDefaultSampleMedicines(nowMs: number = Date.now()): Medicine[] {
  const dayMs = 86400000;
  return [
    {
      id: 'med_' + nowMs + '_1',
      name: 'كونكور 5 مجم (Concor)',
      type: 'أقراص',
      initialPills: 30,
      dailyDose: 1,
      // بدأ منذ 27 يوماً (متبقي 3 حبات -> يدخل في التنبيه العاجل)
      startDate: new Date(nowMs - 27 * dayMs).toISOString().split('T')[0],
      courseType: 'chronic',
      courseDays: null,
      warningDays: 3,
      notes: 'قرص واحد صباحاً بعد الإفطار لضغط الدم',
    },
    {
      id: 'med_' + nowMs + '_2',
      name: 'جلوكوفاج 1000 مجم (Glucophage)',
      type: 'أقراص',
      initialPills: 60,
      dailyDose: 2,
      // بدأ منذ 15 يوماً (متبقي 30 حبة تكفي 15 يوماً -> مستقر)
      startDate: new Date(nowMs - 15 * dayMs).toISOString().split('T')[0],
      courseType: 'chronic',
      courseDays: null,
      warningDays: 3,
      notes: 'قرص مع الغداء وقرص مع العشاء لضبط سكر الدم',
    },
    {
      id: 'med_' + nowMs + '_3',
      name: 'أوجمنتين 1 جم (Augmentin)',
      type: 'أقراص',
      initialPills: 14,
      dailyDose: 2,
      startDate: new Date(nowMs - 4 * dayMs).toISOString().split('T')[0],
      courseType: 'fixed',
      courseDays: 7,
      warningDays: 2,
      notes: 'مضاد حيوي كل 12 ساعة بعد الأكل لمدة 7 أيام',
    },
  ];
}

export function calculateMedicationMetrics(
  med: Medicine,
  referenceDate: Date = new Date()
): MedicationMetrics {
  const initialPills = Number(med.initialPills) || 30;
  const dailyDose = Number(med.dailyDose) || 1;
  const warningDays = Number(med.warningDays) || 3;

  const startParts = (med.startDate || formatIsoDate(referenceDate)).split('-');
  const startDate = new Date(
    parseInt(startParts[0], 10),
    parseInt(startParts[1], 10) - 1,
    parseInt(startParts[2], 10)
  );
  startDate.setHours(0, 0, 0, 0);

  const now = new Date(referenceDate.getTime());
  now.setHours(0, 0, 0, 0);

  const diffTime = now.getTime() - startDate.getTime();
  const daysElapsed = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

  // المستهلك تلقائياً
  const consumedPills = Math.min(initialPills, +(daysElapsed * dailyDose).toFixed(2));

  // المتبقي الفعلي بالعلبة
  const currentPills = Math.max(0, +(initialPills - consumedPills).toFixed(2));

  // الأيام المتبقية
  const daysRemaining = dailyDose > 0 ? Math.floor(currentPills / dailyDose) : 0;

  // تاريخ النفاد التقريبي
  const totalDaysCapacity = dailyDose > 0 ? Math.floor(initialPills / dailyDose) : 0;
  const depletionDate = new Date(startDate.getTime() + totalDaysCapacity * 86400000);
  const refillDateFormatted = depletionDate.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const percentage =
    initialPills > 0
      ? Math.min(100, Math.max(0, Math.round((currentPills / initialPills) * 100)))
      : 0;
  const isDepleted = currentPills <= 0;
  const isUrgent = isDepleted || daysRemaining <= warningDays;

  let courseInfo: CourseInfo | null = null;
  if (med.courseType === 'fixed' && med.courseDays) {
    const totalCourse = parseInt(String(med.courseDays), 10);
    const courseDaysRemaining = Math.max(0, totalCourse - daysElapsed);
    const isCourseFinished = daysElapsed >= totalCourse;
    courseInfo = {
      daysElapsed,
      totalCourse,
      courseRemainingDays: courseDaysRemaining,
      isCourseFinished,
    };
  }

  return {
    daysElapsed,
    consumedPills,
    currentPills,
    initialPills,
    daysRemaining,
    refillDateFormatted,
    percentage,
    isUrgent,
    isDepleted,
    courseInfo,
  };
}

export function getUrgentMedicinesList(
  medicines: Medicine[],
  referenceDate: Date = new Date()
): Array<{ id: string; name: string; days: number; pills: number; isDepleted: boolean }> {
  const urgentMeds: Array<{
    id: string;
    name: string;
    days: number;
    pills: number;
    isDepleted: boolean;
  }> = [];

  for (const med of medicines) {
    const metrics = calculateMedicationMetrics(med, referenceDate);
    if (metrics.courseInfo && metrics.courseInfo.isCourseFinished) continue;
    if (metrics.isUrgent) {
      urgentMeds.push({
        id: med.id,
        name: med.name,
        days: metrics.daysRemaining,
        pills: metrics.currentPills,
        isDepleted: metrics.isDepleted,
      });
    }
  }

  return urgentMeds;
}

export function calculatePortfolioStats(
  medicines: Medicine[],
  referenceDate: Date = new Date()
) {
  const totalMeds = medicines.length;
  let urgentCount = 0;
  let totalPills = 0;
  let chronicCount = 0;
  let safeCount = 0;

  for (const m of medicines) {
    const metrics = calculateMedicationMetrics(m, referenceDate);
    totalPills += metrics.currentPills;
    if (metrics.isUrgent) urgentCount++;
    else safeCount++;
    if (m.courseType !== 'fixed') chronicCount++;
  }

  return {
    totalMeds,
    urgentCount,
    totalPills: Math.round(totalPills),
    chronicCount,
    safeCount,
  };
}
