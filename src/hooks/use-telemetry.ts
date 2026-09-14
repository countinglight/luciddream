import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import type { Settings } from "@/lib/settings";
import { telemetry } from "@/telemetry";

/**
 * Keeps the telemetry singleton in step with Settings > Beta diagnostics,
 * reports what the previous process left unfinished once settings have
 * loaded, and retries delivery whenever the app comes to the foreground.
 */
export function useTelemetryLifecycle(
  diagnostics: Settings["diagnostics"],
  isLoaded: boolean,
): void {
  const recovered = useRef(false);
  const { enabled, testerLabel } = diagnostics;

  useEffect(() => {
    if (!isLoaded) return;
    telemetry.configure({ enabled, testerLabel });
    if (!recovered.current) {
      recovered.current = true;
      void telemetry.recoverAfterLaunch();
    } else if (enabled) {
      void telemetry.flush();
    }
  }, [enabled, testerLabel, isLoaded]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void telemetry.flush();
    });
    return () => subscription.remove();
  }, []);
}
