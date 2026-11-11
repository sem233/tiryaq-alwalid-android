import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { calculateMedicationMetrics, type Medicine } from './medicationLogic';

export type RingtonePattern = 'native_phone' | 'emergency' | 'intensive' | 'classic';

export interface SystemRingtoneItem {
  title: string;
  uri: string;
  category: string;
}

export interface TiryaqNativeInterface {
  isNativeAndroid: () => boolean;
  requestPermissionsNative: () => void;
  openSystemRingtonePicker: () => void;
  getSystemRingtonesList: () => string;
  getSelectedRingtoneInfo: () => string;
  selectSystemRingtone: (uri: string, title: string) => boolean;
  playNativeAlarmPreview: (durationSeconds: number) => void;
  stopNativeAlarm: () => void;
  fireImmediateNotification: (title: string, body: string) => void;
  scheduleTestAlarm: (delaySeconds: number, title: string, body: string) => boolean;
  syncMedicationAlarms: (alarmsJson: string) => boolean;
}

declare global {
  interface Window {
    TiryaqNative?: TiryaqNativeInterface;
    onNativeRingtonePicked?: (info: { uri: string; title: string }) => void;
  }
}

const RINGTONE_PATTERN_KEY = 'tiryaq_ringtone_pattern_v2';
const NATIVE_TONE_TITLE_KEY = 'tiryaq_native_tone_title';
const NATIVE_TONE_URI_KEY = 'tiryaq_native_tone_uri';
const ANDROID_CHANNEL_ID = 'tiryaq_urgent_channel_v4';

let audioCtx: AudioContext | null = null;
let alarmIntervalId: ReturnType<typeof setInterval> | null = null;
let wakeLockSentinel: WakeLockSentinel | null = null;
let currentPattern: RingtonePattern = 'native_phone';
let userHasInteracted = false;

export function hasNativeAndroidBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.TiryaqNative);
}

export function markUserInteraction(): void {
  userHasInteracted = true;
}

export function getSelectedRingtone(): RingtonePattern {
  try {
    const saved = localStorage.getItem(RINGTONE_PATTERN_KEY) as RingtonePattern | null;
    if (
      saved === 'native_phone' ||
      saved === 'emergency' ||
      saved === 'intensive' ||
      saved === 'classic'
    ) {
      currentPattern = saved;
      return currentPattern;
    }
  } catch {
    // ignore storage errors
  }
  return hasNativeAndroidBridge() ? 'native_phone' : 'emergency';
}

export function setSelectedRingtone(pattern: RingtonePattern): void {
  currentPattern = pattern;
  try {
    localStorage.setItem(RINGTONE_PATTERN_KEY, pattern);
  } catch {
    // ignore
  }
}

export function getSelectedSystemRingtoneInfo(): { uri: string; title: string } {
  try {
    if (window.TiryaqNative) {
      const raw = window.TiryaqNative.getSelectedRingtoneInfo();
      const parsed = JSON.parse(raw) as { uri?: string; title?: string };
      const title = parsed.title || 'نغمة المنبه الافتراضية للهاتف';
      const uri = parsed.uri || '';
      localStorage.setItem(NATIVE_TONE_TITLE_KEY, title);
      if (uri) localStorage.setItem(NATIVE_TONE_URI_KEY, uri);
      return { uri, title };
    }
  } catch {
    // fallback to localStorage
  }

  try {
    return {
      uri: localStorage.getItem(NATIVE_TONE_URI_KEY) || '',
      title: localStorage.getItem(NATIVE_TONE_TITLE_KEY) || 'نغمة المنبه الافتراضية للهاتف',
    };
  } catch {
    return { uri: '', title: 'نغمة المنبه الافتراضية للهاتف' };
  }
}

