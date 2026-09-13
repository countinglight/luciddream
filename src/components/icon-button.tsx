import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { withAlpha } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type IconButtonProps = {
  /** Spoken label — icon-only controls must always name themselves. */
  label: string;
  onPress?: () => void;
  children: ReactNode;
  /** soft: neutral glass · tinted: filled with `color` · dashed: outline for "add" · plain: no chrome */
  tone?: "soft" | "tinted" | "dashed" | "plain";
  color?: string;
  size?: number;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  label,
  onPress,
  children,
  tone = "soft",
  color,
  size = 44,
  disabled,
  loading,
  style,
}: IconButtonProps) {
  const theme = useTheme();
  const accent = color ?? theme.text;
  const isDisabled = disabled || loading;

  const chrome: ViewStyle =
    tone === "tinted"
      ? {
          backgroundColor: withAlpha(accent, 0.16),
          borderWidth: 1,
          borderColor: withAlpha(accent, 0.45),
        }
      : tone === "dashed"
        ? {
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: withAlpha(accent, 0.55),
          }
        : tone === "soft"
          ? {
              backgroundColor: theme.backgroundElement,
              borderWidth: 1,
              borderColor: theme.border,
            }
          : {};

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={4}
      style={({ pressed }) => [pressed && !isDisabled && styles.pressed, style]}
    >
      <View
        style={[
          styles.button,
          { width: size, height: size, borderRadius: size / 2 },
          chrome,
          disabled && !loading && styles.disabled,
        ]}
      >
        {loading ? <ActivityIndicator size="small" color={accent} /> : children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
