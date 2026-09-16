import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { IconButton } from "@/components/icon-button";
import { Icon } from "@/components/icons";
import { OwlAvatar } from "@/components/owl-avatar";
import { PhaseBar } from "@/components/phase-bar";
import { SegmentedControl } from "@/components/segmented-control";
import { SheetHeader } from "@/components/sheet-header";
import { Surface } from "@/components/surface";
import { ThemedText } from "@/components/themed-text";
import {
  MaxContentWidth,
  phaseColors,
  Radius,
  withAlpha,
  type ThemeColors,
} from "@/constants/theme";
import { getFileStore } from "@/runtime/services";
import { formatDuration } from "@/engine";
import { useRunEvents } from "@/hooks/use-run-events";
import { useTheme } from "@/hooks/use-theme";
import {
  formatHuman,
  formatNightLabel,
  formatTimeOfDay,
} from "@/lib/format-time";
import {
  clearLucidNotes,
  loadLucidNotes,
  LUCID_OPTIONS,
  saveLucidNote,
  type LucidAnswer,
} from "@/lib/lucid-notes";
import {
  buildWeek,
  nightDate,
  phaseSegments,
  runState,
  scriptChain,
  type NightState,
  type WeekDay,
} from "@/lib/nights";
import { RUN_PHASES } from "@/lib/run-phases";
import type { LogCategory } from "@/lib/settings";
import { eventCategory } from "@/logging/categories";
import { describeEvent } from "@/logging/describe-event";
import { shareRunLog } from "@/logging/export";
import {
  loadRunIndex,
  removeRun,
  saveRunIndex,
  type RunSummary,
} from "@/logging/run-index";

const ALL_CATEGORIES: LogCategory[] = [
  "playback",
  "context",
  "engine",
  "errors",
];

function statusPill(
  state: NightState,
  theme: ThemeColors,
): { label: string; color: string } {
  switch (state) {
    case "completed":
      return { label: "Completed", color: theme.phase2 };
    case "stopped":
      return { label: "Stopped", color: theme.warn };
    case "error":
      return { label: "Error", color: theme.danger };
    case "running":
      return { label: "In progress", color: theme.tint };
    case "interrupted":
      // Not an error and not a choice: the app stopped existing mid-night.
      return { label: "Interrupted", color: theme.warn };
    default:
      return { label: "", color: theme.textMuted };
  }
}

function timeRange(run: RunSummary): string {
  if (!run.endedAt) return `${formatTimeOfDay(run.startedAt)} → in progress`;
  if (run.reason === "interrupted") {
    // The end time is the last moment the app was seen alive, which is not
    // the same as knowing when the night ended. Say so rather than presenting
    // an exact figure we cannot stand behind.
    return `${formatTimeOfDay(run.startedAt)} → last seen ${formatTimeOfDay(run.endedAt)}`;
  }
  return `${formatTimeOfDay(run.startedAt)} → ${formatTimeOfDay(run.endedAt)} · ${formatHuman(run.endedAt - run.startedAt)}`;
}

/** Nights — the old Log tab as a sheet: this week at a glance, one card per
 * night, and a detail sheet with the timeline, share, delete and lucid tag. */