export function getPhoneSystemRingtonesList(): SystemRingtoneItem[] {
  try {
    if (window.TiryaqNative) {
      const raw = window.TiryaqNative.getSystemRingtonesList();
      const parsed = JSON.parse(raw) as SystemRingtoneItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export function openNativeSystemRingtonePicker(): boolean {
  try {
    if (window.TiryaqNative) {
      window.TiryaqNative.openSystemRingtonePicker();
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function selectPhoneSystemRingtone(uri: string, title: string): boolean {
  try {
    localStorage.setItem(NATIVE_TONE_URI_KEY, uri);
    localStorage.setItem(NATIVE_TONE_TITLE_KEY, title);
    setSelectedRingtone('native_phone');
    if (window.TiryaqNative) {
      return window.TiryaqNative.selectSystemRingtone(uri, title);
    }
    return true;
  } catch {
    return false;
  }
}

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !userHasInteracted) return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function triggerAndroidVibration(
  pattern: number[] = [400, 150, 400, 150, 600]
): void {
  if (!userHasInteracted) return;
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore vibration errors on unsupported devices
  }
}

export async function acquireAndroidWakeLock(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && !wakeLockSentinel) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch {
    // WakeLock may fail if page is not visible or unsupported
  }
}

export async function releaseAndroidWakeLock(): Promise<void> {
  try {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch {
    wakeLockSentinel = null;
  }
}

export function playAlarmPulse(pattern: RingtonePattern = getSelectedRingtone()): void {
  try {
    // On Android, if 'native_phone' is selected, use the phone's real system ringtone via TiryaqNative
    if (pattern === 'native_phone' && window.TiryaqNative) {
      window.TiryaqNative.playNativeAlarmPreview(4);
      triggerAndroidVibration([400, 150, 400]);
      return;
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    if (pattern === 'intensive') {
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(987.77, now);
      osc1.frequency.setValueAtTime(783.99, now + 0.14);
      osc1.frequency.setValueAtTime(1046.5, now + 0.28);

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(493.88, now);
      osc2.frequency.setValueAtTime(392.0, now + 0.14);
      osc2.frequency.setValueAtTime(523.25, now + 0.28);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.55, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.46);
      osc2.stop(now + 0.46);
    } else if (pattern === 'classic') {
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(784, now);
      osc1.frequency.setValueAtTime(988, now + 0.12);
      osc1.frequency.setValueAtTime(784, now + 0.24);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1568, now);
      osc2.frequency.setValueAtTime(1976, now + 0.12);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.45, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.42);
      osc2.stop(now + 0.42);
    } else {
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.setValueAtTime(698.46, now + 0.15);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(349.23, now + 0.15);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.45, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.38);
      osc2.stop(now + 0.38);
    }

    triggerAndroidVibration([350, 120, 350]);
  } catch (err) {
    console.error('Audio playback error:', err);
  }
}

export function playSuccessChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.08;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
    triggerAndroidVibration([120, 60, 180]);
  } catch (err) {
    console.error('Chime error:', err);
  }
}

export async function startContinuousSoundLoop(
  pattern: RingtonePattern = getSelectedRingtone()
): Promise<void> {
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
  getAudioContext();
  acquireAndroidWakeLock();

  if (pattern === 'native_phone' && window.TiryaqNative) {
    window.TiryaqNative.playNativeAlarmPreview(30);
    alarmIntervalId = setInterval(() => {
      triggerAndroidVibration([400, 150, 400]);
    }, 2000);
    return;
  }

  playAlarmPulse(pattern);
  alarmIntervalId = setInterval(() => {
    playAlarmPulse(pattern);
  }, 950);
}

export function stopContinuousSoundLoop(): void {
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
  try {
    if (window.TiryaqNative) {
      window.TiryaqNative.stopNativeAlarm();
    }
  } catch {
    // ignore
  }
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(0);
    }
  } catch {
    // ignore
  }
  releaseAndroidWakeLock();
}

/* ========================================================
   إشعارات الأندرويد القوية (تعمل حتى والتطبيق ميت ومغلق لأيام)
   ======================================================== */

export async function ensureAndroidNotificationChannel(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.createChannel({
        id: ANDROID_CHANNEL_ID,
        name: 'تنبيهات تجديد أدوية الوالد العاجلة',
        description: 'إشعارات صوتية قوية واهتزاز لتجديد الأدوية حتى والتطبيق مغلق',
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#059669',
      });
    }
  } catch {
    // ignore on web
  }
}

export async function checkNotificationPermissionState(): Promise<
  'granted' | 'denied' | 'default' | 'unsupported'
