import React, { useState, useEffect } from 'react';
import {
  calculateMedicationMetrics,
  formatIsoDate,
  type CourseType,
  type Medicine,
} from '../utils/medicationLogic';

interface AddEditModalProps {
  isOpen: boolean;
  editingMedicine: Medicine | null;
  onClose: () => void;
  onSave: (medData: Omit<Medicine, 'id'>, existingId?: string) => void;
}

export const MedicineFormModal: React.FC<AddEditModalProps> = ({
  isOpen,
  editingMedicine,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('أقراص');
  const [initialPills, setInitialPills] = useState<string>('30');
  const [dailyDose, setDailyDose] = useState<string>('1');
  const [startDate, setStartDate] = useState<string>(formatIsoDate());
  const [courseType, setCourseType] = useState<CourseType>('chronic');
  const [courseDays, setCourseDays] = useState<string>('');
  const [warningDays, setWarningDays] = useState<number>(3);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const today = formatIsoDate();
    if (editingMedicine) {
      setName(editingMedicine.name);
      setType(editingMedicine.type || 'أقراص');
      setInitialPills(String(editingMedicine.initialPills || 30));
      setDailyDose(String(editingMedicine.dailyDose || 1));
      setStartDate(editingMedicine.startDate || today);
      setCourseType(editingMedicine.courseType || 'chronic');
      setCourseDays(editingMedicine.courseDays ? String(editingMedicine.courseDays) : '');
      setWarningDays(editingMedicine.warningDays || 3);
      setNotes(editingMedicine.notes || '');
    } else {
      setName('');
      setType('أقراص');
      setInitialPills('30');
      setDailyDose('1');
      setStartDate(today);
      setCourseType('chronic');
      setCourseDays('');
      setWarningDays(3);
      setNotes('');
    }
  }, [isOpen, editingMedicine]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const parsedInitial = parseFloat(initialPills);
    const parsedDose = parseFloat(dailyDose);
    if (!trimmedName || isNaN(parsedInitial) || parsedInitial <= 0 || isNaN(parsedDose) || parsedDose <= 0) {
      return;
    }

    onSave(
      {
        name: trimmedName,
        type,
        initialPills: parsedInitial,
        dailyDose: parsedDose,
        startDate: startDate || formatIsoDate(),
        courseType,
        courseDays: courseType === 'fixed' ? parseInt(courseDays, 10) || 7 : null,
        warningDays,
        notes: notes.trim(),
      },
      editingMedicine?.id
    );
  };

  return (
    <div
      id="medicineModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalTitle"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden transform transition-all my-8">
        {/* ترويسة النافذة */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <i className="fa-solid fa-clock-rotate-left text-xl"></i>
            <h2 id="modalTitle" className="text-base sm:text-lg font-extrabold">
              {editingMedicine
                ? `تعديل بيانات دواء: ${editingMedicine.name}`
                : 'إضافة دواء جديد للوالد (حساب تلقائي)'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة الدواء"
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* نموذج البيانات التلقائي */}
        <form
          id="medicineForm"
          onSubmit={handleSubmit}
          className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"
        >
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-2xl text-xs flex items-center gap-2.5 font-semibold">
            <i className="fa-solid fa-circle-check text-emerald-600 text-base shrink-0"></i>
            <span>
              حساب ذاتي 100%: التطبيق سيحسب المستهلك والمتبقي وتاريخ النفاد تلقائياً من تاريخ البدء
              دون الحاجة لتسجيل جرعة يومية يدوياً.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label htmlFor="medName" className="block text-xs font-bold text-slate-700">
                اسم الدواء والتركيز <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                id="medName"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً: كونكور 5 مجم (Concor)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm font-semibold outline-none"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="medType" className="block text-xs font-bold text-slate-700">
                نوع المستحضر
              </label>
              <select
                id="medType"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm font-semibold outline-none bg-white"
              >
                <option value="أقراص">أقراص</option>
                <option value="كبسولات">كبسولات</option>
                <option value="شريط">شريط</option>
                <option value="شراب / مل">شراب / مل</option>
                <option value="حقن / أمبول">حقن / أمبول</option>
                <option value="بخاخ">بخاخ</option>
                <option value="أخرى">أخرى</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div className="space-y-1">
              <label htmlFor="medInitialPills" className="block text-xs font-bold text-slate-800">
                سعة العلبة الكلية (أو الرصيد عند البدء) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                id="medInitialPills"
                min="1"
                step="0.5"
                required
                value={initialPills}
                onChange={(e) => setInitialPills(e.target.value)}
                placeholder="مثلاً 30 حبة"
                className="w-full px-3 py-2.5 rounded-xl border-2 border-emerald-300 bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 text-sm font-black text-emerald-800 outline-none"
              />
              <span className="text-[10px] text-slate-500">
                العدد الأصلي في العلبة وقت بدء الاستخدام
              </span>
            </div>

            <div className="space-y-1">
              <label htmlFor="medDailyDose" className="block text-xs font-bold text-slate-800">
                معدل الاستهلاك اليومي <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                id="medDailyDose"
                min="0.25"
                step="0.25"
                required
                value={dailyDose}
                onChange={(e) => setDailyDose(e.target.value)}
                placeholder="مثلاً: 1 أو 2"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm font-black outline-none bg-white"
              />
              <span className="text-[10px] text-slate-500">
                كم كبسولة / جرعة يتناولها الوالد يومياً
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="medStartDate" className="block text-xs font-bold text-slate-700">
                تاريخ بدء هذه العلبة <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                id="medStartDate"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm font-semibold outline-none"
              />
              <span className="text-[10px] text-slate-400">
                اليوم الذي بدأ فيه الوالد تناول أول حبة من هذه العلبة
              </span>
            </div>

            <div className="space-y-1">
              <label htmlFor="medCourseType" className="block text-xs font-bold text-slate-700">
                طبيعة العلاج
              </label>
              <select
                id="medCourseType"
                value={courseType}
                onChange={(e) => setCourseType(e.target.value as CourseType)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm font-semibold outline-none bg-white"
              >
                <option value="chronic">علاج دائم / مزمن (مستمر دائماً)</option>
                <option value="fixed">كورس محدد المدة (أيام محددة ثم توقف)</option>
              </select>
            </div>
          </div>

          {courseType === 'fixed' && (
            <div className="bg-purple-50 p-3.5 rounded-2xl border border-purple-200 space-y-1">
              <label
                htmlFor="medCourseDays"
                className="block text-xs font-bold text-purple-900"
              >
                مدة الكورس الإجمالية (عدد أيام العلاج المطلوبة)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  id="medCourseDays"
                  min="1"
                  required
                  value={courseDays}
                  onChange={(e) => setCourseDays(e.target.value)}
                  placeholder="مثلاً: 7 أو 14 يوماً"
                  className="w-full px-3 py-2 rounded-xl border border-purple-300 focus:border-purple-500 text-sm font-bold outline-none bg-white"
                />
                <span className="text-xs font-bold text-purple-800 shrink-0">يوماً</span>
              </div>
              <span className="text-[11px] text-purple-700 block">
                سينبهك التطبيق تلقائياً عند انقضاء هذه الأيام لإيقاف العلاج.
              </span>
            </div>
          )}

          <div className="space-y-1 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <span className="block text-xs font-bold text-slate-800">
              بدء الرنين والتنبيه المسبق قبل موعد النفاد بـ:
            </span>
            <div className="grid grid-cols-4 gap-2 pt-1">
              {[
                { val: 1, label: 'قبل يوم' },
                { val: 2, label: 'قبل يومين' },
                { val: 3, label: 'قبل 3 أيام' },
                { val: 5, label: 'قبل 5 أيام' },
              ].map((item) => (
                <label
                  key={item.val}
                  className={`flex items-center justify-center gap-1.5 p-2 rounded-xl border cursor-pointer text-xs font-bold transition ${
                    warningDays === item.val
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-slate-300 text-slate-700 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="warningDays"
                    value={item.val}
                    checked={warningDays === item.val}
                    onChange={() => setWarningDays(item.val)}
                    className="hidden"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="medNotes" className="block text-xs font-bold text-slate-700">
              ملاحظات وتعليمات الطبيب للوالد
            </label>
            <textarea
              id="medNotes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثلاً: قرص بعد الإفطار، وسط كوب ماء، لا يؤخذ مع منتجات الألبان..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm font-medium outline-none resize-none"
            ></textarea>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs sm:text-sm hover:bg-slate-50 transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm shadow-md transition flex items-center gap-2"
            >
              <i className="fa-solid fa-floppy-disk"></i>
              <span>حفظ وتفعيل الحساب التلقائي</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface QuickRefillModalProps {
  medicine: Medicine | null;
  onClose: () => void;
  onConfirm: (medId: string, newPackCount: number, carryOver: boolean) => void;
}

export const QuickRefillModal: React.FC<QuickRefillModalProps> = ({
  medicine,
  onClose,
  onConfirm,
}) => {
  const [packCount, setPackCount] = useState<string>('30');
  const [carryOver, setCarryOver] = useState<boolean>(true);

  useEffect(() => {
    if (medicine) {
      setPackCount(String(medicine.initialPills || 30));
      setCarryOver(true);
    }
  }, [medicine]);

  if (!medicine) return null;
  const metrics = calculateMedicationMetrics(medicine);

  return (
    <div
      id="quickRefillModal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden p-6 space-y-4">
        <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl mx-auto shadow-inner">
          <i className="fa-solid fa-cart-shopping"></i>
        </div>
        <div className="text-center">
          <h3 className="text-lg font-black text-slate-900">تجديد العلبة (شراء جديد)</h3>
          <p className="text-sm font-bold text-emerald-600 mt-1">{medicine.name}</p>
          <p className="text-xs text-slate-500 mt-1">
            سيتم بدء احتساب دورة الدواء من تاريخ اليوم تلقائياً مع رصيد العلبة الجديد.
          </p>
        </div>

        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
          <div>
            <label
              htmlFor="refillPillCountInput"
              className="block text-xs font-bold text-slate-700 mb-1"
            >
              سعة العلبة الجديدة المشتراة:
            </label>
            <input
              type="number"
              id="refillPillCountInput"
              min="1"
              value={packCount}
              onChange={(e) => setPackCount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-black text-slate-800 text-center text-lg focus:border-emerald-500 outline-none bg-white"
            />
          </div>

          {metrics.currentPills > 0 && (
            <div className="flex items-center gap-2 pt-1 border-t border-slate-200 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                id="carryOverRemaining"
                checked={carryOver}
                onChange={(e) => setCarryOver(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="carryOverRemaining" className="cursor-pointer">
                إضافة المتبقي السابق ({metrics.currentPills} حبة) إلى العلبة الجديدة
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold text-xs hover:bg-slate-50 transition"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm(
                medicine.id,
                parseFloat(packCount) || medicine.initialPills || 30,
                carryOver
              )
            }
            className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition flex items-center justify-center gap-1.5"
          >
            <i className="fa-solid fa-check"></i>
            <span>تأكيد وبدء العلبة الآن</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface AdjustBalanceModalProps {
  medicine: Medicine | null;
  onClose: () => void;
  onConfirm: (medId: string, actualCount: number) => void;
}

export const AdjustBalanceModal: React.FC<AdjustBalanceModalProps> = ({
  medicine,
  onClose,
  onConfirm,
}) => {
  const [actualCount, setActualCount] = useState<string>('0');

  useEffect(() => {
    if (medicine) {
      const metrics = calculateMedicationMetrics(medicine);
      setActualCount(String(metrics.currentPills));
    }
  }, [medicine]);

  if (!medicine) return null;

  return (
    <div
      id="adjustModal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden p-6 space-y-4">
        <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center text-2xl mx-auto shadow-inner">
          <i className="fa-solid fa-sliders"></i>
        </div>
        <div className="text-center">
          <h3 className="text-lg font-black text-slate-900">تصحيح الرصيد ومزامنة الواقع</h3>
          <p className="text-sm font-bold text-amber-600 mt-1">{medicine.name}</p>
          <p className="text-xs text-slate-500 mt-1">
            إذا سقطت حبة أو فوّت الوالد جرعة، أدخل العدد الفعلي الموجود في العلبة وسيعاد ضبط الحساب
            التلقائي فوراً.
          </p>
        </div>

        <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-2">
          <label
            htmlFor="adjustRealCountInput"
            className="block text-xs font-bold text-amber-900"
          >
            كم حبة موجودة بالعلبة فعلياً في يدك الآن؟
          </label>
          <input
            type="number"
            id="adjustRealCountInput"
            min="0"
            step="0.5"
            value={actualCount}
            onChange={(e) => setActualCount(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-amber-300 font-black text-slate-900 text-center text-xl focus:border-amber-500 outline-none bg-white"
          />
          <span className="text-[11px] text-amber-700 block text-center">
            سيتم استئناف الحساب التلقائي بناءً على هذا العدد بدءاً من اليوم
          </span>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold text-xs hover:bg-slate-50 transition"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => onConfirm(medicine.id, Math.max(0, parseFloat(actualCount) || 0))}
            className="w-1/2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-md transition flex items-center justify-center gap-1.5"
          >
            <i className="fa-solid fa-arrows-rotate"></i>
            <span>تطبيق المزامنة فوراً</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface DeleteConfirmModalProps {
  medicine: Medicine | null;
  onClose: () => void;
  onConfirm: (medId: string) => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  medicine,
  onClose,
  onConfirm,
}) => {
  if (!medicine) return null;

  return (
    <div
      id="deleteModal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-slate-100 p-6 text-center space-y-4">
        <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center text-2xl mx-auto">
          <i className="fa-solid fa-trash-can"></i>
        </div>
        <div>
          <h3 className="text-base font-extrabold text-slate-900">
            هل أنت متأكد من حذف هذا الدواء؟
          </h3>
          <p className="text-xs font-bold text-rose-600 mt-1">{medicine.name}</p>
          <p className="text-xs text-slate-500 mt-1">
            سيتم مسح بيانات الدواء نهائياً من الحساب والتنبيهات.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition"
          >
            تراجع
          </button>
          <button
            type="button"
            onClick={() => onConfirm(medicine.id)}
            className="w-1/2 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition"
          >
            نعم، حذف نهائي
          </button>
        </div>
      </div>
    </div>
  );
};
