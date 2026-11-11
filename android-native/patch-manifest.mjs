import fs from 'fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
if (fs.existsSync(manifestPath)) {
  let content = fs.readFileSync(manifestPath, 'utf8');

  const receiversXml = `
        <receiver
            android:name=".TiryaqAlarmReceiver"
            android:enabled="true"
            android:exported="true" />
        <receiver
            android:name=".TiryaqBootReceiver"
            android:enabled="true"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
    </application>`;

  const permissionsXml = `
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
</manifest>`;

  if (!content.includes('TiryaqAlarmReceiver')) {
    content = content.replace('</application>', receiversXml);
  }
  if (!content.includes('SCHEDULE_EXACT_ALARM')) {
    content = content.replace('</manifest>', permissionsXml);
  }

  fs.writeFileSync(manifestPath, content, 'utf8');
  console.log('Successfully patched AndroidManifest.xml with TiryaqAlarmReceiver & permissions');
}

const stylesPath = 'android/app/src/main/res/values/styles.xml';
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  if (!styles.includes('android:statusBarColor')) {
    styles = styles.replace(
      '<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">',
      `<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="android:fitsSystemWindows">true</item>
        <item name="android:statusBarColor">#059669</item>
        <item name="android:navigationBarColor">#ffffff</item>`
    );
    fs.writeFileSync(stylesPath, styles, 'utf8');
    console.log('Successfully patched styles.xml');
  }
}
