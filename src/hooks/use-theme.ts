/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from "@/constants/theme";
import { useThemePreference } from "@/context/settings-context";
import { useColorScheme } from "@/hooks/use-color-scheme";

export type ResolvedColorScheme = "light" | "dark";

/** The device scheme, unless Settings → Appearance pins one. */
export function useResolvedColorScheme(): ResolvedColorScheme {
  const system = useColorScheme();
  const preference = useThemePreference();
  if (preference !== "system") return preference;
  return system === "dark" ? "dark" : "light";
}

export function useTheme() {
  return Colors[useResolvedColorScheme()];
}
