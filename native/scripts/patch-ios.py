#!/usr/bin/env python3
"""Passt das von Capacitor erzeugte iOS-Projekt an (läuft im GitHub-Build nach `npx cap add ios`).
Info.plist: Face-ID-Text, Push im Hintergrund, Sprachen, Verschlüsselungs-Angabe.
AppDelegate.swift: Firebase starten, Push-Token an das Plugin weitergeben.
App.entitlements: Push-Berechtigung (aps-environment)."""
import os, plistlib, re, sys
app = os.path.join(os.path.dirname(__file__), '..', 'ios', 'App', 'App')

# --- Info.plist
p = os.path.join(app, 'Info.plist')
with open(p, 'rb') as f: info = plistlib.load(f)
info['CFBundleDisplayName'] = 'MindSpace'
info['NSFaceIDUsageDescription'] = 'MindSpace nutzt Face ID, um deine Planung vor fremden Blicken zu schützen.'
info['ITSAppUsesNonExemptEncryption'] = False
info['CFBundleLocalizations'] = ['de', 'en']
info['CFBundleDevelopmentRegion'] = 'de'
modes = set(info.get('UIBackgroundModes', [])); modes.add('remote-notification'); info['UIBackgroundModes'] = sorted(modes)
info['CFBundleShortVersionString'] = os.environ.get('APP_VERSION_NAME', info.get('CFBundleShortVersionString', '1.0'))
info['CFBundleVersion'] = os.environ.get('APP_BUILD', info.get('CFBundleVersion', '1'))
with open(p, 'wb') as f: plistlib.dump(info, f)

# --- Entitlements (Push)
ent = os.path.join(app, 'App.entitlements')
with open(ent, 'wb') as f: plistlib.dump({'aps-environment': 'production'}, f)

# --- AppDelegate.swift
d = os.path.join(app, 'AppDelegate.swift')
s = open(d, encoding='utf-8').read()
if 'FirebaseCore' not in s:
    s = s.replace('import Capacitor', 'import Capacitor\nimport FirebaseCore', 1)
    s = re.sub(r'(didFinishLaunchingWithOptions[^{]*\{)', r'\1\n        if FirebaseApp.app() == nil { FirebaseApp.configure() }', s, count=1)
    extra = '''
    // MindSpace: Push-Nachrichten (Firebase Cloud Messaging)
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        NotificationCenter.default.post(name: Notification.Name.init("didReceiveRemoteNotification"), object: completionHandler, userInfo: userInfo)
    }
'''
    i = s.rstrip().rfind('}')
    s = s[:i] + extra + '}\n'
    open(d, 'w', encoding='utf-8').write(s)
print('✓ iOS-Projekt angepasst')
