# Xcode-Projekt: Team, App-Kennung, Signierung, Entitlements, Firebase-Datei, Mindestversion.
# Aufruf: ruby scripts/patch-ios.rb <TEAM_ID> <APP_ID>
require 'xcodeproj'
team, app_id = ARGV
path = File.join(__dir__, '..', 'ios', 'App', 'App.xcodeproj')
project = Xcodeproj::Project.open(path)
target = project.targets.find { |t| t.name == 'App' }
target.build_configurations.each do |c|
  s = c.build_settings
  s['DEVELOPMENT_TEAM'] = team
  s['PRODUCT_BUNDLE_IDENTIFIER'] = app_id
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
end
group = project.main_group.find_subpath('App', false) || project.main_group
%w[GoogleService-Info.plist App.entitlements].each do |name|
  next unless File.exist?(File.join(__dir__, '..', 'ios', 'App', 'App', name))
  next if group.files.any? { |f| f.path == name }
  ref = group.new_reference(name)
  target.add_resources([ref]) if name.end_with?('.plist')
end
attrs = project.root_object.attributes['TargetAttributes'] ||= {}
attrs[target.uuid] ||= {}
attrs[target.uuid]['SystemCapabilities'] = { 'com.apple.Push' => { 'enabled' => 1 }, 'com.apple.InAppPurchase' => { 'enabled' => 1 }, 'com.apple.BackgroundModes' => { 'enabled' => 1 } }
project.save
puts '✓ Xcode-Projekt angepasst'
