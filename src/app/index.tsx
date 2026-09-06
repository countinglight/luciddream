import { Slider } from '@expo/ui/community/slider';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useLibrary } from '@/context/library-context';
import { useSettings } from '@/context/settings-context';
import { formatDuration } from '@/engine';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { useVoiceInterrupt } from '@/hooks/use-voice-interrupt';
import { RUN_PHASES, type RunPhaseKey, validateRunPhaseScriptIds } from '@/lib/run-phases';
import { describeEvent } from '@/logging';
import type { LibraryScript } from '@/storage/library-types';

export default function HomeScreen() {
  const { settings, updateSettings } = useSettings();
  const { scripts, signals } = useLibrary();
  const session = useSession(signals);
  const theme = useTheme();

  const [volume, setVolume] = useState(settings.masterDefaultVolume);
  const [testingPhase, setTestingPhase] = useState<RunPhaseKey | null>(null);
  const isBusy = session.status === 'starting' || session.status === 'running';

  const selectedScripts = Object.fromEntries(
    RUN_PHASES.map((phase) => [
      phase.key,
      scripts.find((script) => script.id === settings.runPhaseScriptIds[phase.key]) ?? null,
    ]),
  ) as Record<RunPhaseKey, LibraryScript | null>;

  const effectiveIds = Object.fromEntries(
    RUN_PHASES.map((phase) => [phase.key, selectedScripts[phase.key]?.id ?? null]),
  ) as typeof settings.runPhaseScriptIds;
  const selectionError = validateRunPhaseScriptIds(effectiveIds);
  const selectedPhases = RUN_PHASES.map((phase, index) => ({
    index,
    label: phase.label,
    script: selectedScripts[phase.key],
  }));

  useVoiceInterrupt(settings.voiceInterrupt === 'gentle' && session.status === 'running', session.handleVoiceInterrupt);

  const selectScript = (phase: RunPhaseKey, scriptId: string | null) => {
    updateSettings({
      runPhaseScriptIds: {
        ...settings.runPhaseScriptIds,
        [phase]: scriptId,
      },
    });
  };

  const handleTest = async (phase: RunPhaseKey, script: LibraryScript | null) => {
    if (!script || testingPhase || isBusy) return;
    setTestingPhase(phase);
    try {
      await session.testPlay(script, volume);
    } finally {
      setTestingPhase(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <ThemedText type="title" style={styles.title}>
            LucidDream
          </ThemedText>

          <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
            Choose the scripts that will run in order. Empty phases are skipped.
          </ThemedText>

          {RUN_PHASES.map((phase, index) => {
            const selected = selectedScripts[phase.key];
            const isTesting = testingPhase === phase.key;
            return (
              <ThemedView key={phase.key} type="backgroundElement" style={styles.card}>
                <ThemedView style={styles.phaseHeader}>
                  <ThemedView style={styles.phaseTitleGroup}>
                    <ThemedText type="code" themeColor="textSecondary">
                      PHASE {index + 1}
                    </ThemedText>
                    <ThemedText type="smallBold">{phase.label}</ThemedText>
                  </ThemedView>
                  <Button
                    label={isTesting ? 'Playing…' : 'Test'}
                    onPress={() => handleTest(phase.key, selected)}
                    loading={isTesting}
                    disabled={!selected || isBusy || testingPhase !== null}
                    size="small"
                  />
                </ThemedView>
                <ThemedView style={styles.chipRow}>
                  <Chip
                    label="Empty"
                    selected={selected === null}
                    onPress={() => selectScript(phase.key, null)}
                    disabled={isBusy}
                  />
                  {scripts.map((script) => (
                    <Chip
                      key={script.id}
                      label={script.name}
                      selected={script.id === selected?.id}
                      onPress={() => selectScript(phase.key, script.id)}
                      disabled={isBusy}
                    />
                  ))}
                </ThemedView>
              </ThemedView>
            );
          })}

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedView style={styles.row}>
              <ThemedText type="smallBold">Master volume</ThemedText>
              <ThemedText type="code">{Math.round(volume * 100)}%</ThemedText>
            </ThemedView>
            <Slider
              value={volume}
              onValueChange={setVolume}
              minimumTrackTintColor={theme.tint}
              disabled={isBusy}
              style={styles.slider}
            />
          </ThemedView>

          {selectionError && (
            <ThemedText type="small" themeColor="danger">
              {selectionError}
            </ThemedText>
          )}

          <Button
            label={isBusy ? 'Stop' : 'Start all phases'}
            onPress={isBusy ? session.stop : () => session.start(selectedPhases, volume)}
            variant={isBusy ? 'danger' : 'primary'}
            loading={session.status === 'starting'}
            disabled={(!isBusy && selectionError !== null) || testingPhase !== null}
            style={styles.startButton}
          />

          {isBusy && (
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
              {session.recentEvents.length > 0 && (
                <ThemedView style={styles.eventsStrip}>
                  {session.recentEvents.map((event, eventIndex) => (
                    <ThemedText key={eventIndex} type="small" themeColor="textSecondary">
                      {describeEvent(event)}
                    </ThemedText>
                  ))}
                </ThemedView>
              )}
            </ThemedView>
          )}

          {session.errorMessage && (
            <ThemedText type="small" themeColor="danger">
              {session.errorMessage}
            </ThemedText>
          )}
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
  scroll: {
    flex: 1,
    alignSelf: 'stretch',
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingTop: Spacing.six,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  intro: {
    textAlign: 'center',
  },
  card: {
    gap: Spacing.two,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  phaseTitleGroup: {
    gap: 2,
    backgroundColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  slider: {
    width: '100%',
  },
  startButton: {
    alignSelf: 'stretch',
    paddingVertical: Spacing.three,
  },
  eventsStrip: {
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
});
