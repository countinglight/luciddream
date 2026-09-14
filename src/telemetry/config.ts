import { Platform } from "react-native";

export type TelemetryConfig = {
  /** Base URL of the telemetry Worker, without a trailing slash. */
  url: string;
  /** Optional shared ingest token. It ships inside the app binary, so it only
   * keeps casual traffic out; it is not a secret. */
  token: string | null;
};

type RawConfig = { url?: string; token?: string };

/**
 * Reads the build-time endpoint. `process.env.EXPO_PUBLIC_*` must be written
 * out literally for Expo to inline it into the bundle, which is why the
 * default argument spells both names in full.
 *
 * Returns null — telemetry unavailable — on web, or when the build carries no
 * HTTPS endpoint (local development, forks, OTA updates published without the
 * variables).
 */
export function readTelemetryConfig(
  raw: RawConfig = {
    url: process.env.EXPO_PUBLIC_TELEMETRY_URL,
    token: process.env.EXPO_PUBLIC_TELEMETRY_TOKEN,
  },
  platform: string = Platform.OS,
): TelemetryConfig | null {
  if (platform === "web") return null;
  const url = raw.url?.trim();
  if (!url || !/^https:\/\/[^\s/]+/.test(url)) return null;
  const token = raw.token?.trim();
  return { url: url.replace(/\/+$/, ""), token: token ? token : null };
}
