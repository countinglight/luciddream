import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/button";
import { HoldToStopButton } from "@/components/hold-to-stop";
import { Icon } from "@/components/icons";
import { NightDial, type DialPhaseState } from "@/components/night-dial";
import { NightSky } from "@/components/night-sky";
import { OwlAvatar } from "@/components/owl-avatar";
import { PhaseBar } from "@/components/phase-bar";
import { SegmentedControl } from "@/components/segmented-control";
import { Surface } from "@/components/surface";
import { ThemedText } from "@/components/themed-text";
import { Fonts, MaxContentWidth, NightColors, phaseColors } from "@/constants/theme";
import { useSessionContext } from "@/context/session-context";
import { useSettings } from "@/context/settings-context";
import { useRunEvents } from "@/hooks/use-run-events";
import { useTheme } from "@/hooks/use-theme";
import { isLockDemo } from "@/lib/demo-mode";
import { formatAgo, formatClock, formatHuman, formatLongDate, formatTimeOfDay } from "@/lib/format-time";
import { loadLucidNotes, LUCID_OPTIONS, saveLucidNote, type LucidAnswer } from "@/lib/lucid-notes";
import { countPlays, parseRunName, phaseSegments } from "@/lib/nights";
import { RUN_PHASES } from "@/lib/run-phases";
import { describeEvent } from "@/logging";

/** The active arc's marker sweeps once per typical sleep cycle — a slow,
 * honest sense of motion, since scripts don't expose a phase's total length. */
const SLEEP_CYCLE_MS = 90 * 60_000;

/**
 * The run screen has two faces: Sleeping (always the dim night palette, with
 * hold-to-stop) while a night runs, and Good morning once it has ended.
 */
export default function RunScreen() {
  const session = useSessionContext();

  // Reaching this screen without an active or just-finished run (e.g. a
  // manual URL/back navigation on web) means there's nothing to show.
  useEffect(() => {
    if (session.status === "idle") router.replace("/");
  }, [session.status]);

  if (session.status === "idle") return null;
  const finished = session.status === "completed" || session.status === "stopped" || session.status === "error";
  return finished ? <MorningView /> : <SleepingView />;
}