export default function NightsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ run?: string }>();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [lucid, setLucid] = useState<Record<string, LucidAnswer>>({});
  const [viewingId, setViewingId] = useState<string | null>(() =>
    typeof params.run === "string" ? params.run : null,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [now] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([loadRunIndex(), loadLucidNotes()]).then(
        ([loadedRuns, notes]) => {
          if (cancelled) return;
          setRuns([...loadedRuns].sort((a, b) => b.startedAt - a.startedAt));
          setLucid(notes);
        },
      );
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const week = useMemo(
    () => buildWeek(runs ?? [], lucid, now),
    [runs, lucid, now],
  );
  const viewingRun = runs?.find((run) => run.id === viewingId) ?? null;

  const deleteRun = async (id: string) => {
    const loaded = await loadRunIndex();
    await saveRunIndex(removeRun(loaded, id));
    setLucid(await saveLucidNote(id, null));
    setRuns((previous) => previous?.filter((run) => run.id !== id) ?? null);
    setViewingId(null);
  };

  const deleteAll = async () => {
    await saveRunIndex([]);
    await clearLucidNotes();
    setRuns([]);
    setLucid({});
    setMenuOpen(false);
    setConfirmDeleteAll(false);
  };

  const answer = async (id: string, value: LucidAnswer) => {
    setLucid(await saveLucidNote(id, value));
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.sheet }]}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <SheetHeader
            title="Nights"
            actions={
              runs && runs.length > 0 ? (
                <IconButton
                  label="More actions"
                  onPress={() => {
                    setMenuOpen((open) => !open);
                    setConfirmDeleteAll(false);
                  }}
                >
                  <Icon name="more" color={theme.text} size={18} />
                </IconButton>
              ) : undefined
            }
          />

          {menuOpen && (
            <Surface style={styles.menu}>
              <Pressable
                onPress={
                  confirmDeleteAll ? deleteAll : () => setConfirmDeleteAll(true)
                }
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && styles.pressed,
                ]}
              >
                <Icon name="trash" color={theme.danger} size={18} />
                <ThemedText themeColor="danger">
                  {confirmDeleteAll
                    ? "Tap again to delete every night"
                    : "Delete all nights"}
                </ThemedText>
              </Pressable>
            </Surface>
          )}

          <WeekStrip week={week} />

          {runs === null ? (
            <ThemedText themeColor="textSecondary">Loading…</ThemedText>
          ) : runs.length === 0 ? (
            <Surface style={styles.empty}>
              <OwlAvatar size={72} />
              <ThemedText type="heading">No nights yet</ThemedText>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.centered}
              >
                Begin a night from Tonight — it will be waiting here in the
                morning.
              </ThemedText>
            </Surface>
          ) : (
            runs.map((run) => (
              <NightCard
                key={run.id}
                run={run}
                answer={lucid[run.id]}
                onPress={() => setViewingId(run.id)}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>

      {viewingRun && (
        <NightDetail
          run={viewingRun}
          answer={lucid[viewingRun.id] ?? null}
          onAnswer={(value) => answer(viewingRun.id, value)}
          onDelete={() => deleteRun(viewingRun.id)}
          onClose={() => setViewingId(null)}
        />
      )}
    </View>
  );
}

function WeekStrip({ week }: { week: WeekDay[] }) {
  const theme = useTheme();
  const nights = week.filter((day) => day.state !== "none").length;
  const lucidNights = week.filter((day) => day.lucid).length;

  const fill = (day: WeekDay) => {
    switch (day.state) {
      case "completed":
        return { backgroundColor: withAlpha(theme.phase2, 0.45) };
      case "stopped":
        return { backgroundColor: withAlpha(theme.phase3, 0.38) };
      case "error":
        return { backgroundColor: withAlpha(theme.danger, 0.35) };
      case "running":
        return { backgroundColor: theme.phase2 };
      default:
        return day.isTonight
          ? { borderWidth: 1.5, borderColor: theme.textSecondary }
          : {
              borderWidth: 1,
              borderStyle: "dashed" as const,
              borderColor: theme.border,
            };
    }
  };

  return (
    <Surface style={styles.week}>
      <View style={styles.weekHeader}>
        <ThemedText type="eyebrow" themeColor="textSecondary">
          This week
        </ThemedText>
        <ThemedText type="small">{`${nights} ${nights === 1 ? "night" : "nights"} · ${lucidNights} lucid`}</ThemedText>
      </View>
      <View style={styles.weekRow}>
        {week.map((day) => (
          <View
            key={day.key}
            style={styles.weekDay}
            accessible
            accessibilityLabel={`${day.weekday}: ${day.state === "none" ? "no run" : day.state}${day.lucid ? ", lucid" : ""}`}
          >
            <ThemedText
              type="eyebrow"
              themeColor={day.isTonight ? "text" : "textMuted"}
            >
              {day.weekday}
            </ThemedText>
            <View
              style={[
                styles.weekDot,
                fill(day),
                day.lucid && { borderWidth: 2, borderColor: theme.lucid },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <Legend
          color={withAlpha(theme.phase2, 0.6) ?? theme.phase2}
          label="Completed"
        />
        <Legend
          color={withAlpha(theme.phase3, 0.55) ?? theme.phase3}
          label="Stopped"
        />
        <Legend color={theme.lucid} label="Lucid" ring />
      </View>
    </Surface>
  );
}

function Legend({
  color,
  label,
  ring,
}: {
  color: string;
  label: string;
  ring?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendDot,
          ring
            ? { borderWidth: 2, borderColor: color }
            : { backgroundColor: color },
        ]}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: withAlpha(color, 0.16) }]}>
      <ThemedText type="eyebrow" style={[styles.pillText, { color }]}>
        {label}
      </ThemedText>
    </View>
  );
}

function NightCard({
  run,
  answer,
  onPress,
}: {
  run: RunSummary;
  answer?: LucidAnswer;
  onPress: () => void;
}) {
  const theme = useTheme();
  const pill = statusPill(runState(run), theme);
  const label = formatNightLabel(nightDate(run.startedAt));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Night of ${label}, ${pill.label}${answer === "yes" ? ", lucid" : ""}`}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Surface style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText type="heading">{label}</ThemedText>
          <View style={styles.pills}>
            {answer === "yes" && <Pill label="Lucid" color={theme.lucid} />}
            <Pill label={pill.label} color={pill.color} />
          </View>
        </View>
        <ThemedText type="mono" themeColor="textSecondary">
          {timeRange(run)}
        </ThemedText>
        <View style={styles.cardFooter}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            numberOfLines={1}
            style={styles.shrink}
          >
            {scriptChain(run.scriptName)}
          </ThemedText>
          <Icon name="chevron-right" color={theme.textMuted} size={16} />
        </View>
      </Surface>
    </Pressable>
  );
}

type NightDetailProps = {
  run: RunSummary;
  answer: LucidAnswer | null;
  onAnswer: (value: LucidAnswer) => void;
  onDelete: () => void;
  onClose: () => void;
};

function NightDetail({
  run,
  answer,
  onAnswer,
  onDelete,
  onClose,
}: NightDetailProps) {
  const theme = useTheme();
  const colors = phaseColors(theme);
  const { events, error } = useRunEvents(run.id);
  const [activeCategories, setActiveCategories] = useState<Set<LogCategory>>(
    new Set(ALL_CATEGORIES),
  );
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const share = async () => {
    setSharing(true);
    setShareError(null);
    try {
      await shareRunLog(run.id, getFileStore());
    } catch (err) {
      setShareError(err instanceof Error ? err.message : String(err));
    } finally {
      setSharing(false);
    }
  };

  const toggleCategory = (category: LogCategory) => {
    setActiveCategories((previous) => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const segments = events ? phaseSegments(events) : [];
  const visibleEvents =
    events?.filter((event) => activeCategories.has(eventCategory(event))) ?? [];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close night"
        />
        <View
          style={[
            styles.detailSheet,
            { backgroundColor: theme.sheet, borderColor: theme.border },
          ]}
        >
          <SafeAreaView edges={["bottom"]} style={styles.detailSafeArea}>
            <SheetHeader
              eyebrow={statusPill(runState(run), theme).label}
              title={formatNightLabel(nightDate(run.startedAt))}
              onClose={onClose}
            />
            <ScrollView
              contentContainerStyle={styles.detailContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.detailSummary}>
                <ThemedText type="mono" themeColor="textSecondary">
                  {`${timeRange(run)} · ${run.eventCount} events`}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {scriptChain(run.scriptName)}
                </ThemedText>
              </View>

              {segments.length > 0 && (
                <View style={styles.segmentBlock}>
                  <PhaseBar
                    segments={segments.map((segment) => ({
                      color: colors[segment.phaseIndex] ?? theme.tint,
                      weight: segment.durationMs,
                    }))}
                  />
                  <View style={styles.segmentLabels}>
                    {segments.map((segment) => (
                      <ThemedText
                        key={segment.phaseIndex}
                        type="eyebrow"
                        style={{ color: colors[segment.phaseIndex] }}
                      >
                        {`${RUN_PHASES[segment.phaseIndex]?.label ?? "Phase"} · ${formatHuman(segment.durationMs)}`}
                      </ThemedText>
                    ))}
                  </View>
                </View>
              )}

              <Surface style={styles.lucidCard}>
                <ThemedText type="defaultSemiBold">Lucid dream?</ThemedText>
                <SegmentedControl
                  options={LUCID_OPTIONS}
                  value={answer}
                  onChange={onAnswer}
                />
              </Surface>

              <View style={styles.detailActions}>
                <Button
                  label="Share log"
                  icon={<Icon name="share" color={theme.text} size={16} />}
                  onPress={share}
                  loading={sharing}
                  style={styles.flex}
                />
                <Button
                  label={confirmDelete ? "Tap to confirm" : "Delete"}
                  variant="danger"
                  onPress={
                    confirmDelete ? onDelete : () => setConfirmDelete(true)
                  }
                  style={styles.flex}
                />
              </View>
              {shareError && (
                <ThemedText type="small" themeColor="danger">
                  {shareError}
                </ThemedText>
              )}

              <ThemedText type="eyebrow" themeColor="textSecondary">
                Timeline
              </ThemedText>
              <View style={styles.chipRow}>
                {ALL_CATEGORIES.map((category) => (
                  <Chip
                    key={category}
                    label={category}
                    selected={activeCategories.has(category)}
                    onPress={() => toggleCategory(category)}
                  />
                ))}
              </View>
              {error ? (
                <ThemedText themeColor="danger">{error}</ThemedText>
              ) : events === null ? (
                <ThemedText themeColor="textSecondary">Loading…</ThemedText>
              ) : visibleEvents.length === 0 ? (
                <ThemedText themeColor="textSecondary">
                  No events in the selected categories.
                </ThemedText>
              ) : (
                visibleEvents.map((event, index) => (
                  <View key={index} style={styles.eventRow}>
                    <ThemedText
                      type="code"
                      themeColor="textMuted"
                      style={styles.eventOffset}
                    >
                      +{formatDuration(Math.max(0, event.at - run.startedAt))}
                    </ThemedText>
                    <ThemedText type="small" style={styles.shrink}>
                      {describeEvent(event)}
                    </ThemedText>
                  </View>
                ))
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  centered: {
    textAlign: "center",
  },
  pressed: {
    opacity: 0.75,
  },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
    gap: 12,
  },
  menu: {
    paddingHorizontal: 16,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
  },
  week: {
    padding: 16,
    gap: 14,
  },
  weekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekDay: {
    alignItems: "center",
    gap: 6,
    minWidth: 36,
  },
  weekDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  empty: {
    alignItems: "center",
    gap: 10,
    padding: 24,
  },
  card: {
    padding: 16,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  pills: {
    flexDirection: "row",
    gap: 6,
  },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 10,
    lineHeight: 14,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(5,6,15,0.55)",
  },
  detailSheet: {
    maxHeight: "92%",
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
  },
  detailSafeArea: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
    flexShrink: 1,
  },
  detailContent: {
    gap: 14,
    paddingBottom: 24,
  },
  detailSummary: {
    gap: 4,
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
  lucidCard: {
    padding: 16,
    gap: 10,
  },
  detailActions: {
    flexDirection: "row",
    gap: 12,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  eventRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "baseline",
  },
  eventOffset: {
    minWidth: 72,
  },
});
