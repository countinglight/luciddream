import { Platform, StyleSheet, Text, type TextProps } from "react-native";

import { Fonts, ThemeColor } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type ThemedTextProps = TextProps & {
  type?:
    | "default"
    | "defaultSemiBold"
    | "title"
    | "display"
    | "heading"
    | "small"
    | "smallBold"
    | "subtitle"
    | "eyebrow"
    | "mono"
    | "link"
    | "linkPrimary"
    | "code";
  themeColor?: ThemeColor;
};

export function ThemedText({
  style,
  type = "default",
  themeColor,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[{ color: theme[themeColor ?? "text"] }, styles[type], style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 600,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 44,
    fontWeight: 500,
    lineHeight: 50,
  },
  /** Serif screen titles ("Good evening", "Nights"). */
  display: {
    fontFamily: Fonts.serif,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: 500,
  },
  heading: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 500,
  },
  subtitle: {
    fontFamily: Fonts.serif,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 500,
  },
  /** Letter-spaced instrument labels ("02 · EARLY SLEEP"). */
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    fontWeight: 500,
  },
  mono: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: "#3e5581",
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
