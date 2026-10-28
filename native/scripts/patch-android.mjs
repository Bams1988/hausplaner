// Passt das von Capacitor erzeugte Android-Projekt an (läuft im GitHub-Build nach `npx cap add android`).
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const nat = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(nat, 'android', 'app');

// Manifest: RevenueCat braucht launchMode singleTop; Push-Symbol und -Kanal
const mf = join(appDir, 'src', 'main', 'AndroidManifest.xml');
let m = readFileSync(mf, 'utf8');
m = m.replace(/android:launchMode="singleTask"/, 'android:launchMode="singleTop"');
if (!m.includes('default_notification_channel_id')) {
  m = m.replace('</application>', `    <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="mindspace" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_mindspace" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/mindspace_green" />
    </application>`);
}
if (!m.includes('android.permission.POST_NOTIFICATIONS')) m = m.replace('<application', '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <application');
writeFileSync(mf, m);

// Push-Symbol (weiß auf transparent) und Farbe
const drawable = join(appDir, 'src', 'main', 'res', 'drawable');
mkdirSync(drawable, { recursive: true });
writeFileSync(join(drawable, 'ic_stat_mindspace.xml'), `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="512" android:viewportHeight="512">
  <path android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="44" android:strokeLineCap="round" android:pathData="M395.1,205.4A148,148 0,1 1,306.6 116.9"/>
  <path android:fillColor="#FFFFFFFF" android:pathData="M256,206a50,50 0,1 1,0 100a50,50 0,1 1,0 -100z"/>
  <path android:fillColor="#FFFFFFFF" android:pathData="M360.7,121.3a30,30 0,1 1,0 60a30,30 0,1 1,0 -60z"/>
</vector>
`);
const values = join(appDir, 'src', 'main', 'res', 'values');
mkdirSync(values, { recursive: true });
writeFileSync(join(values, 'mindspace_colors.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="mindspace_green">#2F9E77</color>\n</resources>\n');

// Version
const gradle = join(appDir, 'build.gradle');
let g = readFileSync(gradle, 'utf8');
if (process.env.APP_BUILD) g = g.replace(/versionCode \d+/, `versionCode ${Number(process.env.APP_BUILD)}`);
if (process.env.APP_VERSION_NAME) g = g.replace(/versionName "[^"]*"/, `versionName "${process.env.APP_VERSION_NAME}"`);
writeFileSync(gradle, g);

// Firebase-Konfiguration
const gs = join(nat, 'google-services.json');
if (existsSync(gs)) copyFileSync(gs, join(appDir, 'google-services.json'));
console.log('✓ Android-Projekt angepasst');
