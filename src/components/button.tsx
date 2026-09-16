import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import {
  linearGradient,
  phaseColors,
  Radius,
  withAlpha,
} from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type ButtonVariant = "primary" | "secondary" | "danger" | "hero";
export type ButtonSize = "default" | "small";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Pill button. `hero` is the one big dusk→dawn gradient action per screen
 * (Begin the night); the rest are quieter so it stays the obvious next step. */
export function Button({
  label,
  onPress,
  variant = "secondary",
  size = "default",
  disabled,
  loading,
  icon,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const surface: ViewStyle =
    variant === "hero"
      ? { backgroundColor: theme.phase2, ...linearGradient(phaseColors(theme)) }
      : variant === "primary"
        ? { backgroundColor: theme.tint }
        : variant === "danger"
          ? {
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: withAlpha(theme.danger, 0.7) ?? theme.danger,
            }
          : {
              backgroundColor: withAlpha(theme.text, 0.07),
              borderWidth: 1,
              borderColor: theme.border,
            };
  const textColor =
    variant === "hero"
      ? "#ffffff"
      : variant === "primary"
        ? theme.tintText
        : variant === "danger"
          ? theme.danger
          : theme.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [pressed && !isDisabled && styles.pressed, style]}
    >
      <View
        style={[
          styles.button,
          size === "small" && styles.buttonSmall,
          variant === "hero" && styles.buttonHero,
          surface,
          isDisabled && styles.disabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <>
            {icon}
            <ThemedText
              type={size === "small" ? "smallBold" : "defaultSemiBold"}
              style={[
                { color: textColor },
                variant === "hero" && styles.heroLabel,
              ]}
            >
              {label}
            </ThemedText>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: Radius.pill,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSmall: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    minHeight: 40,
    gap: 6,
  },
  buttonHero: {
    minHeight: 58,
    boxShadow: "0 10px 28px rgba(80,100,190,0.35)",
  },
  heroLabel: {
    fontSize: 17,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.45,
  },
});
