import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { DeviceFrame } from '@/components/device-frame';
import { Colors } from '@/constants/theme';
import { LibraryProvider } from '@/context/library-context';
import { SessionProvider } from '@/context/session-context';
import { SettingsProvider } from '@/context/settings-context';
import { useResolvedColorScheme } from '@/hooks/use-theme';
import { configureNotificationHandler } from '@/session/notification';
import { installGlobalErrorHandler } from '@/telemetry';

SplashScreen.preventAutoHideAsync();
configureNotificationHandler();
installGlobalErrorHandler();

/** No tab bar: Tonight is the console, Library / Nights / Settings present as
 * sheets over it, and /run takes the whole screen while a night runs. */
function AppStack() {
  const scheme = useResolvedColorScheme();
  const theme = Colors[scheme];
  const navigationTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider
      value={{
        ...navigationTheme,
        colors: { ...navigationTheme.colors, background: theme.background, card: theme.sheet, primary: theme.tint },
      }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <DeviceFrame>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="run" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="library" options={{ presentation: 'modal' }} />
          <Stack.Screen name="nights" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        </Stack>
      </DeviceFrame>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <SettingsProvider>
      <LibraryProvider>
        <SessionProvider>
          <AppStack />
        </SessionProvider>
      </LibraryProvider>
    </SettingsProvider>
  );
}
