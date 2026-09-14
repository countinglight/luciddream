import AsyncStorage from "@react-native-async-storage/async-storage";

import { readTelemetryConfig } from "./config";
import { readAppInfo, readDeviceInfo } from "./device-info";
import { createHttpTransport } from "./outbox";
import { randomId, Telemetry } from "./telemetry";

export { readTelemetryConfig } from "./config";
export {
  Telemetry,
  randomId,
  type TelemetryDeps,
  type TelemetryPreferences,
} from "./telemetry";
export type { RunEndReason, RunPhaseInfo, TelemetryEvent } from "./types";

const config = readTelemetryConfig();

/** The app-wide instance. Inert until the build has an endpoint
 * (EXPO_PUBLIC_TELEMETRY_URL) and the user turns on Settings > Beta
 * diagnostics. */
export const telemetry = new Telemetry({
  store: AsyncStorage,
  transport: config ? createHttpTransport(config) : null,
  readDevice: readDeviceInfo,
  readApp: readAppInfo,
  now: () => Date.now(),
  newId: () => randomId(),
});

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsShape = {
  getGlobalHandler(): GlobalErrorHandler;
  setGlobalHandler(handler: GlobalErrorHandler): void;
};

let handlerInstalled = false;

/** Chains onto React Native's global JS error handler so a fatal error is
 * recorded before the default handler takes the app down. */
export function installGlobalErrorHandler(target: Telemetry = telemetry): void {
  if (handlerInstalled) return;
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsShape })
    .ErrorUtils;
  if (!errorUtils?.getGlobalHandler || !errorUtils.setGlobalHandler) return;
  handlerInstalled = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    target.recordJsError(error, Boolean(isFatal));
    previous?.(error, isFatal);
  });
}
