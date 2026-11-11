import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMedicationMetrics,
  calculatePortfolioStats,
  getUrgentMedicinesList,
  type Medicine,
} from './medicationLogic';

test('calculateMedicationMetrics computes automatic consumption and urgent status accurately', () => {
  const refDate = new Date(2026, 10, 11); // Nov 11, 2026
  const startDate = '2026-10-15'; // 27 days earlier

  const concor: Medicine = {
    id: 'med_1',
    name: 'كونكور 5 مجم',
    type: 'أقراص',
    initialPills: 30,
    dailyDose: 1,
    startDate,
    courseType: 'chronic',
    courseDays: null,
    warningDays: 3,
    notes: 'صباحاً',
  };

  const metrics = calculateMedicationMetrics(concor, refDate);
  assert.equal(metrics.daysElapsed, 27);
  assert.equal(metrics.consumedPills, 27);
  assert.equal(metrics.currentPills, 3);
  assert.equal(metrics.daysRemaining, 3);
  assert.equal(metrics.percentage, 10);
  assert.equal(metrics.isUrgent, true);
  assert.equal(metrics.isDepleted, false);
});

test('calculateMedicationMetrics marks stable medicine as non-urgent when daysRemaining > warningDays', () => {
  const refDate = new Date(2026, 10, 11);
  const glucophage: Medicine = {
    id: 'med_2',
    name: 'جلوكوفاج 1000 مجم',
    type: 'أقراص',
    initialPills: 60,
    dailyDose: 2,
    startDate: '2026-10-27', // 15 days earlier
    courseType: 'chronic',
    courseDays: null,
    warningDays: 3,
    notes: '',
  };

  const metrics = calculateMedicationMetrics(glucophage, refDate);
  assert.equal(metrics.daysElapsed, 15);
  assert.equal(metrics.consumedPills, 30);
  assert.equal(metrics.currentPills, 30);
  assert.equal(metrics.daysRemaining, 15);
  assert.equal(metrics.isUrgent, false);
  assert.equal(metrics.isDepleted, false);
});

test('calculateMedicationMetrics tracks fixed course completion and excludes finished courses from urgent alarms', () => {
  const refDate = new Date(2026, 10, 11);
  const finishedAntibiotic: Medicine = {
    id: 'med_3',
    name: 'أوجمنتين 1 جم',
    type: 'أقراص',
    initialPills: 14,
    dailyDose: 2,
    startDate: '2026-11-01', // 10 days earlier (> 7 day course)
    courseType: 'fixed',
    courseDays: 7,
    warningDays: 2,
    notes: '',
  };

  const metrics = calculateMedicationMetrics(finishedAntibiotic, refDate);
  assert.ok(metrics.courseInfo);
  assert.equal(metrics.courseInfo?.isCourseFinished, true);
  assert.equal(metrics.courseInfo?.courseRemainingDays, 0);

  const urgentList = getUrgentMedicinesList([finishedAntibiotic], refDate);
  assert.equal(urgentList.length, 0);
});

test('calculatePortfolioStats aggregates total, urgent, safe, chronic, and pill counts', () => {
  const refDate = new Date(2026, 10, 11);
  const meds: Medicine[] = [
    {
      id: 'm1',
      name: 'Concor',
      type: 'أقراص',
      initialPills: 30,
      dailyDose: 1,
      startDate: '2026-10-15', // 3 pills left -> urgent
      courseType: 'chronic',
      courseDays: null,
      warningDays: 3,
      notes: '',
    },
    {
      id: 'm2',
      name: 'Glucophage',
      type: 'أقراص',
      initialPills: 60,
      dailyDose: 2,
      startDate: '2026-10-27', // 30 pills left -> safe
      courseType: 'chronic',
      courseDays: null,
      warningDays: 3,
      notes: '',
    },
  ];

  const stats = calculatePortfolioStats(meds, refDate);
  assert.equal(stats.totalMeds, 2);
  assert.equal(stats.urgentCount, 1);
  assert.equal(stats.safeCount, 1);
  assert.equal(stats.totalPills, 33);
  assert.equal(stats.chronicCount, 2);
});