function SleepingView() {
  const session = useSessionContext();
  const { settings } = useSettings();
  const [showActivity, setShowActivity] = useState(false);
  const [simulatedLocked, setSimulatedLocked] = useState(false);
  const [simulatedNoiseActive, setSimulatedNoiseActive] = useState(false);
  const noiseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lockDemoEnabled] = useState(
    () =>
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      isLockDemo(window.location.search, process.env.EXPO_PUBLIC_DEMO),
  );
  const running = session.status === "running";

  useEffect(
    () => () => {
      if (noiseTimerRef.current) clearTimeout(noiseTimerRef.current);
    },
    [],
  );

  const simulateLoudNoise = () => {
    if (!running || simulatedNoiseActive) return;
    session.handleVoiceInterrupt("trigger");
    setSimulatedNoiseActive(true);
    noiseTimerRef.current = setTimeout(() => {
      session.handleVoiceInterrupt("resume");
      setSimulatedNoiseActive(false);
      noiseTimerRef.current = null;
    }, 15_000);
  };

  const stopRun = () => {
    if (noiseTimerRef.current) clearTimeout(noiseTimerRef.current);
    noiseTimerRef.current = null;
    setSimulatedNoiseActive(false);
    setSimulatedLocked(false);
    session.stop();
  };

  const slots = parseRunName(session.scriptName);
  const activeIndex = session.activePhaseIndex;
  const phases = RUN_PHASES.map((_, index) => {
    const hasScript = slots[index] ? slots[index].scriptName !== null : true;
    let state: DialPhaseState = "upcoming";
    if (!hasScript) state = "empty";
    else if (activeIndex !== null && index < activeIndex) state = "done";
    else if (index === activeIndex) state = "active";
    return { color: NightColors.accent, state };
  });
  const clock = formatClock(session.phaseElapsedMs);
  const now = (session.startedAt ?? 0) + session.elapsedMs;
  const lastAt = session.lastEvent?.at;
  const voiceText = simulatedNoiseActive ? "Noise detected — resuming soon…" : "Listening · gentle";

  if (lockDemoEnabled && simulatedLocked && running) {
    return (
      <View style={styles.lockScreen}>
        <StatusBar style="light" />
        <Text style={styles.nightEyebrow}>SIMULATED LOCK SCREEN</Text>
        <Text style={styles.lockTitle}>LucidDream is running</Text>
        <Text style={styles.nightText}>{session.activePhaseLabel ?? "Preparing phases"}</Text>
        <Text style={styles.nightDim}>{session.activeScriptName ?? session.scriptName}</Text>
        <Text style={styles.nightDim}>Total {formatHuman(session.elapsedMs)}</Text>
        {session.currentStepText && <Text style={styles.nightDim}>{session.currentStepText}</Text>}
        <View style={styles.lockActions}>
          <NightButton label="Stop run" onPress={stopRun} />
          <NightButton label="Wake / Unlock" onPress={() => setSimulatedLocked(false)} />
          <NightButton
            label={simulatedNoiseActive ? "Noise detected — resuming soon…" : "Simulate loud noise"}
            onPress={simulateLoudNoise}
            disabled={simulatedNoiseActive}
          />
        </View>
        <Text style={[styles.nightFaint, styles.centered]}>
          Demo simulation only. It does not put this browser or device to sleep.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.nightRoot}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <Pressable accessible={false} style={styles.nightPress} onPress={() => setShowActivity((shown) => !shown)}>
          <Text style={[styles.nightEyebrow, styles.centered]}>
            {activeIndex === null
              ? "PREPARING THE NIGHT"
              : `${(session.activePhaseLabel ?? "").toUpperCase()} · PHASE ${activeIndex + 1} OF 3`}
          </Text>

          <View style={styles.dialWrap}>
            <NightDial size={272} phases={phases} progress={session.phaseElapsedMs / SLEEP_CYCLE_MS % 1} ringColor={NightColors.ring}>
              <Text style={styles.clock} accessibilityLabel={`${formatHuman(session.phaseElapsedMs)} in this phase`}>
                {clock.value}
              </Text>
              <Text style={styles.clockUnit}>{clock.unit.toUpperCase()}</Text>
              <Text style={styles.clockScript} numberOfLines={1}>
                {session.activeScriptName ?? " "}
              </Text>
            </NightDial>
          </View>

          <View style={styles.details}>
            <Text style={styles.nightText}>
              {session.currentStepText
                ? `${session.currentStepText}${lastAt ? ` · ${formatAgo(now - lastAt)}` : ""}`
                : "Starting…"}
            </Text>
            <Text style={styles.nightFaintMono}>
              {`TOTAL ${formatHuman(session.elapsedMs).toUpperCase()}`}
              {session.startedAt ? ` · STARTED ${formatTimeOfDay(session.startedAt).toUpperCase()}` : ""}
            </Text>
          </View>

          {settings.voiceInterrupt === "gentle" && (
            <View style={styles.voiceChip}>
              <Icon name="mic" color={NightColors.textDim} size={15} />
              <Text style={styles.nightDim}>{voiceText}</Text>
            </View>
          )}

          {showActivity && (
            <ScrollView style={styles.activity} contentContainerStyle={styles.activityContent}>
              {session.recentEvents.length === 0 ? (
                <Text style={styles.nightFaint}>No activity yet.</Text>
              ) : (
                [...session.recentEvents].reverse().map((event, index) => (
                  <Text key={index} style={styles.nightDim}>
                    {describeEvent(event)}
                  </Text>
                ))
              )}
            </ScrollView>
          )}

          {session.errorMessage && <Text style={[styles.nightText, styles.centered]}>{session.errorMessage}</Text>}

          {lockDemoEnabled && (
            <View style={styles.demoRow}>
              <NightButton label="Simulate Lock" onPress={() => setSimulatedLocked(true)} disabled={!running} />
              <NightButton
                label={simulatedNoiseActive ? "Noise detected — resuming soon…" : "Simulate loud noise"}
                onPress={simulateLoudNoise}
                disabled={!running || simulatedNoiseActive}
              />
            </View>
          )}

          <View style={styles.spacer} />

          <HoldToStopButton
            onConfirm={stopRun}
            color={NightColors.accentBright}
            trackColor={NightColors.ring}
            surfaceColor={NightColors.surface}
            textColor={NightColors.text}
          />
          <Pressable
            onPress={() => setShowActivity((shown) => !shown)}
            accessibilityRole="button"
            style={styles.activityToggle}
          >
            <Text style={styles.nightFaintMono}>{showActivity ? "HIDE ACTIVITY" : "TAP ANYWHERE TO SEE ACTIVITY"}</Text>
          </Pressable>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function NightButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.nightButton, (pressed || disabled) && styles.dimmed]}
    >
      <Text style={styles.nightText}>{label}</Text>
    </Pressable>
  );
}

