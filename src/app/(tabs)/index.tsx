import { Slider } from '@expo/ui/community/slider';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScriptPickerModal } from '@/components/script-picker-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useLibrary } from '@/context/library-context';
import { useSessionContext } from '@/context/session-context';
import { useSettings } from '@/context/settings-context';
import { formatDuration } from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import { isLockDemo } from '@/lib/demo-mode';
import { RUN_PHASES, type RunPhaseKey, validateRunPhaseScriptIds } from '@/lib/run-phases';
import type { LibraryScript } from '@/storage/library-types';

/**
 * Setup only — choosing the three phases' scripts and the master volume,
 * then starting a run. Live progress moved to the separate /run screen (see
 * src/app/run.tsx) so this screen fits a narrow phone without scrolling and
 * so "configure" and "watch it run" aren't fighting for the same space.
 */
export default function HomeScreen() {
  const { settings, updateSettings } = useSettings();
  const { scripts } = useLibrary();
  const session = useSessionContext();
  const theme = useTheme();

  const [volume, setVolume] = useState(settings.masterDefaultVolume);
  const [testingPhase, setTestingPhase] = useState<RunPhaseKey | null>(null);
  const [simulatedLocked, setSimulatedLocked] = useState(false);
  const [simulatedNoiseActive, setSimulatedNoiseActive] = useState(false);
  const noiseResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pickerPhase, setPickerPhase] = useState<RunPhaseKey | null>(null);
  const isBusy = session.status === 'starting' || session.status === 'running';
  const lockDemoEnabled =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    isLockDemo(window.location.search, process.env.EXPO_PUBLIC_DEMO);

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

  useEffect(() => {
    if (session.status === 'running') return;
    if (noiseResumeTimerRef.current) clearTimeout(noiseResumeTimerRef.current);
    noiseResumeTimerRef.current = null;
  }, [session.status]);

  useEffect(
    () => () => {
      if (noiseResumeTimerRef.current) clearTimeout(noiseResumeTimerRef.current);
    },
    [],
  );

  const simulateLoudNoise = () => {
    if (session.status !== 'running' || simulatedNoiseActive) return;
    session.handleVoiceInterrupt('trigger');
    setSimulatedNoiseActive(true);
    noiseResumeTimerRef.current = setTimeout(() => {
      session.handleVoiceInterrupt('resume');
      setSimulatedNoiseActive(false);
      noiseResumeTimerRef.current = null;
    }, 15_000);
  };

  const resetDemoState = () => {
    setSimulatedLocked(false);
    setSimulatedNoiseActive(false);
    if (noiseResumeTimerRef.current) clearTimeout(noiseResumeTimerRef.current);
    noiseResumeTimerRef.current = null;
  };

  const stopRun = () => {
    resetDemoState();
    session.stop();
  };

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

  if (lockDemoEnabled && simulatedLocked && session.status === 'running') {
    return (
      <ThemedView style={styles.lockScreen}>
        <ThemedView style={styles.lockContent}>
          <ThemedText type="code" style={styles.lockEyebrow}>SIMULATED LOCK SCREEN</ThemedText>
          <ThemedText type="title" style={styles.lockTitle}>LucidDream is running</ThemedText>
          <ThemedText type="smallBold">{session.activePhaseLabel ?? 'Preparing phases'}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {session.activeScriptName ?? session.scriptName}
          </ThemedText>
          <ThemedText type="code">Total {formatDuration(session.elapsedMs)}</ThemedText>
          {session.currentStepText && (
            <ThemedText type="small" themeColor="textSecondary">
              {session.currentStepText}
            </ThemedText>
          )}
          <ThemedView style={styles.lockActions}>
            <Button label="Stop run" onPress={stopRun} variant="danger" style={styles.demoButton} />
            <Button label="Wake / Unlock" onPress={() => setSimulatedLocked(false)} style={styles.demoButton} />
            <Button
              label={simulatedNoiseActive ? 'Noise detected — resuming soon…' : 'Simulate loud noise'}
              onPress={simulateLoudNoise}
              disabled={simulatedNoiseActive}
              style={styles.demoButton}
            />
          </ThemedView>
          <ThemedText type="small" themeColor="textSecondary" style={styles.demoDisclaimer}>
            Demo simulation only. It does not put this browser or device to sleep.
          </ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }
  const handleStart = () => {
    resetDemoState();
    session.start(selectedPhases, volume);
    router.push('/run');
  };

  const pickerPhaseConfig = pickerPhase ? RUN_PHASES.find((phase) => phase.key === pickerPhase) : null;

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

          {lockDemoEnabled && (
            <ThemedView type="backgroundElement" style={styles.demoCard}>
              <ThemedText type="smallBold">Web lock-screen demo</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                These controls simulate the user experience. They do not test real phone background execution.
              </ThemedText>
              <ThemedView style={styles.demoControls}>
                <Button
                  label="Simulate Lock"
                  onPress={() => setSimulatedLocked(true)}
                  disabled={session.status !== 'running'}
                  style={styles.demoButton}
                />
                <Button
                  label={simulatedNoiseActive ? 'Noise detected — resuming soon…' : 'Simulate loud noise'}
                  onPress={simulateLoudNoise}
                  disabled={session.status !== 'running' || simulatedNoiseActive}
                  style={styles.demoButton}
                />
              </ThemedView>
              <ThemedText type="code" themeColor="textSecondary">
                {settings.voiceInterrupt !== 'gentle'
                  ? 'Live mic: enable Voice interrupt → Gentle in Settings'
                  : session.status === 'running'
                    ? 'Live mic: monitoring for sustained loud noise'
                    : 'Live mic: starts when a run begins'}
              </ThemedText>
            </ThemedView>
          )}

          {isBusy && (
            <ThemedView type="backgroundSelected" style={styles.resumeBanner}>
              <ThemedText type="small">A run is in progress.</ThemedText>
              <Button label="View progress" onPress={() => router.push('/run')} size="small" />
            </ThemedView>
          )}

          {RUN_PHASES.map((phase, index) => {
            const selected = selectedScripts[phase.key];
            const isTesting = testingPhase === phase.key;
            return (
              <ThemedView key={phase.key} type="backgroundElement" style={styles.card}>
                <ThemedView style={styles.phaseTitleGroup}>
                  <ThemedText type="code" themeColor="textSecondary">
                    PHASE {index + 1}
                  </ThemedText>
                  <ThemedText type="smallBold">{phase.label}</ThemedText>
                </ThemedView>
                <Pressable
                  onPress={() => !isBusy && setPickerPhase(phase.key)}
                  disabled={isBusy}
                  style={({ pressed }) => [styles.phaseRow, pressed && !isBusy && styles.pressed]}>
                  <ThemedView type="background" style={styles.phaseRowInner}>
                    <ThemedText numberOfLines={1} style={styles.phaseRowLabel}>
                      {selected ? selected.name : 'Empty'}
                    </ThemedText>
                    <ThemedText themeColor="textSecondary">›</ThemedText>
                  </ThemedView>
                </Pressable>
                <Button
                  label={isTesting ? 'Playing…' : 'Test'}
                  onPress={() => handleTest(phase.key, selected)}
                  loading={isTesting}
                  disabled={!selected || isBusy || testingPhase !== null}
                  size="small"
                />
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
            label={isBusy ? 'Run in progress' : 'Start all phases'}
            onPress={handleStart}
            variant="primary"
            loading={session.status === 'starting'}
            disabled={isBusy || selectionError !== null || testingPhase !== null}
            style={styles.startButton}
          />
        </ScrollView>
      </SafeAreaView>

      <ScriptPickerModal
        visible={pickerPhase !== null}
        title={pickerPhaseConfig?.label ?? ''}
        scripts={scripts}
        selectedId={pickerPhase ? selectedScripts[pickerPhase]?.id ?? null : null}
        onSelect={(scriptId) => pickerPhase && selectScript(pickerPhase, scriptId)}
        onClose={() => setPickerPhase(null)}
      />
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
  resumeBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  card: {
    gap: Spacing.two,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
  phaseTitleGroup: {
    gap: 2,
    backgroundColor: 'transparent',
  },
  phaseRow: {
    alignSelf: 'stretch',
  },
  phaseRowInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.two,
  },
  phaseRowLabel: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  slider: {
    width: '100%',
  },
  startButton: {
    alignSelf: 'stretch',
    paddingVertical: Spacing.three,
  },
  demoCard: {
    gap: Spacing.two,
    alignSelf: 'stretch',
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  demoControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  demoButton: {
    minWidth: 180,
  },
  lockScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: '#080b12',
  },
  lockContent: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    backgroundColor: '#151a24',
  },
  lockEyebrow: {
    color: '#8ca7d8',
    textAlign: 'center',
  },
  lockTitle: {
    textAlign: 'center',
  },
  lockActions: {
    width: '100%',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  demoDisclaimer: {
    textAlign: 'center',
  },
});
