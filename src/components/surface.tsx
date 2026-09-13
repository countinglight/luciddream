import { StyleSheet, View, type ViewProps } from "react-native";

import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/** The one card style: raised element colour, hairline border, soft corners. */
export function Surface({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.surface,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: Radius.card,
    borderWidth: 1,
  },
});
