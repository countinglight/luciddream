import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import type { Settings } from "@/lib/settings";
import { recoverOnLaunch } from "@/runtime/services";
import { telemetry } from "@/telemetry";

/**
 * Keeps the telemetry singleton in step with Settings > Beta diagnostics,
 * reports what the previous process left unfinished once settings have
 * loaded, and retries delivery whenever the app comes to the foreground.
 *
 * What "left unfinished" means comes from the session layer's launch
 * recovery, which runs for every user. Diagnostics no longer detect an
 * interrupted night themselves (AR-04).
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
      void recoverOnLaunch().then((result) =>
        telemetry.recoverAfterLaunch(
          result.interrupted.map((run) => ({
            id: run.id,
            startedAt: run.startedAt,
            endedAt: run.endedAt ?? run.startedAt,
            eventCount: run.eventCount,
          })),
        ),
      );
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
