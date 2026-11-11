package com.tiryaq.alwalid.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;

public class TiryaqAlarmReceiver extends BroadcastReceiver {
    public static final String ACTION_ALARM_TRIGGER = "com.tiryaq.alwalid.ALARM_TRIGGER";
    public static final String ACTION_STOP_ALARM = "com.tiryaq.alwalid.STOP_ALARM";
    public static final String PREFS_NAME = "tiryaq_native_prefs";

    private static MediaPlayer activePlayer = null;
    private static Ringtone activeFallbackRingtone = null;
    private static final Handler stopHandler = new Handler(Looper.getMainLooper());
    private static Runnable autoStopRunnable = null;

    public static synchronized void stopRingingSound() {
        try {
            if (autoStopRunnable != null) {
                stopHandler.removeCallbacks(autoStopRunnable);
                autoStopRunnable = null;
            }
            if (activePlayer != null) {
                if (activePlayer.isPlaying()) {
                    activePlayer.stop();
                }
                activePlayer.release();
                activePlayer = null;
            }
            if (activeFallbackRingtone != null) {
                if (activeFallbackRingtone.isPlaying()) {
                    activeFallbackRingtone.stop();
                }
                activeFallbackRingtone = null;
            }
        } catch (Exception ignored) {
        }
    }

    public static synchronized void startRingingSound(Context context, Uri ringtoneUri, int durationSeconds) {
        stopRingingSound();
        try {
            Uri targetUri = ringtoneUri;
            if (targetUri == null) {
                targetUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            }
            if (targetUri == null) {
                targetUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }
            if (targetUri == null) {
                targetUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }

            activePlayer = new MediaPlayer();
            activePlayer.setDataSource(context, targetUri);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                activePlayer.setAudioAttributes(attrs);
            } else {
                activePlayer.setAudioStreamType(AudioManager.STREAM_ALARM);
            }
            activePlayer.setLooping(true);
            activePlayer.prepare();
            activePlayer.start();
        } catch (Exception e) {
            try {
                Uri fallbackUri = ringtoneUri != null
                        ? ringtoneUri
                        : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                activeFallbackRingtone = RingtoneManager.getRingtone(context, fallbackUri);
                if (activeFallbackRingtone != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        activeFallbackRingtone.setLooping(true);
                    }
                    activeFallbackRingtone.play();
                }
            } catch (Exception ignored) {
            }
        }

        autoStopRunnable = new Runnable() {
            @Override
            public void run() {
                stopRingingSound();
            }
        };
        stopHandler.postDelayed(autoStopRunnable, Math.max(4, durationSeconds) * 1000L);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();

        if (ACTION_STOP_ALARM.equals(action)) {
            stopRingingSound();
            int notifId = intent.getIntExtra("notif_id", 7777);
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(notifId);
            }
            return;
        }

        // Wake up CPU and screen so alarm & notification work even in deep sleep / closed app
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "tiryaq:alarm_wakelock"
                );
                wl.acquire(35000L);
            }
        } catch (Exception ignored) {
        }

        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        int alarmId = intent.getIntExtra("alarm_id", 7777);

        if (title == null || title.isEmpty()) {
            title = "ترياق الوالد | تنبيه تجديد الدواء!";
        }
        if (body == null || body.isEmpty()) {
            body = "حان موعد تجديد وشراء دواء الوالد قبل نفاد العلبة.";
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String savedUriStr = prefs.getString("ringtone_uri", null);
        Uri ringtoneUri = null;
        if (savedUriStr != null && !savedUriStr.isEmpty()) {
            try {
                ringtoneUri = Uri.parse(savedUriStr);
            } catch (Exception ignored) {
            }
        }
        if (ringtoneUri == null) {
            ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (ringtoneUri == null) {
                ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }
        }

        // Trigger strong phone vibration
        try {
            Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = new long[]{0, 600, 250, 600, 250, 800, 300, 900};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
                } else {
                    vibrator.vibrate(pattern, -1);
                }
            }
        } catch (Exception ignored) {
        }

        // Start ringing out loud using selected native phone ringtone on ALARM stream
        startRingingSound(context, ringtoneUri, 30);

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        String channelHash = (ringtoneUri != null) ? String.valueOf(Math.abs(ringtoneUri.toString().hashCode())) : "default";
        String channelId = "tiryaq_alarm_ch_v3_" + channelHash;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    channelId,
                    "رنين وتنبيهات أدوية الوالد",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("تنبيهات صوتية قوية لتجديد الأدوية حتى والتطبيق مغلق تماماً");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 600, 250, 600, 250, 800});
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true);
            if (ringtoneUri != null) {
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                channel.setSound(ringtoneUri, audioAttributes);
            }
            nm.createNotificationChannel(channel);
        }

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(
                context,
                alarmId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(context, TiryaqAlarmReceiver.class);
        stopIntent.setAction(ACTION_STOP_ALARM);
        stopIntent.putExtra("notif_id", alarmId);
        PendingIntent stopPi = PendingIntent.getBroadcast(
                context,
                alarmId + 50000,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        int iconRes = context.getApplicationInfo().icon;
        if (iconRes == 0) {
            iconRes = android.R.drawable.ic_lock_idle_alarm;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                .setSmallIcon(iconRes)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setDeleteIntent(stopPi)
                .setContentIntent(openPi)
                .setFullScreenIntent(openPi, true)
                .addAction(android.R.drawable.ic_media_pause, "إيقاف الرنين", stopPi)
                .addAction(android.R.drawable.ic_menu_view, "فتح التطبيق", openPi);

        if (ringtoneUri != null && Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(ringtoneUri, AudioManager.STREAM_ALARM);
        }

        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_INSISTENT;
        nm.notify(alarmId, notification);
    }
}
