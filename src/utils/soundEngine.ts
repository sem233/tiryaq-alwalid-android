// محرك الصوت الرنيني القوي والاهتزاز والإشعارات للأندرويد والويب

export type RingtonePattern = 'emergency' | 'intensive' | 'classic';

let audioCtx: AudioContext | null = null;
let alarmIntervalId: ReturnType<typeof setInterval> | null = null;
let wakeLockSentinel: WakeLockSentinel | null = null;
let currentPattern: RingtonePattern = 'emergency';
let userHasInteracted = false;

export function markUserInteraction(): void {
  userHasInteracted = true;
}

export function getSelectedRingtone(): RingtonePattern {
  try {
    const saved = localStorage.getItem('tiryaq_ringtone_pattern') as RingtonePattern | null;
    if (saved === 'emergency' || saved === 'intensive' || saved === 'classic') {
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
    localStorage.setItem('tiryaq_ringtone_pattern', pattern);
  } catch {
    // ignore
  }
}

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !userHasInteracted) return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function triggerAndroidVibration(pattern: number[] = [350, 150, 350, 150, 500]): void {
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
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    if (pattern === 'intensive') {
      // High-intensity medical double-siren for elderly awareness
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(987.77, now); // B5
      osc1.frequency.setValueAtTime(783.99, now + 0.14); // G5
      osc1.frequency.setValueAtTime(1046.5, now + 0.28); // C6

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(493.88, now);
      osc2.frequency.setValueAtTime(392.0, now + 0.14);
      osc2.frequency.setValueAtTime(523.25, now + 0.28);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.42, now + 0.04);
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
      gain.gain.linearRampToValueAtTime(0.35, now + 0.04);
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
      gain.gain.linearRampToValueAtTime(0.38, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.38);
      osc2.stop(now + 0.38);
    }

    triggerAndroidVibration([300, 120, 300]);
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
      gain.gain.setValueAtTime(0.22, start);
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

export function startContinuousSoundLoop(pattern: RingtonePattern = getSelectedRingtone()): void {
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
  getAudioContext();
  acquireAndroidWakeLock();
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
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(0);
    }
  } catch {
    // ignore
  }
  releaseAndroidWakeLock();
}

export async function triggerStrongAndroidNotification(
  title: string,
  body: string
): Promise<boolean> {
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
    // fallback to standard Notification constructor
  }

  try {
    new Notification(title, notifOptions);
    return true;
  } catch {
    return false;
  }
}
