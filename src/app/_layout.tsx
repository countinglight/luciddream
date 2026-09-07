import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { DeviceFrame } from '@/components/device-frame';
import { LibraryProvider } from '@/context/library-context';
import { SessionProvider } from '@/context/session-context';
import { SettingsProvider } from '@/context/settings-context';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <SettingsProvider>
      <LibraryProvider>
        <SessionProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <DeviceFrame>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="run" />
              </Stack>
            </DeviceFrame>
          </ThemeProvider>
        </SessionProvider>
      </LibraryProvider>
    </SettingsProvider>
  );
}