> {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') return 'granted';
      if (status.display === 'denied') return 'denied';
      return 'default';
    }
  } catch {
    // fallback
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestAllNotificationPermissions(): Promise<
  'granted' | 'denied' | 'default'
> {
  try {
    if (window.TiryaqNative) {
      window.TiryaqNative.requestPermissionsNative();
    }
    if (Capacitor.isNativePlatform()) {
      await ensureAndroidNotificationChannel();
      const status = await LocalNotifications.requestPermissions();
      if (status.display === 'granted') {
        return 'granted';
      }
      if (status.display === 'denied') {
        return 'denied';
      }
    }
  } catch {
    // fallback
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    const perm = await Notification.requestPermission();
    return perm;
  }

  return 'granted';
}

export async function triggerStrongAndroidNotification(
  title: string,
  body: string
): Promise<boolean> {
  // 1. Native Android BroadcastReceiver (plays chosen phone ringtone + real app icon)
  try {
    if (window.TiryaqNative) {
      window.TiryaqNative.fireImmediateNotification(title, body);
      return true;
    }
  } catch {
    // fallback
  }

  // 2. Capacitor LocalNotifications fallback (without invalid smallIcon)
  try {
    if (Capacitor.isNativePlatform()) {
      await ensureAndroidNotificationChannel();
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display === 'granted') {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Math.floor(Date.now() % 100000) + 1,
              title,
              body,
              channelId: ANDROID_CHANNEL_ID,
              schedule: {
                at: new Date(Date.now() + 500),
                allowWhileIdle: true,
              },
            },
          ],
        });
        return true;
      }
    }
  } catch {
    // fallback
  }

  // 3. Web / PWA Service Worker Notification
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const notifOptions: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'tiryaq-urgent-refill-alert',
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 200, 500, 200, 700],
    dir: 'rtl',
    lang: 'ar',
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, notifOptions);
        return true;
      }
    }
  } catch {
    // fallback
  }

  try {
    new Notification(title, notifOptions);
    return true;
  } catch {
    return false;
  }
}

/**
 * جدولة منبهات حقيقية (AlarmManager.setAlarmClock) تعمل حتى لو التطبيق ميت ومغلق تماماً لأسابيع
 */
