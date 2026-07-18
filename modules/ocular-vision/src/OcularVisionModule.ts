import { NativeModule, requireNativeModule } from 'expo';

import type { PermissionResponse } from './OcularVision.types';

declare class OcularVisionModuleDefinition extends NativeModule {
  /** True on hardware that can run Vision face tracking. False on Simulator. */
  readonly isSupported: boolean;
  /** Highest Vision face-landmark request revision available on this OS. */
  readonly landmarkRevision: number;

  getCameraPermissionsAsync(): Promise<PermissionResponse>;
  requestCameraPermissionsAsync(): Promise<PermissionResponse>;
  /** Opens this app's page in the system Settings app. */
  openSettingsAsync(): Promise<void>;
}

export default requireNativeModule<OcularVisionModuleDefinition>('OcularVision');
