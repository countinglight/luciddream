import { Slider } from "@expo/ui/community/slider";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { Icon } from "@/components/icons";
import { NightDial } from "@/components/night-dial";
import { NightSky } from "@/components/night-sky";
import { OwlAvatar } from "@/components/owl-avatar";
import { ScriptPickerModal } from "@/components/script-picker-modal";
import { Surface } from "@/components/surface";
import { ThemedText } from "@/components/themed-text";
import { MaxContentWidth, phaseColors, withAlpha } from "@/constants/theme";
import { useLibrary } from "@/context/library-context";
import { useSessionContext } from "@/context/session-context";
import { useSettings } from "@/context/settings-context";
import { useIsPrototype } from "@/hooks/use-is-prototype";
import { useTheme } from "@/hooks/use-theme";
import { greetingFor } from "@/lib/format-time";
import {
  RUN_PHASES,
  type RunPhaseKey,
  validateRunPhaseScriptIds,
} from "@/lib/run-phases";
import type { LibraryScript } from "@/storage/library-types";

/**
 * Tonight — the console. The night dial and the three-phase timeline replace
 * the old Home tab; Library, Nights and Settings open as sheets from the
 * header icons instead of a tab bar. Starting a run hands over to /run.
 */
export default function TonightScreen() {
  const { settings, updateSettings } = useSettings();
  const { scripts } = useLibrary();
  const session = useSessionContext();
  const theme = useTheme();
  const colors = phaseColors(theme);
  const isPrototype = useIsPrototype();

  const [volume, setVolume] = useState(settings.masterDefaultVolume);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [pickerPhase, setPickerPhase] = useState<RunPhaseKey | null>(null);
  const [greeting] = useState(() => greetingFor(new Date().getHours()));
  const isBusy = session.status === "starting" || session.status === "running";

  const selectedScripts = Object.fromEntries(
    RUN_PHASES.map((phase) => [
      phase.key,
      scripts.find(
        (script) => script.id === settings.runPhaseScriptIds[phase.key],
      ) ?? null,
    ]),
  ) as Record<RunPhaseKey, LibraryScript | null>;

  const effectiveIds = Object.fromEntries(
    RUN_PHASES.map((phase) => [
      phase.key,
      selectedScripts[phase.key]?.id ?? null,
    ]),
  ) as typeof settings.runPhaseScriptIds;
  const selectionError = validateRunPhaseScriptIds(effectiveIds);
  const selectedPhases = RUN_PHASES.map((phase, index) => ({
    index,
    label: phase.label,
    script: selectedScripts[phase.key],
  }));
  const setCount = selectedPhases.filter((phase) => phase.script).length;

  const selectScript = (phase: RunPhaseKey, scriptId: string | null) => {
    updateSettings({
      runPhaseScriptIds: { ...settings.runPhaseScriptIds, [phase]: scriptId },
    });
  };

  const handleTest = async (script: LibraryScript | null) => {
    if (!script || testingId || isBusy) return;
    setTestingId(script.id);
    try {
      await session.testPlay(script, volume);
    } finally {
      setTestingId(null);
    }
  };

  const handleStart = () => {
    session.start(selectedPhases, volume);
    router.push("/run");
  };

  const pickerIndex = RUN_PHASES.findIndex(
    (phase) => phase.key === pickerPhase,
  );
  const pickerConfig = pickerIndex >= 0 ? RUN_PHASES[pickerIndex] : null;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <NightSky />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <View style={styles.brandRow}>
                <OwlAvatar size={18} />
                <ThemedText type="eyebrow" themeColor="textSecondary">
                  LucidDream
                </ThemedText>
                {isPrototype && (
                  <View
                    style={[
                      styles.prototypeBadge,
                      { backgroundColor: withAlpha(theme.phase3, 0.18) },
                    ]}
                  >
                    <ThemedText
                      type="eyebrow"
                      style={[styles.prototypeText, { color: theme.phase3 }]}
                    >
                      Prototype
                    </ThemedText>
                  </View>
                )}
              </View>
              <ThemedText type="display" accessibilityRole="header">
                {greeting}
              </ThemedText>
            </View>
            <View style={styles.headerActions}>
              <IconButton
                label="Library"
                onPress={() => router.push("/library")}
              >
                <Icon name="books" color={theme.text} />
              </IconButton>
              <IconButton label="Nights" onPress={() => router.push("/nights")}>
                <Icon name="moon" color={theme.text} />
              </IconButton>
              <IconButton
                label="Settings"
                onPress={() => router.push("/settings")}
              >
                <Icon name="sliders" color={theme.text} />
              </IconButton>
            </View>
          </View>

          <View style={styles.dialWrap}>
            <NightDial
              size={236}
              ringColor={theme.border}
              phases={selectedPhases.map((phase) => ({
                color: colors[phase.index],
                state: phase.script ? "set" : "empty",
              }))}
            >
              <OwlAvatar
                size={104}
                borderColor={theme.backgroundElement}
                glowColor={theme.glow}
              />
            </NightDial>
          </View>

          <ThemedText
            type="eyebrow"
            themeColor="textSecondary"
            style={styles.centered}
          >
            {isBusy
              ? "A night is in progress"
              : `Tonight · ${setCount} of 3 phases set`}
          </ThemedText>

          <Surface style={styles.timeline}>
            <View
              style={[styles.timelineLine, { backgroundColor: theme.border }]}
            />
            {selectedPhases.map((phase) => (
              <PhaseRow
                key={phase.label}
                index={phase.index}
                label={phase.label}
                script={phase.script}
                color={colors[phase.index]}
                isLast={phase.index === RUN_PHASES.length - 1}
                disabled={isBusy}
                testing={phase.script !== null && testingId === phase.script.id}
                testDisabled={testingId !== null}
                onPick={() => setPickerPhase(RUN_PHASES[phase.index].key)}
                onTest={() => handleTest(phase.script)}
              />
            ))}
          </Surface>

          <Surface style={styles.volumeCard}>
            <View style={styles.volumeHeader}>
              <ThemedText type="eyebrow" themeColor="textSecondary">
                Volume
              </ThemedText>
              <ThemedText type="mono">{Math.round(volume * 100)}%</ThemedText>
            </View>
            <View style={styles.volumeRow}>
              <Icon name="speaker" color={theme.textSecondary} size={18} />
              <Slider
                value={volume}
                onValueChange={setVolume}
                minimumTrackTintColor={theme.tint}
                disabled={isBusy}
                style={styles.slider}
              />
              <Icon name="speaker-high" color={theme.textSecondary} size={18} />
            </View>
          </Surface>

          {selectionError && (
            <ThemedText
              type="small"
              themeColor="danger"
              style={styles.centered}
            >
              {selectionError}
            </ThemedText>
          )}

          {isBusy ? (
            <Surface style={styles.busyCard}>
              <View style={styles.busyText}>
                <ThemedText type="eyebrow" themeColor="tint">
                  In progress
                </ThemedText>
                <ThemedText numberOfLines={1}>
                  {session.activePhaseLabel ?? "Preparing the night"}
                </ThemedText>
              </View>
              <Button
                label="Return"
                variant="primary"
                size="small"
                onPress={() => router.push("/run")}
              />
            </Surface>
          ) : (
            <Button
              label="Begin the night"
              variant="hero"
              icon={<Icon name="moon" color="#ffffff" />}
              onPress={handleStart}
              loading={session.status === "starting"}
              disabled={selectionError !== null || testingId !== null}
            />
          )}
          <ThemedText
            type="eyebrow"
            themeColor="textMuted"
            style={styles.centered}
          >
            Your screen can go dark once it starts
          </ThemedText>
        </ScrollView>
      </SafeAreaView>

      <ScriptPickerModal
        visible={pickerConfig !== null}
        title={pickerConfig?.label ?? ""}
        eyebrow={`Phase 0${pickerIndex + 1}`}
        accentColor={colors[Math.max(0, pickerIndex)]}
        scripts={scripts}
        selectedId={
          pickerPhase ? (selectedScripts[pickerPhase]?.id ?? null) : null
        }
        emptyLabel="Skip this phase"
        emptyHint={
          pickerIndex === 0
            ? "Pre-sleep training is optional"
            : "Early Sleep or Wake Up must have a script"
        }
        onSelect={(scriptId) =>
          pickerPhase && selectScript(pickerPhase, scriptId)
        }
        onPreview={(script) => handleTest(script)}
        previewingId={testingId}
        onManageLibrary={() => {
          setPickerPhase(null);
          router.push("/library");
        }}
        onClose={() => setPickerPhase(null)}
      />
    </View>
  );
}

