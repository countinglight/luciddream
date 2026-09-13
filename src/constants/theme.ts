/**
 * LucidDream design tokens. The palette is lifted from the owl painting and the
 * website (site/assets/css/site.css): ink / night-slate / periwinkle / chalk,
 * with one colour per phase running dusk → deep night → dawn. Light and dark
 * share every key so screens never branch on the scheme for colour.
 */

import "@/global.css";

import { Platform, type ViewStyle } from "react-native";

export const Colors = {
  light: {
    text: "#262c52",
    textSecondary: "#5f6689",
    textMuted: "#9194ad",
    background: "#f2efe9",
    backgroundElement: "#fbfaf7",
    backgroundSelected: "#e6e0d3",
    segmentSelected: "#ffffff",
    sheet: "#f7f4ee",
    border: "#d9d3c6",
    track: "#e6e0d3",
    navigation: "#f2efe9",
    tint: "#3e5581",
    tintText: "#ffffff",
    danger: "#b3412f",
    phase1: "#6e5bc9",
    phase2: "#4a64b0",
    phase3: "#b57a38",
    lucid: "#5f7a2e",
    warn: "#a8742f",
    glow: "rgba(129,132,200,0.20)",
    star: "transparent",
  },
  dark: {
    text: "#f2efe9",
    textSecondary: "#b9bcd2",
    textMuted: "#7d83a6",
    background: "#11152c",
    backgroundElement: "#1c2244",
    backgroundSelected: "#2a3360",
    segmentSelected: "#2e3766",
    sheet: "#151a36",
    border: "rgba(185,188,210,0.16)",
    track: "rgba(255,255,255,0.10)",
    navigation: "#11152c",
    tint: "#8fa8f0",
    tintText: "#11152c",
    danger: "#ff8a78",
    phase1: "#b4a6ff",
    phase2: "#8fa8f0",
    phase3: "#e3b77e",
    lucid: "#c9d6a8",
    warn: "#e8c79a",
    glow: "rgba(120,130,220,0.26)",
    star: "rgba(242,239,233,0.55)",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type ThemeColors = { readonly [K in ThemeColor]: string };

/** The Sleeping screen ignores the theme: a warm, very low-luminance palette so
 * a 3 AM glance at the phone doesn't light up the room. */
export const NightColors = {
  background: "#050407",
  surface: "#110a08",
  border: "#2a1712",
  ring: "#24140f",
  accent: "#c96a45",
  accentBright: "#e08a5f",
  text: "#a0553b",
  textDim: "#7a4130",
  textFaint: "#5e3224",
} as const;

export function phaseColors(theme: ThemeColors): [string, string, string] {
  return [theme.phase1, theme.phase2, theme.phase3];
}

/** `#rrggbb` → `rgba(...)`; anything else is returned unchanged. */
export function withAlpha(color: string | undefined, alpha: number): string | undefined {
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function backgroundImage(value: string): ViewStyle {
  // react-native-web passes plain CSS through; native (new architecture)
  // renders `experimental_backgroundImage`. Callers always set a solid
  // backgroundColor too, so an unsupported platform just shows that.
  return Platform.OS === "web"
    ? ({ backgroundImage: value } as unknown as ViewStyle)
    : { experimental_backgroundImage: value };
}

export function linearGradient(colors: readonly string[], angle = "90deg"): ViewStyle {
  return backgroundImage(`linear-gradient(${angle}, ${colors.join(", ")})`);
}

export function radialGlow(color: string, at = "50% 28%"): ViewStyle {
  return backgroundImage(`radial-gradient(circle at ${at}, ${color}, transparent 62%)`);
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  control: 12,
  row: 16,
  card: 22,
  sheet: 28,
  pill: 999,
} as const;

export const MaxContentWidth = 560;