function MorningView() {
  const session = useSessionContext();
  const theme = useTheme();
  const colors = phaseColors(theme);
  const { events } = useRunEvents(session.runId, session.status);
  const [lucid, setLucid] = useState<LucidAnswer | null>(null);
  const runId = session.runId;

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    loadLucidNotes().then((notes) => {
      if (!cancelled) setLucid(notes[runId] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const endedAt = session.endedAt ?? (session.startedAt ?? 0) + session.elapsedMs;
  const duration = session.startedAt ? endedAt - session.startedAt : session.elapsedMs;
  const segments = events ? phaseSegments(events) : [];
  const cues = events ? countPlays(events) : session.playCount;
  const endHour = new Date(endedAt).getHours();
  const title =
    session.status === "error" ? "The night hit a snag" : endHour >= 4 && endHour < 12 ? "Good morning" : "Night complete";
  const outcome =
    session.status === "completed"
      ? "all phases completed"
      : session.status === "stopped"
        ? "stopped by you"
        : "ended with an error";

  const chooseLucid = (answer: LucidAnswer) => {
    setLucid(answer);
    if (runId) void saveLucidNote(runId, answer);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <NightSky />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.morningContent} showsVerticalScrollIndicator={false}>
          <View style={styles.morningHero}>
            <OwlAvatar size={84} borderColor={theme.backgroundElement} glowColor={theme.phase3} />
            <ThemedText type="eyebrow" style={{ color: theme.phase3 }}>
              {formatLongDate(endedAt)}
            </ThemedText>
            <ThemedText type="title" style={styles.centered} accessibilityRole="header">
              {title}
            </ThemedText>
          </View>

          <Surface style={styles.summary}>
            <View style={styles.summaryHead}>
              <Text style={[styles.duration, { color: theme.text }]}>{formatHuman(duration)}</Text>
              <ThemedText type="small" themeColor="textSecondary">
                {session.startedAt ? `${formatTimeOfDay(session.startedAt)} → ${formatTimeOfDay(endedAt)} · ` : ""}
                {outcome}
              </ThemedText>
            </View>
            {segments.length > 0 && (
              <View style={styles.segmentBlock}>
                <PhaseBar
                  height={10}
                  segments={segments.map((segment) => ({
                    color: colors[segment.phaseIndex] ?? theme.tint,
                    weight: segment.durationMs,
                  }))}
                />
                <View style={styles.segmentLabels}>
                  {segments.map((segment) => (
                    <ThemedText key={segment.phaseIndex} type="eyebrow" style={{ color: colors[segment.phaseIndex] }}>
                      {`${RUN_PHASES[segment.phaseIndex]?.label ?? "Phase"} · ${formatHuman(segment.durationMs)}`}
                    </ThemedText>
                  ))}
                </View>
              </View>
            )}
            <View style={[styles.stats, { borderTopColor: theme.border }]}>
              <Stat value={String(cues)} label="Cues played" />
              <Stat value={String(segments.length)} label="Phases run" />
            </View>
          </Surface>

          {session.errorMessage && (
            <ThemedText type="small" themeColor="danger" style={styles.centered}>
              {session.errorMessage}
            </ThemedText>
          )}

          {runId && (
            <Surface style={styles.lucidCard}>
              <ThemedText type="heading">Did you have a lucid dream?</ThemedText>
              <SegmentedControl options={LUCID_OPTIONS} value={lucid} onChange={chooseLucid} />
              <ThemedText type="small" themeColor="textMuted">
                Saved with this night in Nights.
              </ThemedText>
            </Surface>
          )}

          <View style={styles.morningActions}>
            {runId && (
              <Button
                label="View the night"
                onPress={() => router.replace({ pathname: "/nights", params: { run: runId } })}
                style={styles.flex}
              />
            )}
            <Button label="Done" variant="primary" onPress={() => router.replace("/")} style={styles.flex} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="mono" style={styles.statValue}>
        {value}
      </ThemedText>
      <ThemedText type="eyebrow" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
  },
  centered: {
    textAlign: "center",
  },
  nightRoot: {
    flex: 1,
    backgroundColor: NightColors.background,
  },
  nightPress: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 14,
  },
  nightEyebrow: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1.8,
    color: NightColors.textDim,
  },
  dialWrap: {
    alignItems: "center",
    marginTop: 8,
  },
  clock: {
    fontFamily: Fonts.mono,
    fontSize: 56,
    lineHeight: 62,
    fontWeight: "300",
    color: NightColors.accent,
  },
  clockUnit: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: NightColors.textFaint,
  },
  clockScript: {
    marginTop: 8,
    maxWidth: 170,
    fontSize: 15,
    color: NightColors.text,
  },
  details: {
    alignItems: "center",
    gap: 6,
  },
  nightText: {
    fontSize: 16,
    color: NightColors.text,
    textAlign: "center",
  },
  nightDim: {
    fontSize: 13,
    color: NightColors.textDim,
  },
  nightFaint: {
    fontSize: 12,
    color: NightColors.textFaint,
  },
  nightFaintMono: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    color: NightColors.textFaint,
    textAlign: "center",
  },
  voiceChip: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: NightColors.border,
  },
  activity: {
    maxHeight: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: NightColors.border,
    backgroundColor: NightColors.surface,
  },
  activityContent: {
    padding: 14,
    gap: 6,
  },
  demoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  nightButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: NightColors.border,
  },
  dimmed: {
    opacity: 0.5,
  },
  spacer: {
    flex: 1,
    minHeight: 8,
  },
  activityToggle: {
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  lockScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
    backgroundColor: "#000000",
  },
  lockTitle: {
    fontFamily: Fonts.serif,
    fontSize: 30,
    color: NightColors.accent,
    textAlign: "center",
  },
  lockActions: {
    width: "100%",
    maxWidth: 360,
    gap: 8,
  },
  morningContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
    gap: 14,
  },
  morningHero: {
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  summary: {
    padding: 18,
    gap: 14,
  },
  summaryHead: {
    gap: 2,
  },
  duration: {
    fontFamily: Fonts.mono,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: "300",
  },
  segmentBlock: {
    gap: 8,
  },
  segmentLabels: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  stats: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statValue: {
    fontSize: 24,
    lineHeight: 30,
  },
  lucidCard: {
    padding: 18,
    gap: 12,
  },
  morningActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
});
