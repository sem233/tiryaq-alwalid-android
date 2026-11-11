import React, { useState, useEffect } from 'react';
import {
  getPhoneSystemRingtonesList,
  getSelectedRingtone,
  getSelectedSystemRingtoneInfo,
  hasNativeAndroidBridge,
  markUserInteraction,
  openNativeSystemRingtonePicker,
  playAlarmPulse,
  scheduleClosedAppTestNotification,
  selectPhoneSystemRingtone,
  setSelectedRingtone,
  stopContinuousSoundLoop,
  triggerStrongAndroidNotification,
  type RingtonePattern,
  type SystemRingtoneItem,
} from '../utils/soundEngine';

interface RingtoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'warning' | 'info') => void;
  urgentSummary?: string;
}

export const AndroidGithubModal: React.FC<RingtoneModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
  urgentSummary,
}) => {
  const [ringtone, setRingtone] = useState<RingtonePattern>(getSelectedRingtone());
  const [nativeToneInfo, setNativeToneInfo] = useState<{ uri: string; title: string }>(() =>
    getSelectedSystemRingtoneInfo()
  );
  const [systemRingtones, setSystemRingtones] = useState<SystemRingtoneItem[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRingtone(getSelectedRingtone());
    setNativeToneInfo(getSelectedSystemRingtoneInfo());
    setSystemRingtones(getPhoneSystemRingtonesList());

    window.onNativeRingtonePicked = (info: { uri: string; title: string }) => {
      setNativeToneInfo(info);
      setRingtone('native_phone');
      setSelectedRingtone('native_phone');
      onShowToast(`تم اعتماد نغمة الهاتف: (${info.title}) بنجاح!`, 'success');
    };

    return () => {
      window.onNativeRingtonePicked = undefined;
    };
  }, [isOpen, onShowToast]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  if (!isOpen) return null;

  const handleOpenPhoneSystemPicker = () => {
    markUserInteraction();
    stopContinuousSoundLoop();
    const opened = openNativeSystemRingtonePicker();
    if (opened) {
      setRingtone('native_phone');
      setSelectedRingtone('native_phone');
    } else {
      setRingtone('native_phone');
      setSelectedRingtone('native_phone');
      playAlarmPulse('emergency');
      onShowToast('تم تفعيل نغمة منبه الهاتف الافتراضية', 'success');
    }
  };

  const handleSelectFromPhoneList = (item: SystemRingtoneItem) => {
    markUserInteraction();
    stopContinuousSoundLoop();
    selectPhoneSystemRingtone(item.uri, item.title);
    setNativeToneInfo({ uri: item.uri, title: item.title });
    setRingtone('native_phone');
    onShowToast(`تم اختيار نغمة الهاتف (${item.title}) وتجربتها!`, 'success');
  };

  const handleSelectBuiltInPattern = (pattern: RingtonePattern) => {
    markUserInteraction();
    stopContinuousSoundLoop();
    setRingtone(pattern);
    setSelectedRingtone(pattern);
    playAlarmPulse(pattern);
    onShowToast('تم اختيار النغمة وتجربتها بنجاح', 'success');
  };

  const handleTestClosedAppAlarm = async (seconds: number) => {
    markUserInteraction();
    stopContinuousSoundLoop();
    const scheduled = await scheduleClosedAppTestNotification(seconds, urgentSummary);
    if (scheduled) {
      setCountdown(seconds);
      onShowToast(
        `تم ضبط المنبه بعد ${seconds} ثوانٍ! أغلق التطبيق تماماً الآن أو اقفل الشاشة للتجربة.`,
        'success'
      );
    } else {
      onShowToast('يرجى السماح بصلاحية الإشعارات أولاً لتفعيل منبه الخلفية', 'warning');
    }
  };

  const handleTestImmediateNotification = async () => {
    markUserInteraction();
    stopContinuousSoundLoop();
    await triggerStrongAndroidNotification(
      'ترياق الوالد | تجربة الإشعار الفوري',
      urgentSummary ||
        `هذا اختبار فوري للإشعار القوي باستخدام (${nativeToneInfo.title}).`
    );
    if (!hasNativeAndroidBridge()) {
      playAlarmPulse(ringtone);
    }
    onShowToast('تم إرسال الإشعار الفوري وتشغيل النغمة المختارة!', 'success');
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
              <i className="fa-solid fa-bell"></i>
            </div>
            <div>
              <h2 id="ringtoneModalTitle" className="text-base sm:text-lg font-black">
                نغمات الهاتف المدعومة واختبار الإشعارات
              </h2>
              <p className="text-[11px] text-emerald-100 font-semibold">
                نغمات الهاتف الرسمية • إشعارات تعمل حتى والتطبيق مغلق تماماً لأيام
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

        <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* 1. قسم اختيار نغمة من نغمات الهاتف المدعومة رسمياً */}
          <div className="bg-emerald-50/90 border-2 border-emerald-300 rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-black text-emerald-950 flex items-center gap-1.5">
                  <i className="fa-solid fa-mobile-screen-button text-emerald-600"></i>
                  <span>نغمات ومنبهات الهاتف المدعومة (النظام الرسمي)</span>
                </h3>
                <p className="text-[11px] text-slate-600 font-semibold mt-0.5 leading-relaxed">
                  اختر من نغمات الرنين والمنبهات الأصلية المدمجة في هاتفك لتعمل بأعلى صوت في الإشعارات
                  حتى والتطبيق مغلق تماماً.
                </p>
              </div>
            </div>

            {/* النغمة المختارة حالياً من الهاتف */}
            <div className="bg-white rounded-xl p-3 border border-emerald-200 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-slate-400 block">
                  نغمة الهاتف المعتمدة للإشعارات والمنبه:
                </span>
                <span className="text-xs sm:text-sm font-black text-emerald-800 block truncate">
                  {nativeToneInfo.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  markUserInteraction();
                  setRingtone('native_phone');
                  setSelectedRingtone('native_phone');
                  playAlarmPulse('native_phone');
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-extrabold text-xs shrink-0 flex items-center gap-1"
              >
                <i className="fa-solid fa-volume-high"></i>
                <span>سماع</span>
              </button>
            </div>

            {/* زر فتح نافذة نغمات الهاتف الرسمية في أندرويد */}
            <button
              type="button"
              onClick={handleOpenPhoneSystemPicker}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 active:scale-95"
            >
              <i className="fa-solid fa-list-check"></i>
              <span>فتح نغمات ومنبهات الهاتف الرسمية للاختيار منها</span>
            </button>

            {/* قائمة مباشرة بنغمات الهاتف المدعومة في حال توفرها من النظام */}
            {systemRingtones.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-extrabold text-emerald-900 block">
                  أو اختر مباشرة من نغمات هاتفك المتاحة ({systemRingtones.length} نغمة مدعومة):
                </span>
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1 bg-white/80 p-2 rounded-xl border border-emerald-200">
                  {systemRingtones.map((item) => {
                    const isSelected =
                      ringtone === 'native_phone' &&
                      (nativeToneInfo.uri === item.uri || nativeToneInfo.title === item.title);
                    return (
                      <button
                        key={item.uri}
                        type="button"
                        onClick={() => handleSelectFromPhoneList(item)}
                        className={`w-full px-3 py-2 rounded-lg text-right text-xs font-bold flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'hover:bg-emerald-50 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <i
                            className={`fa-solid ${
                              isSelected ? 'fa-circle-check' : 'fa-bell'
                            } text-xs`}
                          ></i>
                          <span className="truncate">{item.title}</span>
                        </div>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {item.category}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 2. قسم اختبار وصول الإشعار والرنين والتطبيق مغلق تماماً */}
          <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-rose-900 font-black text-xs sm:text-sm">
              <i className="fa-solid fa-clock text-rose-600 text-base"></i>
              <span>اختبار الإشعار القوي والتطبيق ميت / مغلق تماماً</span>
            </div>
            <p className="text-[11px] text-slate-700 font-semibold leading-relaxed">
              اضغط على زر الاختبار بالأسفل ثم <strong>أغلق التطبيق تماماً (امسحه من الخلفية)</strong>{' '}
              أو اقفل شاشة الهاتف، وستسمع رنين الإشعار بنغمة هاتفك المختارة في الموعد المحدد بالضبط!
            </p>

            {countdown !== null && (
              <div className="p-3 rounded-xl bg-rose-600 text-white text-xs font-black text-center animate-pulse">
                ⏱️ اخرج من التطبيق أو اقفله تماماً الآن! سيصل الإشعار ويرن الهاتف بعد ({countdown}){' '}
                ثانية...
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTestClosedAppAlarm(10)}
                className="py-3 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-2 active:scale-95"
              >
                <i className="fa-solid fa-power-off"></i>
                <span>اختبار بعد 10 ثوانٍ (أغلق التطبيق وجرب)</span>
              </button>

              <button
                type="button"
                onClick={handleTestImmediateNotification}
                className="py-3 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-2 active:scale-95"
              >
                <i className="fa-solid fa-bell-concierge"></i>
                <span>اختبار إشعار ورنين فوري الآن</span>
              </button>
            </div>
          </div>

          {/* 3. النغمات الإضافية المدمجة داخل التطبيق */}
          <div className="space-y-1.5">
            <span className="block text-xs font-black text-slate-700">
              نغمات إضافية داخل شاشة التطبيق:
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'native_phone' as RingtonePattern, title: 'نغمة الهاتف الرسمية' },
                { id: 'emergency' as RingtonePattern, title: 'نغمة الطوارئ' },
                { id: 'intensive' as RingtonePattern, title: 'صافرة قصوى' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectBuiltInPattern(item.id)}
                  className={`py-2 px-2 rounded-xl border text-center text-[11px] font-extrabold transition ${
                    ringtone === item.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                stopContinuousSoundLoop();
                onClose();
              }}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs transition"
            >
              حفظ الإعدادات وإغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
