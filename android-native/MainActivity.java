package com.tiryaq.alwalid.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static final int RINGTONE_PICKER_REQUEST = 9001;
    private TiryaqNativeBridge nativeBridge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Request POST_NOTIFICATIONS on Android 13+ immediately on app start
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, "android.permission.POST_NOTIFICATIONS")
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        this,
                        new String[]{"android.permission.POST_NOTIFICATIONS"},
                        101
                );
            }
        }

        // Stop any ringing background alarm sound when user opens the app
        TiryaqAlarmReceiver.stopRingingSound();

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            nativeBridge = new TiryaqNativeBridge(this, webView);
            webView.addJavascriptInterface(nativeBridge, "TiryaqNative");
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        TiryaqAlarmReceiver.stopRingingSound();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        TiryaqAlarmReceiver.stopRingingSound();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == RINGTONE_PICKER_REQUEST && resultCode == Activity.RESULT_OK && data != null) {
            Uri uri = data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
            if (uri != null && nativeBridge != null) {
                Ringtone r = RingtoneManager.getRingtone(this, uri);
                String title = (r != null) ? r.getTitle(this) : "نغمة الهاتف المختارة";
                nativeBridge.saveSelectedRingtone(uri.toString(), title);
            }
        }
    }
}
