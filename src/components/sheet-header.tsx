import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { IconButton } from "@/components/icon-button";
import { Icon } from "@/components/icons";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";

type SheetHeaderProps = {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  onClose?: () => void;
};

export function closeSheet() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** Header for the Library / Nights / Settings sheets that slide up over
 * Tonight: grabber, serif title, optional actions, and a close button. */
export function SheetHeader({
  title,
  eyebrow,
  actions,
  onClose = closeSheet,
}: SheetHeaderProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.grabber, { backgroundColor: theme.border }]} />
      <View style={styles.row}>
        <View style={styles.titles}>
          {eyebrow ? (
            <ThemedText type="eyebrow" themeColor="tint">
              {eyebrow}
            </ThemedText>
          ) : null}
          <ThemedText type="display" accessibilityRole="header">
            {title}
          </ThemedText>
        </View>
        <View style={styles.actions}>
          {actions}
          <IconButton label="Close" onPress={onClose}>
            <Icon name="close" color={theme.text} size={18} />
          </IconButton>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  titles: {
    flexShrink: 1,
    gap: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
});
