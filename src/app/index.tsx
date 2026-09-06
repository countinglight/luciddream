import { Slider } from '@expo/ui/community/slider';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet } from 'react-native';
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
import { isLockDemo } from '@/lib/demo-mode';
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
  const [simulatedLocked, setSimulatedLocked] = useState(false);
  const [simulatedNoiseActive, setSimulatedNoiseActive] = useState(false);
  const noiseResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const voiceMonitor = useVoiceInterrupt(
    settings.voiceInterrupt === 'gentle' && session.status === 'running',
    session.handleVoiceInterrupt,
  );

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
                  : voiceMonitor.permission === 'denied'
                    ? 'Live mic: permission denied'
                    : voiceMonitor.permission === 'error'
                      ? 'Live mic: unavailable in this browser'
                      : voiceMonitor.isRecording
                        ? `Live mic: ${voiceMonitor.meteringDb === null ? 'listening' : `${Math.round(voiceMonitor.meteringDb)} dB`} · threshold -30 dB`
                        : `Live mic: ${voiceMonitor.permission}`}
              </ThemedText>
            </ThemedView>
          )}

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
            onPress={
              isBusy
                ? stopRun
                : () => {
                    resetDemoState();
                    session.start(selectedPhases, volume);
                  }
            }
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