export async function scheduleBackgroundMedicationAlarms(
  medicines: Medicine[]
): Promise<void> {
  try {
    const now = new Date();
    const nativeAlarmsPayload: Array<{
      id: number;
      triggerAt: number;
      title: string;
      body: string;
    }> = [];

    let alarmIdCounter = 1000;

    medicines.forEach((med) => {
      const metrics = calculateMedicationMetrics(med, now);
      if (metrics.courseInfo && metrics.courseInfo.isCourseFinished) return;

      const urgentBody = metrics.isDepleted
        ? `تنبيه عاجل جداً: دواء (${med.name}) نفد تماماً! اشترِ العلبة للوالد فوراً.`
        : `تنبيه عاجل: دواء (${med.name}) سينفد خلال ${metrics.daysRemaining} يوم (متبقي ${metrics.currentPills} كبسولة).`;

      if (metrics.isUrgent) {
        // تنبيه قريب بعد 15 دقيقة وبعد ساعتين في حال تم إغلاق التطبيق دون شراء الدواء
        nativeAlarmsPayload.push({
          id: alarmIdCounter++,
          triggerAt: now.getTime() + 15 * 60 * 1000,
          title: 'ترياق الوالد | تذكير عاجل بشراء الدواء!',
          body: urgentBody,
        });
        nativeAlarmsPayload.push({
          id: alarmIdCounter++,
          triggerAt: now.getTime() + 2 * 60 * 60 * 1000,
          title: 'ترياق الوالد | تذكير عاجل بشراء الدواء!',
          body: urgentBody,
        });

        // تنبيهات يومية متكررة لمدة 21 يوماً قادمة (10 صباحاً، 2 ظهراً، 6 مساءً، 9:30 مساءً) حتى لو لم يُفتح التطبيق لأيام
        for (let dayOffset = 0; dayOffset <= 21; dayOffset++) {
          for (const [hour, minute] of [
            [10, 0],
            [14, 0],
            [18, 0],
            [21, 30],
          ]) {
            const targetTime = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate() + dayOffset,
              hour,
              minute,
              0
            );
            if (targetTime.getTime() > now.getTime() + 60000 && alarmIdCounter <= 1295) {
              nativeAlarmsPayload.push({
                id: alarmIdCounter++,
                triggerAt: targetTime.getTime(),
                title: 'ترياق الوالد | موعد تجديد وشراء دواء!',
                body: urgentBody,
              });
            }
          }
        }
      } else {
        // الدواء آمن حالياً: نجدول منبهات تلقائية تبدأ من يوم دخوله فترة التحذير وحتى 14 يوماً بعد موعد نفاده
        const daysUntilWarning = Math.max(1, metrics.daysRemaining - (med.warningDays || 3));
        const maxDayOffset = Math.min(daysUntilWarning + 21, metrics.daysRemaining + 14);

        for (let d = daysUntilWarning; d <= maxDayOffset; d++) {
          for (const [hour, minute] of [
            [10, 0],
            [14, 0],
            [18, 0],
            [21, 30],
          ]) {
            const targetTime = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate() + d,
              hour,
              minute,
              0
            );
            const remainingAtDay = Math.max(0, metrics.daysRemaining - d);
            if (targetTime.getTime() > now.getTime() + 60000 && alarmIdCounter <= 1295) {
              nativeAlarmsPayload.push({
                id: alarmIdCounter++,
                triggerAt: targetTime.getTime(),
                title: 'ترياق الوالد | تنبيه تجديد دواء الوالد!',
                body:
                  remainingAtDay <= 0
                    ? `تنبيه عاجل: دواء (${med.name}) ينفد اليوم! يرجى شراء علبة جديدة للوالد.`
                    : `تذكير مسبق: دواء (${med.name}) سينفد خلال ${remainingAtDay} يوم. يرجى شراء علبة جديدة.`,
              });
            }
          }
        }
      }
    });

    if (window.TiryaqNative) {
      window.TiryaqNative.syncMedicationAlarms(JSON.stringify(nativeAlarmsPayload));
      return;
    }

    if (Capacitor.isNativePlatform()) {
      await ensureAndroidNotificationChannel();
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display === 'granted') {
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length > 0) {
          await LocalNotifications.cancel({
            notifications: pending.notifications.map((n) => ({ id: n.id })),
          });
        }
        if (nativeAlarmsPayload.length > 0) {
          await LocalNotifications.schedule({
            notifications: nativeAlarmsPayload.slice(0, 50).map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              channelId: ANDROID_CHANNEL_ID,
              schedule: {
                at: new Date(item.triggerAt),
                allowWhileIdle: true,
              },
            })),
          });
        }
      }
    }
  } catch (err) {
    console.warn('Background alarm schedule warning:', err);
  }
}

/**
 * جدولة منبه حقيقي عبر نظام أندرويد (AlarmManager.setAlarmClock) لاختبار وصول الإشعار والرنين والتطبيق مغلق تماماً
 */
export async function scheduleClosedAppTestNotification(
  delaySeconds = 8,
  customMedicineSummary?: string
): Promise<boolean> {
  const title = 'ترياق الوالد | اختبار الإشعار والتطبيق مغلق!';
  const body =
    customMedicineSummary ||
    'نجح الاختبار! الإشعار والرنين المختار من نغمات هاتفك يعملان بكفاءة حتى والتطبيق مغلق تماماً.';

  try {
    if (window.TiryaqNative) {
      return window.TiryaqNative.scheduleTestAlarm(delaySeconds, title, body);
    }
  } catch {
    // fallback
  }

  try {
    if (Capacitor.isNativePlatform()) {
      await ensureAndroidNotificationChannel();
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display === 'granted') {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: 99999,
              title,
              body,
              channelId: ANDROID_CHANNEL_ID,
              schedule: {
                at: new Date(Date.now() + delaySeconds * 1000),
                allowWhileIdle: true,
              },
            },
          ],
        });
        return true;
      }
    }
  } catch {
    // fallback
  }

  const perm = await requestAllNotificationPermissions();
  if (perm === 'granted') {
    setTimeout(() => {
      triggerStrongAndroidNotification(title, body);
      playAlarmPulse(getSelectedRingtone());
    }, delaySeconds * 1000);
    return true;
  }

  return false;
}
