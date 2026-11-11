package com.tiryaq.alwalid.app;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import org.json.JSONArray;
import org.json.JSONObject;

public class TiryaqNativeBridge {
    private final Activity activity;
    private final WebView webView;

    public TiryaqNativeBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public boolean isNativeAndroid() {
        return true;
    }

    @JavascriptInterface
    public void requestPermissionsNative() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (Build.VERSION.SDK_INT >= 33) {
                        if (ContextCompat.checkSelfPermission(activity, "android.permission.POST_NOTIFICATIONS")
                                != PackageManager.PERMISSION_GRANTED) {
                            ActivityCompat.requestPermissions(
                                    activity,
                                    new String[]{"android.permission.POST_NOTIFICATIONS"},
                                    101
                            );
                        }
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        AlarmManager am = (AlarmManager) activity.getSystemService(Context.ALARM_SERVICE);
                        if (am != null && !am.canScheduleExactAlarms()) {
                            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                            intent.setData(Uri.parse("package:" + activity.getPackageName()));
                            activity.startActivity(intent);
                        }
                    }
                } catch (Exception ignored) {
                }
            }
        });
    }

    @JavascriptInterface
    public void openSystemRingtonePicker() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    SharedPreferences prefs = activity.getSharedPreferences(TiryaqAlarmReceiver.PREFS_NAME, Context.MODE_PRIVATE);
                    String currentUriStr = prefs.getString("ringtone_uri", null);
                    Uri currentUri = null;
                    if (currentUriStr != null && !currentUriStr.isEmpty()) {
                        currentUri = Uri.parse(currentUriStr);
                    } else {
                        currentUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                    }

                    Intent intent = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
                    intent.putExtra(
                            RingtoneManager.EXTRA_RINGTONE_TYPE,
                            RingtoneManager.TYPE_ALARM | RingtoneManager.TYPE_RINGTONE | RingtoneManager.TYPE_NOTIFICATION
                    );
                    intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "اختر نغمة الرنين والإشعارات من الهاتف");
                    intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false);
                    intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
                    if (currentUri != null) {
                        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, currentUri);
                    }
                    activity.startActivityForResult(intent, MainActivity.RINGTONE_PICKER_REQUEST);
                } catch (Exception ignored) {
                }
            }
        });
    }

    @JavascriptInterface
    public String getSystemRingtonesList() {
        JSONArray result = new JSONArray();
        try {
            int[] types = new int[]{RingtoneManager.TYPE_ALARM, RingtoneManager.TYPE_RINGTONE};
            java.util.HashSet<String> seenUris = new java.util.HashSet<>();

            for (int type : types) {
                RingtoneManager rm = new RingtoneManager(activity);
                rm.setType(type);
                Cursor cursor = rm.getCursor();
                if (cursor != null) {
                    int count = 0;
                    while (cursor.moveToNext() && count < 25) {
                        String title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX);
                        Uri uri = rm.getRingtoneUri(cursor.getPosition());
                        if (uri != null && !seenUris.contains(uri.toString())) {
                            seenUris.add(uri.toString());
                            JSONObject obj = new JSONObject();
                            obj.put("title", title != null ? title : "نغمة هاتف");
                            obj.put("uri", uri.toString());
                            obj.put("category", type == RingtoneManager.TYPE_ALARM ? "منبه" : "رنين");
                            result.put(obj);
                            count++;
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return result.toString();
    }

    @JavascriptInterface
    public String getSelectedRingtoneInfo() {
        try {
            SharedPreferences prefs = activity.getSharedPreferences(TiryaqAlarmReceiver.PREFS_NAME, Context.MODE_PRIVATE);
            String uriStr = prefs.getString("ringtone_uri", null);
            String title = prefs.getString("ringtone_title", null);
            if (uriStr == null || uriStr.isEmpty()) {
                Uri defUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                if (defUri == null) {
                    defUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                }
                if (defUri != null) {
                    uriStr = defUri.toString();
                    Ringtone r = RingtoneManager.getRingtone(activity, defUri);
                    title = (r != null) ? r.getTitle(activity) : "نغمة المنبه الافتراضية للهاتف";
                }
            }
            JSONObject obj = new JSONObject();
            obj.put("uri", uriStr != null ? uriStr : "");
            obj.put("title", title != null ? title : "نغمة المنبه الافتراضية للهاتف");
            return obj.toString();
        } catch (Exception e) {
            return "{\"uri\":\"\",\"title\":\"نغمة المنبه الافتراضية للهاتف\"}";
        }
    }

    @JavascriptInterface
    public boolean selectSystemRingtone(String uriStr, String title) {
        saveSelectedRingtone(uriStr, title);
        return true;
    }

    public void saveSelectedRingtone(final String uriStr, final String title) {
        try {
            SharedPreferences prefs = activity.getSharedPreferences(TiryaqAlarmReceiver.PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                    .putString("ringtone_uri", uriStr)
                    .putString("ringtone_title", title)
                    .apply();

            Uri uri = Uri.parse(uriStr);
            TiryaqAlarmReceiver.startRingingSound(activity, uri, 4);

            if (webView != null) {
                final JSONObject payload = new JSONObject();
                payload.put("uri", uriStr);
                payload.put("title", title);
                webView.post(new Runnable() {
                    @Override
                    public void run() {
                        webView.evaluateJavascript(
                                "window.onNativeRingtonePicked && window.onNativeRingtonePicked(" + payload.toString() + ");",
                                null
                        );
                    }
                });
            }
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void playNativeAlarmPreview(int durationSeconds) {
        try {
            SharedPreferences prefs = activity.getSharedPreferences(TiryaqAlarmReceiver.PREFS_NAME, Context.MODE_PRIVATE);
            String uriStr = prefs.getString("ringtone_uri", null);
            Uri uri = (uriStr != null && !uriStr.isEmpty()) ? Uri.parse(uriStr) : null;
            TiryaqAlarmReceiver.startRingingSound(activity, uri, durationSeconds);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void stopNativeAlarm() {
        TiryaqAlarmReceiver.stopRingingSound();
    }

    @JavascriptInterface
    public void fireImmediateNotification(String title, String body) {
        try {
            Intent intent = new Intent(activity, TiryaqAlarmReceiver.class);
            intent.setAction(TiryaqAlarmReceiver.ACTION_ALARM_TRIGGER);
            intent.putExtra("alarm_id", 8888);
            intent.putExtra("title", title);
            intent.putExtra("body", body);
            activity.sendBroadcast(intent);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public boolean scheduleTestAlarm(int delaySeconds, String title, String body) {
        try {
            AlarmManager am = (AlarmManager) activity.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return false;

            long triggerAt = System.currentTimeMillis() + (Math.max(2, delaySeconds) * 1000L);
            TiryaqBootReceiver.scheduleSingleExactAlarm(activity, am, 99999, triggerAt, title, body);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public boolean syncMedicationAlarms(String alarmsJson) {
        try {
            AlarmManager am = (AlarmManager) activity.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return false;

            // Cancel previous scheduled alarms (IDs 1000 to 1300)
            for (int id = 1000; id <= 1300; id++) {
                Intent intent = new Intent(activity, TiryaqAlarmReceiver.class);
                intent.setAction(TiryaqAlarmReceiver.ACTION_ALARM_TRIGGER);
                PendingIntent pi = PendingIntent.getBroadcast(
                        activity,
                        id,
                        intent,
                        PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
                );
                if (pi != null) {
                    am.cancel(pi);
                }
            }

            SharedPreferences prefs = activity.getSharedPreferences(TiryaqAlarmReceiver.PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString("scheduled_alarms_json", alarmsJson).apply();

            TiryaqBootReceiver.scheduleFromJson(activity, alarmsJson);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
