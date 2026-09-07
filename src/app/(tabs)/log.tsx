import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getLibraryFileStore } from '@/context/library-context';
import { formatDuration, type EngineEvent } from '@/engine';
import { eventCategory } from '@/logging/categories';
import { describeEvent } from '@/logging/describe-event';
import { shareRunLog } from '@/logging/export';
import { logPathFor } from '@/logging/jsonl-log-port';
import { loadRunIndex, removeRun, saveRunIndex, type RunSummary } from '@/logging/run-index';
import type { LogCategory } from '@/lib/settings';

const ALL_CATEGORIES: LogCategory[] = ['playback', 'context', 'engine', 'errors'];

function formatStartedAt(ms: number): string {
  return new Date(ms).toLocaleString();
}

function parseLog(text: string): EngineEvent[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as EngineEvent];
      } catch {
        return [];
      }
    });
}

function RunDetail({ run, onClose }: { run: RunSummary; onClose: () => void }) {
  const [events, setEvents] = useState<EngineEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<LogCategory>>(new Set(ALL_CATEGORIES));

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getLibraryFileStore()
        .readText('document', logPathFor(run.id))
        .then((text) => {
          if (!cancelled) setEvents(parseLog(text));
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        });
      return () => {
        cancelled = true;
      };
    }, [run.id]),
  );

  const toggleCategory = (category: LogCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const visibleEvents = events?.filter((event) => activeCategories.has(eventCategory(event))) ?? [];

  return (
    <ThemedView style={styles.overlay}>
      <SafeAreaView style={styles.overlaySafeArea}>
        <ThemedView type="backgroundElement" style={styles.overlayCard}>
          <ThemedView style={styles.overlayHeader}>
            <ThemedText type="subtitle" style={styles.overlayTitle} numberOfLines={1}>
              {run.scriptName}
            </ThemedText>
            <Button label="Close" onPress={onClose} size="small" />
          </ThemedView>

          <ThemedView style={styles.chipRow}>
            {ALL_CATEGORIES.map((category) => (
              <Chip
                key={category}
                label={category}
                selected={activeCategories.has(category)}
                onPress={() => toggleCategory(category)}
              />
            ))}
          </ThemedView>

          <ScrollView style={styles.overlayScroll} contentContainerStyle={styles.overlayScrollContent}>
            {error ? (
              <ThemedText themeColor="danger">{error}</ThemedText>
            ) : events === null ? (
              <ThemedText themeColor="textSecondary">Loading…</ThemedText>
            ) : visibleEvents.length === 0 ? (
              <ThemedText themeColor="textSecondary">No events in the selected categories.</ThemedText>
            ) : (
              visibleEvents.map((event, index) => (
                <ThemedText key={index} type="code" style={styles.eventLine}>
                  +{formatDuration(Math.max(0, event.at - run.startedAt))} — {describeEvent(event)}
                </ThemedText>
              ))
            )}
          </ScrollView>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

function RunRow({ run, onView, onDeleted }: { run: RunSummary; onView: (run: RunSummary) => void; onDeleted: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      await shareRunLog(run.id, getLibraryFileStore());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const runs = await loadRunIndex();
      await saveRunIndex(removeRun(runs, run.id));
      onDeleted(run.id);
    } finally {
      setBusy(false);
    }
  };

  const duration = run.endedAt ? formatDuration(run.endedAt - run.startedAt) : 'in progress';

  return (
    <ThemedView style={styles.row}>
      <ThemedView style={styles.rowMain}>
        <ThemedText type="smallBold">{run.scriptName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatStartedAt(run.startedAt)} · {duration} · {run.eventCount} events
          {run.reason ? ` · ${run.reason}` : ''}
        </ThemedText>
        {error && (
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        )}
      </ThemedView>
      <ThemedView style={styles.rowActions}>
        <Button label="View" onPress={() => onView(run)} size="small" />
        <Button label="Share" onPress={share} disabled={busy} loading={busy} size="small" />
        <Button label="Delete" onPress={remove} disabled={busy} variant="danger" size="small" />
      </ThemedView>
    </ThemedView>
  );
}

export default function LogScreen() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [viewingRun, setViewingRun] = useState<RunSummary | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const reload = useCallback(() => {
    loadRunIndex().then((loaded) => {
      setRuns([...loaded].sort((a, b) => b.startedAt - a.startedAt));
    });
  }, []);

  useFocusEffect(reload);

  const removeOne = (id: string) => {
    setRuns((prev) => prev?.filter((run) => run.id !== id) ?? null);
  };

  const deleteAll = async () => {
    setDeletingAll(true);
    try {
      await saveRunIndex([]);
      setRuns([]);
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ThemedText type="title" style={styles.title}>
            Log
          </ThemedText>

          {runs === null ? (
            <ThemedText themeColor="textSecondary">Loading…</ThemedText>
          ) : runs.length === 0 ? (
            <ThemedText themeColor="textSecondary">No runs yet — start a script from the Home tab.</ThemedText>
          ) : (
            <ThemedView type="backgroundElement" style={styles.card}>
              {runs.map((run) => (
                <RunRow key={run.id} run={run} onView={setViewingRun} onDeleted={removeOne} />
              ))}
              <Button label="Delete all" onPress={deleteAll} disabled={deletingAll} variant="danger" style={styles.deleteAllButton} />
            </ThemedView>
          )}
        </ScrollView>
      </SafeAreaView>

      {viewingRun && <RunDetail run={viewingRun} onClose={() => setViewingRun(null)} />}
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
  card: {
    gap: Spacing.two,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  rowMain: {
    gap: 2,
    flexShrink: 1,
    minWidth: 180,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  deleteAllButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlaySafeArea: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  overlayCard: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    maxHeight: '80%',
    gap: Spacing.two,
  },
  overlayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  overlayTitle: {
    flexShrink: 1,
  },
  overlayScroll: {
    flexGrow: 0,
  },
  overlayScrollContent: {
    paddingVertical: Spacing.two,
    gap: Spacing.half,
  },
  eventLine: {
    marginBottom: Spacing.half,
  },
});
