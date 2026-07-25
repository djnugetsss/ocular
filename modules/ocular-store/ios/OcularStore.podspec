Pod::Spec.new do |s|
  s.name           = 'OcularStore'
  s.version        = '0.1.0'
  s.summary        = 'StoreKit 2 subscription entitlements for Ocular.'
  s.description    = 'Wraps StoreKit 2 products, purchases, restore, and verified entitlements behind an Expo native module.'
  s.author         = ''
  s.homepage       = 'https://github.com/anshmehta/ocular'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'StoreKit'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
