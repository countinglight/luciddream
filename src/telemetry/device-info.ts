import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

import { truncate, type AppInfo, type DeviceInfo } from "./types";

function safe<T>(read: () => T): T | null {
  try {
    const value = read();
    return value === undefined ? null : value;
  } catch {
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== ""
    ? truncate(value)
    : typeof value === "number"
      ? String(value)
      : null;
}

/** Model and OS through expo-device. Nothing here identifies the person or the
 * physical unit: no serial, no advertising id, no device name. */
export function readDeviceInfo(): DeviceInfo {
  return {
    platform: Platform.OS,
    osVersion: text(safe(() => Device.osVersion)),
    model: text(safe(() => Device.modelName)),
    manufacturer: text(safe(() => Device.manufacturer)),
  };
}

/** Marketing version and the computed build number (scripts/build-number.js)
 * as embedded in the binary, plus the OTA update the JS came from, if any. */
export function readAppInfo(): AppInfo {
  const config = safe(() => Constants.expoConfig);
  const build =
    Platform.OS === "ios"
      ? safe(() => config?.ios?.buildNumber)
      : safe(() => config?.android?.versionCode);
  return {
    version: text(safe(() => config?.version)),
    build: text(build),
    updateId: text(safe(() => Updates.updateId)),
    channel: text(safe(() => Updates.channel)),
  };
}
