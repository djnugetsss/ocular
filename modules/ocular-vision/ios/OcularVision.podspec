Pod::Spec.new do |s|
  s.name           = 'OcularVision'
  s.version        = '0.1.0'
  s.summary        = 'Vision-framework face landmark, blink, and head pose tracking for Ocular.'
  s.description    = 'Wraps AVFoundation capture and the Vision face landmark request behind an Expo native module.'
  s.author         = ''
  s.homepage       = 'https://github.com/anshmehta/ocular'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'AVFoundation', 'Vision', 'CoreMedia', 'CoreVideo'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
