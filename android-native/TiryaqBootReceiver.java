package com.tiryaq.alwalid.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

public class TiryaqBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(TiryaqAlarmReceiver.PREFS_NAME, Context.MODE_PRIVATE);
            String savedAlarmsJson = prefs.getString("scheduled_alarms_json", "[]");
            scheduleFromJson(context, savedAlarmsJson);
        } catch (Exception ignored) {
        }
    }

    public static void scheduleFromJson(Context context, String alarmsJson) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            JSONArray arr = new JSONArray(alarmsJson);
            long now = System.currentTimeMillis();

            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.getJSONObject(i);
                int id = item.optInt("id", 1000 + i);
                long triggerAt = item.optLong("triggerAt", 0L);
                String title = item.optString("title", "ترياق الوالد | تنبيه تجديد الدواء");
                String body = item.optString("body", "موعد شراء وتجديد دواء الوالد");

                if (triggerAt <= now + 1000L) {
                    continue;
                }

                scheduleSingleExactAlarm(context, am, id, triggerAt, title, body);
            }
        } catch (Exception ignored) {
        }
    }

    public static void scheduleSingleExactAlarm(
            Context context,
            AlarmManager am,
            int alarmId,
            long triggerAtMillis,
            String title,
            String body
    ) {
        Intent intent = new Intent(context, TiryaqAlarmReceiver.class);
        intent.setAction(TiryaqAlarmReceiver.ACTION_ALARM_TRIGGER);
        intent.putExtra("alarm_id", alarmId);
        intent.putExtra("title", title);
        intent.putExtra("body", body);

        PendingIntent pi = PendingIntent.getBroadcast(
                context,
                alarmId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        try {
            Intent showIntent = new Intent(context, MainActivity.class);
            PendingIntent showPi = PendingIntent.getActivity(
                    context,
                    alarmId,
                    showIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(triggerAtMillis, showPi);
                am.setAlarmClock(clockInfo, pi);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            }
        } catch (Exception e) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
                } else {
                    am.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
                }
            } catch (Exception e2) {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
                    } else {
                        am.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
                    }
                } catch (Exception ignored) {
                }
            }
        }
    }
}
