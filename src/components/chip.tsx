import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
};

/** Toggleable pill for multi-select filters (log categories, sleep stage). */
export function Chip({ label, selected, onPress, disabled = false, color }: ChipProps) {
  const theme = useTheme();
  const accent = color ?? theme.tint;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => pressed && !disabled && styles.pressed}>
      <View
        style={[
          styles.chip,
          selected
            ? { backgroundColor: withAlpha(accent, 0.18), borderColor: withAlpha(accent, 0.6) }
            : { borderColor: theme.border },
          disabled && styles.disabled,
        ]}>
        <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
