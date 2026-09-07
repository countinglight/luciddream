import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSessionContext } from '@/context/session-context';
import { formatDuration } from '@/engine';
import { describeEvent } from '@/logging';

/**
 * Live run progress — split out from Home (see src/app/(tabs)/index.tsx) so
 * the setup screen doesn't have to scroll to reach Start, and so "configure"
 * and "watch it run" each get the whole screen instead of sharing one.
 */
export default function RunScreen() {
  const session = useSessionContext();
  const isBusy = session.status === 'starting' || session.status === 'running';
  const isFinished = session.status === 'completed' || session.status === 'stopped' || session.status === 'error';

  // Reaching this screen without an active or just-finished run (e.g. a
  // manual URL/back navigation on web) means there's nothing to show.
  useEffect(() => {
    if (session.status === 'idle') router.replace('/');
  }, [session.status]);

  if (session.status === 'idle') return null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ThemedText type="title" style={styles.title}>
            {isBusy ? 'Running' : isFinished ? 'Run ended' : 'Preparing'}
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="code" themeColor="textSecondary">
              {session.activePhaseLabel ?? 'Preparing phases'}
            </ThemedText>
            <ThemedText type="smallBold">{session.activeScriptName ?? session.scriptName}</ThemedText>
            <ThemedText type="code">Phase {formatDuration(session.phaseElapsedMs)}</ThemedText>
            <ThemedText type="code" themeColor="textSecondary">
              Total {formatDuration(session.elapsedMs)}
            </ThemedText>
            {session.currentStepText && (
              <ThemedText type="small" themeColor="textSecondary">
                {session.currentStepText}
              </ThemedText>
            )}
          </ThemedView>

          {session.recentEvents.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Recent events</ThemedText>
              <ThemedView style={styles.eventsStrip}>
                {session.recentEvents.map((event, eventIndex) => (
                  <ThemedText key={eventIndex} type="small" themeColor="textSecondary">
                    {describeEvent(event)}
                  </ThemedText>
                ))}
              </ThemedView>
            </ThemedView>
          )}

          {session.errorMessage && (
            <ThemedText type="small" themeColor="danger">
              {session.errorMessage}
            </ThemedText>
          )}

          <Button
            label={isBusy ? 'Stop' : 'Back to setup'}
            onPress={isBusy ? session.stop : () => router.replace('/')}
            variant={isBusy ? 'danger' : 'primary'}
            style={styles.actionButton}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    alignItems: 'stretch',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.six,
  },
  title: {
    textAlign: 'center',
  },
  card: {
    gap: Spacing.two,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  eventsStrip: {
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
  actionButton: {
    alignSelf: 'stretch',
    paddingVertical: Spacing.three,
  },
});
