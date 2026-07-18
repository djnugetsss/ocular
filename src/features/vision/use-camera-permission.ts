import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { OcularVisionModule, type PermissionResponse } from 'ocular-vision';

interface CameraPermissionState {
  permission: PermissionResponse | null;
  /** True until the initial status query resolves. */
  isLoading: boolean;
  request: () => Promise<PermissionResponse>;
  /** Opens Settings, for when the user has permanently denied access. */
  openSettings: () => Promise<void>;
  /** False on the Simulator, where there is no camera to authorize. */
  isSupported: boolean;
}

/**
 * Tracks camera authorization.
 *
 * Re-queries on foreground because permission can change outside the app: a
 * user sent to Settings to flip the camera toggle returns to a stale `denied`
 * otherwise, and would be told to grant a permission they just granted.
 */
export function useCameraPermission(): CameraPermissionState {
  const [permission, setPermission] = useState<PermissionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await OcularVisionModule.getCameraPermissionsAsync();
    setPermission(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;

    // The React Compiler lint flags setState reached from an effect body. It is
    // correct as a default, but camera authorization is exactly the case the
    // rule carves out: state owned by the OS that React can only discover by
    // asking. There is no render-time source to derive it from, and the write
    // lands in a promise continuation rather than synchronously during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh().catch(() => undefined);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [refresh]);

  const request = useCallback(async () => {
    const next = await OcularVisionModule.requestCameraPermissionsAsync();
    setPermission(next);
    return next;
  }, []);

  const openSettings = useCallback(() => OcularVisionModule.openSettingsAsync(), []);

  return {
    permission,
    isLoading,
    request,
    openSettings,
    isSupported: OcularVisionModule.isSupported,
  };
}
