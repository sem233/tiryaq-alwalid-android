import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { calculateMedicationMetrics, type Medicine } from './medicationLogic';

export type RingtonePattern = 'emergency' | 'intensive' | 'classic' | 'custom_phone';

const RINGTONE_PATTERN_KEY = 'tiryaq_ringtone_pattern';
const CUSTOM_TONE_NAME_KEY = 'tiryaq_custom_tone_name';
const CUSTOM_TONE_DATA_KEY = 'tiryaq_custom_tone_data';
const ANDROID_CHANNEL_ID = 'tiryaq_urgent_channel_v3';

let audioCtx: AudioContext | null = null;
let alarmIntervalId: ReturnType<typeof setInterval> | null = null;
let wakeLockSentinel: WakeLockSentinel | null = null;
let currentPattern: RingtonePattern = 'emergency';
let customAudioElement: HTMLAudioElement | null = null;
let cachedCustomDataUrl: string | null = null;
let userHasInteracted = false;

// IndexedDB helper for storing large MP3/WAV phone ringtones without localStorage size limits
function openToneDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open('tiryaq_audio_db', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('ringtones')) {
        db.createObjectStore('ringtones');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCustomPhoneRingtone(
  fileName: string,
  dataUrl: string
): Promise<void> {
  cachedCustomDataUrl = dataUrl;
  try {
    localStorage.setItem(CUSTOM_TONE_NAME_KEY, fileName);
    localStorage.setItem(RINGTONE_PATTERN_KEY, 'custom_phone');
    currentPattern = 'custom_phone';
  } catch {
    // ignore
  }

  try {
    const db = await openToneDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('ringtones', 'readwrite');
      tx.objectStore('ringtones').put(dataUrl, 'custom_tone');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to localStorage for smaller files
    try {
      localStorage.setItem(CUSTOM_TONE_DATA_KEY, dataUrl);
    } catch {
      // ignore quota error
    }
  }
}

export async function loadCustomPhoneRingtone(): Promise<{
  name: string | null;
  dataUrl: string | null;
}> {
  let name: string | null = null;
  try {
    name = localStorage.getItem(CUSTOM_TONE_NAME_KEY);
  } catch {
    // ignore
  }

  if (cachedCustomDataUrl) {
    return { name, dataUrl: cachedCustomDataUrl };
  }

  try {
    const db = await openToneDb();
    const fromDb = await new Promise<string | null>((resolve) => {
      const tx = db.transaction('ringtones', 'readonly');
      const req = tx.objectStore('ringtones').get('custom_tone');
      req.onsuccess = () => resolve((req.result as string) || null);
      req.onerror = () => resolve(null);
    });
    if (fromDb) {
      cachedCustomDataUrl = fromDb;
      return { name, dataUrl: fromDb };
    }
  } catch {
    // ignore
  }

  try {
    const fallback = localStorage.getItem(CUSTOM_TONE_DATA_KEY);
    if (fallback) {
      cachedCustomDataUrl = fallback;
      return { name, dataUrl: fallback };
    }
  } catch {
    // ignore
  }

  return { name, dataUrl: null };
}

export function getCustomToneName(): string | null {
  try {
    return localStorage.getItem(CUSTOM_TONE_NAME_KEY);
  } catch {
    return null;
  }
}

export function markUserInteraction(): void {
  userHasInteracted = true;
}

export function getSelectedRingtone(): RingtonePattern {
  try {
    const saved = localStorage.getItem(RINGTONE_PATTERN_KEY) as RingtonePattern | null;
    if (
      saved === 'emergency' ||
      saved === 'intensive' ||
      saved === 'classic' ||
      saved === 'custom_phone'
    ) {
      currentPattern = saved;
    }
  } catch {
    // ignore storage errors
  }
  return currentPattern;
}

export function setSelectedRingtone(pattern: RingtonePattern): void {
  currentPattern = pattern;
  try {
    localStorage.setItem(RINGTONE_PATTERN_KEY, pattern);
  } catch {
    // ignore
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

export function playAlarmPulse(pattern: RingtonePattern = currentPattern): void {
  try {
    if (pattern === 'custom_phone' && cachedCustomDataUrl && userHasInteracted) {
      if (!customAudioElement || customAudioElement.src !== cachedCustomDataUrl) {
        if (customAudioElement) {
          customAudioElement.pause();
        }
        customAudioElement = new Audio(cachedCustomDataUrl);
        customAudioElement.volume = 1.0;
      }
      if (customAudioElement.paused) {
        customAudioElement.currentTime = 0;
        customAudioElement.play().catch(() => {});
      }
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
      // High-intensity medical double-siren for maximum loudness
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(987.77, now); // B5
      osc1.frequency.setValueAtTime(783.99, now + 0.14); // G5
      osc1.frequency.setValueAtTime(1046.5, now + 0.28); // C6

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
      // Clear high-contrast phone bell ring
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
      // Original faithful emergency pulse (880Hz -> 698.46Hz + 440Hz -> 349.23Hz)
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
  await loadCustomPhoneRingtone();
  getAudioContext();
  acquireAndroidWakeLock();

  if (pattern === 'custom_phone' && cachedCustomDataUrl && userHasInteracted) {
    try {
      if (customAudioElement) {
        customAudioElement.pause();
      }
      customAudioElement = new Audio(cachedCustomDataUrl);
      customAudioElement.loop = true;
      customAudioElement.volume = 1.0;
      customAudioElement.play().catch(() => {});
    } catch {
      // fallback to synthesized pulse
    }
  } else {
    playAlarmPulse(pattern);
  }

  alarmIntervalId = setInterval(() => {
    playAlarmPulse(pattern);
  }, 950);
}

export function stopContinuousSoundLoop(): void {
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
  if (customAudioElement) {
    try {
      customAudioElement.pause();
      customAudioElement.currentTime = 0;
    } catch {
      // ignore
    }
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
   إشعارات الأندرويد القوية (تعمل حتى والتطبيق مغلق تماماً)
   ======================================================== */

export async function ensureAndroidNotificationChannel(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.createChannel({
        id: ANDROID_CHANNEL_ID,
        name: 'تنبيهات تجديد أدوية الوالد العاجلة',
        description: 'إشعارات صوتية قوية واهتزاز لتجديد الأدوية حتى والتطبيق مغلق',
        importance: 5, // MAX importance: heads-up banner + full ringtone sound + vibration
        visibility: 1, // PUBLIC on lockscreen
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
    // fallback to web Notification
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
    // fallback to web Notification API
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    const perm = await Notification.requestPermission();
    return perm;
  }

  return 'default';
}

export async function triggerStrongAndroidNotification(
  title: string,
  body: string
): Promise<boolean> {
  // 1. Native Capacitor Android LocalNotification (works in foreground & background)
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
              smallIcon: 'ic_stat_icon_config_sample',
              iconColor: '#059669',
            },
          ],
        });
        return true;
      }
    }
  } catch {
    // fallback to web/service-worker notification
  }

  // 2. Web / PWA Service Worker Notification
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
 * جدولة إشعارات الأندرويد التلقائية في الخلفية (تعمل حتى لو التطبيق مغلق تماماً أو بعد إعادة تشغيل الهاتف)
 */
export async function scheduleBackgroundMedicationAlarms(
  medicines: Medicine[]
): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;

    await ensureAndroidNotificationChannel();
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

    // مسح الإشعارات المجدولة القديمة لإعادة جدولتها بأحدث الأرقام
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }

    const notificationsToSchedule: Array<{
      id: number;
      title: string;
      body: string;
      channelId: string;
      schedule: { at: Date; allowWhileIdle: boolean };
      smallIcon: string;
      iconColor: string;
    }> = [];

    let notifIdCounter = 1000;
    const now = new Date();

    medicines.forEach((med) => {
      const metrics = calculateMedicationMetrics(med, now);
      if (metrics.courseInfo && metrics.courseInfo.isCourseFinished) return;

      const msgBody = metrics.isDepleted
        ? `تنبيه عاجل: دواء (${med.name}) نفد تماماً! يرجى شراء علبة جديدة للوالد فوراً.`
        : `تنبيه تجديد: دواء (${med.name}) متبقي منه ${metrics.currentPills} كبسولة (تكفي ${metrics.daysRemaining} يوم).`;

      if (metrics.isUrgent) {
        // جدولة تنبيهات متكررة على مدار الـ 3 أيام القادمة (الساعة 10 صباحاً، 3 عصراً، و 8 مساءً) حتى والتطبيق مغلق
        for (let dayOffset = 0; dayOffset <= 3; dayOffset++) {
          for (const hour of [10, 15, 20]) {
            const targetTime = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate() + dayOffset,
              hour,
              0,
              0
            );
            if (targetTime.getTime() > now.getTime() + 60000) {
              notificationsToSchedule.push({
                id: notifIdCounter++,
                title: 'ترياق الوالد | موعد تجديد وشراء دواء!',
                body: msgBody,
                channelId: ANDROID_CHANNEL_ID,
                schedule: {
                  at: targetTime,
                  allowWhileIdle: true,
                },
                smallIcon: 'ic_stat_icon_config_sample',
                iconColor: '#059669',
              });
            }
          }
        }
      } else {
        // الدواء آمن حالياً: نجدول إشعارات تلقائية في اليوم الذي يدخل فيه فترة التحذير وفي يوم النفاد
        const daysUntilWarning = Math.max(1, metrics.daysRemaining - (med.warningDays || 3));
        for (let d = daysUntilWarning; d <= metrics.daysRemaining; d++) {
          for (const hour of [10, 20]) {
            const targetTime = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate() + d,
              hour,
              0,
              0
            );
            const remainingAtThatDay = Math.max(0, metrics.daysRemaining - d);
            if (targetTime.getTime() > now.getTime() + 60000) {
              notificationsToSchedule.push({
                id: notifIdCounter++,
                title: 'ترياق الوالد | تذكير مسبق بتجديد الدواء',
                body:
                  remainingAtThatDay <= 0
                    ? `تنبيه عاجل: دواء (${med.name}) ينفد اليوم! اشترِ علبة جديدة للوالد.`
                    : `تنبيه مسبق: دواء (${med.name}) سينفد خلال ${remainingAtThatDay} يوم. يرجى تجهيز العلبة الجديدة.`,
                channelId: ANDROID_CHANNEL_ID,
                schedule: {
                  at: targetTime,
                  allowWhileIdle: true,
                },
                smallIcon: 'ic_stat_icon_config_sample',
                iconColor: '#059669',
              });
            }
          }
        }
      }
    });

    if (notificationsToSchedule.length > 0) {
      await LocalNotifications.schedule({
        notifications: notificationsToSchedule.slice(0, 60), // الحد الآمن لنظام أندرويد
      });
    }
  } catch (err) {
    console.warn('Background alarm schedule warning:', err);
  }
}

/**
 * جدولة إشعار تجريبي بعد 5 ثوانٍ ليتمكن المستخدم من إغلاق التطبيق والتأكد من وصول الإشعار والهاتف مغلق
 */
export async function scheduleClosedAppTestNotification(
  delaySeconds = 5
): Promise<boolean> {
  const title = 'ترياق الوالد | إشعار والتطبيق مغلق';
  const body =
    'يعمل نظام التنبيه الخلفي بنجاح! سيصلك هذا الإشعار بصوت هاتفك حتى والتطبيق مغلق تماماً.';

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
              smallIcon: 'ic_stat_icon_config_sample',
              iconColor: '#059669',
            },
          ],
        });
        return true;
      }
    }
  } catch {
    // fallback to web timeout
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