type PhaseRowProps = {
  index: number;
  label: string;
  script: LibraryScript | null;
  color: string;
  isLast: boolean;
  disabled: boolean;
  testing: boolean;
  testDisabled: boolean;
  onPick: () => void;
  onTest: () => void;
};

function PhaseRow({
  index,
  label,
  script,
  color,
  isLast,
  disabled,
  testing,
  testDisabled,
  onPick,
  onTest,
}: PhaseRowProps) {
  const theme = useTheme();
  // The row's tappable area and its ▶/+ button are siblings, not nested:
  // on web each Pressable button renders a <button>, which can't nest.
  return (
    <View
      style={[
        styles.row,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <Pressable
        onPress={onPick}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${script?.name ?? "no script"}. Change script`}
        style={({ pressed }) => [
          styles.rowPick,
          pressed && !disabled && styles.pressed,
        ]}
      >
      <View style={styles.nodeWrap}>
        <View
          style={[
            styles.node,
            script
              ? {
                  backgroundColor: color,
                  boxShadow: `0 0 10px ${withAlpha(color, 0.7)}`,
                }
              : {
                  borderWidth: 2,
                  borderStyle: "dashed",
                  borderColor: withAlpha(color, 0.75),
                  backgroundColor: theme.backgroundElement,
                },
          ]}
        />
      </View>
      <View style={styles.rowText}>
        <ThemedText
          type="eyebrow"
          style={{ color }}
        >{`0${index + 1} · ${label}`}</ThemedText>
        {script ? (
          <ThemedText type="defaultSemiBold" numberOfLines={1}>
            {script.name}
          </ThemedText>
        ) : (
          <ThemedText themeColor="textSecondary">
            {index === 0 ? "Add a script · optional" : "Add a script"}
          </ThemedText>
        )}
      </View>
      </Pressable>
      {script ? (
        <IconButton
          label={`Test ${script.name}`}
          tone="tinted"
          color={color}
          onPress={onTest}
          disabled={disabled || testDisabled}
          loading={testing}
        >
          <Icon name="play" color={color} size={16} />
        </IconButton>
      ) : (
        <IconButton
          label={`Choose a script for ${label}`}
          tone="dashed"
          color={color}
          onPress={onPick}
          disabled={disabled}
        >
          <Icon name="plus" color={color} size={18} />
        </IconButton>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  headerText: {
    flexShrink: 1,
    gap: 2,
  },
  prototypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 8,
  },
  prototypeText: {
    fontSize: 9.5,
    lineHeight: 14,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  dialWrap: {
    alignItems: "center",
    marginTop: 4,
  },
  centered: {
    textAlign: "center",
  },
  timeline: {
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  timelineLine: {
    position: "absolute",
    left: 26,
    top: 34,
    bottom: 34,
    width: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 64,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  rowPick: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 48,
  },
  nodeWrap: {
    width: 22,
    alignItems: "center",
  },
  node: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  volumeCard: {
    padding: 16,
    gap: 10,
  },
  volumeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  slider: {
    flex: 1,
  },
  busyCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
  },
  busyText: {
    flexShrink: 1,
    gap: 2,
  },
});
