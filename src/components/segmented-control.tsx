import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius, withAlpha } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type SegmentOption<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
};

/** Mutually exclusive choice (theme, audio focus, lucid answer…) — replaces
 * rows of loose chips where exactly one option is always in effect. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.track,
        { backgroundColor: withAlpha(theme.text, 0.06) },
        disabled && styles.disabled,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            style={({ pressed }) => [
              styles.segment,
              selected && { backgroundColor: theme.segmentSelected },
              pressed && !disabled && styles.pressed,
            ]}
          >
            <ThemedText
              type={selected ? "smallBold" : "small"}
              themeColor={selected ? "text" : "textSecondary"}
            >
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: 3,
    borderRadius: Radius.control,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radius.control - 3,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
