import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'default' | 'small';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** A real tappable button — solid background, rounded corners, a touch
 * target that meets the ~44pt minimum — used everywhere the app used to
 * rely on a bare Pressable around plain text. */
export function Button({ label, onPress, variant = 'secondary', size = 'default', disabled, loading, style }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const backgroundColor = variant === 'primary' ? theme.tint : variant === 'danger' ? 'transparent' : theme.backgroundSelected;
  const textColor = variant === 'primary' ? theme.tintText : variant === 'danger' ? theme.danger : theme.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [pressed && !isDisabled && styles.pressed, style]}>
      <ThemedView
        style={[
          styles.button,
          size === 'small' && styles.buttonSmall,
          { backgroundColor, borderColor: theme.danger, borderWidth: variant === 'danger' ? 1 : 0 },
          isDisabled && styles.disabled,
        ]}>
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <ThemedText type="smallBold" style={{ color: textColor }}>
            {label}
          </ThemedText>
        )}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    minHeight: 36,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
