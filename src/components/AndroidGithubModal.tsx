import React, { useState, useEffect, useRef } from 'react';
import {
  getCustomToneName,
  getSelectedRingtone,
  loadCustomPhoneRingtone,
  markUserInteraction,
  playAlarmPulse,
  saveCustomPhoneRingtone,
  scheduleClosedAppTestNotification,
  setSelectedRingtone,
  stopContinuousSoundLoop,
  type RingtonePattern,
} from '../utils/soundEngine';

interface RingtoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'warning' | 'info') => void;
}

export const AndroidGithubModal: React.FC<RingtoneModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
}) => {
  const [ringtone, setRingtone] = useState<RingtonePattern>(getSelectedRingtone());
  const [customToneName, setCustomToneName] = useState<string | null>(getCustomToneName());
  const [isTestingClosed, setIsTestingClosed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRingtone(getSelectedRingtone());
    loadCustomPhoneRingtone().then(({ name }) => {
      if (name) setCustomToneName(name);
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectRingtone = (pattern: RingtonePattern) => {
    markUserInteraction();
    stopContinuousSoundLoop();
    setRingtone(pattern);
    setSelectedRingtone(pattern);
    playAlarmPulse(pattern);
    onShowToast('تم اعتماد نغمة الرنين وتجربتها بنجاح', 'success');
  };

  const handlePhoneFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    markUserInteraction();
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      if (dataUrl) {
        await saveCustomPhoneRingtone(file.name, dataUrl);
        setCustomToneName(file.name);
        setRingtone('custom_phone');
        playAlarmPulse('custom_phone');
        onShowToast(`تم اختيار نغمة الهاتف (${file.name}) وتفعيلها بأعلى صوت!`, 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTestClosedAppNotification = async () => {
    markUserInteraction();
    setIsTestingClosed(true);
    const scheduled = await scheduleClosedAppTestNotification(5);
    if (scheduled) {
      onShowToast(
        'سيصلك إشعار قوي بعد 5 ثوانٍ! يمكنك إغلاق التطبيق أو قفل الشاشة الآن للتجربة.',
        'success'
      );
    } else {
      onShowToast('يرجى السماح بصلاحية الإشعارات أولاً لتفعيل تنبيهات الخلفية', 'warning');
    }
    setTimeout(() => setIsTestingClosed(false), 5000);
  };

  return (
    <div
      id="ringtoneModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ringtoneModalTitle"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden my-4">
        {/* ترويسة النافذة */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-lg shrink-0">
              <i className="fa-solid fa-volume-high"></i>
            </div>
            <div>
              <h2 id="ringtoneModalTitle" className="text-base sm:text-lg font-black">
                نغمات الهاتف وإشعارات الخلفية
              </h2>
              <p className="text-[11px] text-emerald-100 font-semibold">
                اختيار رنة من هاتفك • إشعارات تعمل حتى والتطبيق مغلق
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopContinuousSoundLoop();
              onClose();
            }}
            aria-label="إغلاق نافذة النغمات"
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition shrink-0"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          {/* قسم اختيار نغمة من ملفات الهاتف */}
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-black text-emerald-950 flex items-center gap-1.5">
                  <i className="fa-solid fa-music text-emerald-600"></i>
                  <span>اختيار نغمة رنين قوية من ملفات الهاتف</span>
                </h3>
                <p className="text-[11px] text-slate-600 font-semibold mt-0.5 leading-relaxed">
                  اختر أي ملف صوتي أو رنة عالية الصوت من هاتفك ليتم تشغيلها تلقائياً مع اهتزاز الهاتف
                  عند حلول موعد تجديد الدواء.
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handlePhoneFileSelect}
              className="hidden"
            />

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition flex items-center justify-center gap-2 active:scale-95"
              >
                <i className="fa-solid fa-folder-open"></i>
                <span>اختيار رنة / ملف صوتي من الهاتف</span>
              </button>

              {customToneName && (
                <button
                  type="button"
                  onClick={() => handleSelectRingtone('custom_phone')}
                  className={`py-2.5 px-3.5 rounded-xl border text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
                    ringtone === 'custom_phone'
                      ? 'bg-emerald-900 text-white border-emerald-900'
                      : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  }`}
                >
                  <i className="fa-solid fa-play text-[10px]"></i>
                  <span className="truncate max-w-[140px]">{customToneName}</span>
                </button>
              )}
            </div>
          </div>

          {/* النغمات القوية المدمجة */}
          <div className="space-y-2">
            <span className="block text-xs font-black text-slate-800">
              أو اختر من نغمات الإنذار القوية المدمجة:
            </span>
            <div className="grid grid-cols-1 gap-2">
              {[
                {
                  id: 'emergency' as RingtonePattern,
                  title: 'نغمة الطوارئ الطبية (الافتراضية)',
                  desc: 'رنين مزدوج واضح ومتوازن مع اهتزاز مستمر',
                },
                {
                  id: 'intensive' as RingtonePattern,
                  title: 'صافرة الإنذار القصوى (عالية جداً)',
                  desc: 'تردد صوتي مضاعف مخصص للانتباه الفوري لكبار السن',
                },
                {
                  id: 'classic' as RingtonePattern,
                  title: 'جرس الهاتف الكلاسيكي المرتفع',
                  desc: 'رنين جرس متقطع عالي النقاء والوضوح',
                },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectRingtone(item.id)}
                  className={`p-3 rounded-2xl border text-right transition flex items-center justify-between gap-3 ${
                    ringtone === item.id
                      ? 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-200'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="text-xs font-black text-slate-900">{item.title}</div>
                    <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                      {item.desc}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {ringtone === item.id ? (
                      <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">
                        <i className="fa-solid fa-check"></i>
                      </span>
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs">
                        <i className="fa-solid fa-volume-high"></i>
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* قسم تأكيد عمل الإشعارات والتطبيق مغلق */}
          <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-amber-900 font-black text-xs sm:text-sm">
              <i className="fa-solid fa-bell-concierge text-amber-600"></i>
              <span>إرسال الإشعارات تلقائياً حتى والتطبيق مغلق</span>
            </div>
            <p className="text-[11px] text-slate-700 font-semibold leading-relaxed">
              يقوم التطبيق بجدولة مواعيد نفاد الأدوية تلقائياً في نظام أندرويد ليرن الإشعار بصوت
              هاتفك في موعده حتى لو كان التطبيق مغلقاً أو الشاشة مقفلة.
            </p>
            <button
              type="button"
              disabled={isTestingClosed}
              onClick={handleTestClosedAppNotification}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-black text-xs shadow-sm transition flex items-center justify-center gap-2 active:scale-95"
            >
              <i className="fa-solid fa-mobile-screen"></i>
              <span>
                {isTestingClosed
                  ? 'أغلق التطبيق أو اقفل الشاشة الآن... سيصل الإشعار خلال ثوانٍ'
                  : 'تجربة إشعار الخلفية الآن (يصل بعد 5 ثوانٍ والتطبيق مغلق)'}
              </span>
            </button>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                stopContinuousSoundLoop();
                onClose();
              }}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs transition"
            >
              حفظ وإغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
