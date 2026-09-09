import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform, useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "unspecified" ? "light" : scheme];
  const triggerAppearance = {
    indicatorColor: colors.tint,
  };
  const selectedColor = Platform.OS === "web" ? colors.tintText : colors.tint;

  return (
    <NativeTabs
      backgroundColor={colors.navigation}
      indicatorColor={colors.tint}
      tintColor={selectedColor}
      labelStyle={{ selected: { color: selectedColor } }}
    >
      <NativeTabs.Trigger name="index" {...triggerAppearance}>
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require("@/assets/images/tabIcons/home.png")}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="library" {...triggerAppearance}>
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="books.vertical" md="library_books" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="log" {...triggerAppearance}>
        <NativeTabs.Trigger.Label>Log</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings" {...triggerAppearance}>
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
