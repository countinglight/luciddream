import { Slider } from "@expo/ui/community/slider";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Chip } from "@/components/chip";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useSettings } from "@/context/settings-context";
import { formatDuration, parseDuration, type SleepStage } from "@/engine";
import { useTheme } from "@/hooks/use-theme";
import type {
  LogCategory,
  Settings,
  SimulatedContextSettings,
} from "@/lib/settings";

type PresetKey = keyof Settings["periodPresets"];

const LOG_CATEGORIES: { id: LogCategory; label: string }[] = [
  { id: "playback", label: "Playback" },
  { id: "context", label: "Context" },
  { id: "engine", label: "Engine" },
  { id: "errors", label: "Errors" },
];

const SLEEP_STAGES: { id: SleepStage | "none"; label: string }[] = [
  { id: "none", label: "None" },
  { id: "awake", label: "Awake" },
  { id: "light", label: "Light" },
  { id: "deep", label: "Deep" },
  { id: "rem", label: "REM" },
];

const PERIOD_PRESETS: { id: PresetKey; label: string }[] = [
  { id: "short", label: "Short ($short)" },
  { id: "medium", label: "Medium ($medium)" },
  { id: "long", label: "Long ($long)" },
];

/** One period-preset editor. Keeps a local draft while typing so half-written
 * durations ("1h3…") aren't rewritten mid-keystroke; commits on blur/submit
 * only when the draft parses to a positive duration, otherwise reverts. */
function PeriodPresetInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (ms: number) => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft !== null) {
      try {
        const ms = parseDuration(draft);
        if (ms > 0) onCommit(ms);
      } catch {
        // Invalid draft — revert to the current value.
      }
    }
    setDraft(null);
  };

  const isInvalid =
    draft !== null &&
    (() => {
      try {
        return parseDuration(draft) <= 0;
      } catch {
        return true;
      }
    })();

  return (
    <ThemedView style={styles.row}>
      <ThemedText>{label}</ThemedText>
      <TextInput
        value={draft ?? formatDuration(value)}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="e.g. 20m"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.numericInput,
          {
            color: theme.text,
            borderColor: isInvalid ? theme.danger : theme.backgroundSelected,
          },
        ]}
      />
    </ThemedView>
  );
}

export default function SettingsScreen() {
  const { settings, updateSettings, isLoaded } = useSettings();
  const theme = useTheme();

  const updateSimulatedContext = (patch: Partial<SimulatedContextSettings>) =>
    updateSettings({
      simulatedContext: { ...settings.simulatedContext, ...patch },
    });

  const updateLogCategory = (category: LogCategory, value: boolean) =>
    updateSettings({
      logCategories: { ...settings.logCategories, [category]: value },
    });

  const parseOptionalNumber = (text: string): number | undefined => {
    const trimmed = text.trim();
    if (trimmed === "") return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : undefined;
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : BottomTabInset}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <ThemedText type="title" style={styles.title}>
              Settings
            </ThemedText>

            {!isLoaded ? (
              <ThemedText themeColor="textSecondary">Loading…</ThemedText>
            ) : (
              <>
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedView style={styles.row}>
                    <ThemedText type="smallBold">
                      Master default volume
                    </ThemedText>
                    <ThemedText type="code">
                      {Math.round(settings.masterDefaultVolume * 100)}%
                    </ThemedText>
                  </ThemedView>
                  <ThemedText type="small" themeColor="textSecondary">
                    Seeds the Run screen&apos;s volume slider.
                  </ThemedText>
                  <Slider
                    value={settings.masterDefaultVolume}
                    onValueChange={(value) =>
                      updateSettings({ masterDefaultVolume: value })
                    }
                    minimumTrackTintColor={theme.tint}
                  />
                </ThemedView>

                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">Period presets</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    T-shirt-sized period values your scripts can reference as
                    $short, $medium, and $long — anywhere a duration is
                    accepted.
                  </ThemedText>
                  {PERIOD_PRESETS.map(({ id, label }) => (
                    <PeriodPresetInput
                      key={id}
                      label={label}
                      value={settings.periodPresets[id]}
                      onCommit={(ms) =>
                        updateSettings({
                          periodPresets: {
                            ...settings.periodPresets,
                            [id]: ms,
                          },
                        })
                      }
                    />
                  ))}
                </ThemedView>

                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">Audio focus</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Lower Others turns other apps&apos; audio down while
                    alarms still cut through. Exclusive silences other
                    apps&apos; audio entirely.
                  </ThemedText>
                  <ThemedView style={styles.chipRow}>
                    <Chip
                      label="Lower Others"
                      selected={settings.audioFocus === "duck"}
                      onPress={() => updateSettings({ audioFocus: "duck" })}
                    />
                    <Chip
                      label="Exclusive"
                      selected={settings.audioFocus === "exclusive"}
                      onPress={() =>
                        updateSettings({ audioFocus: "exclusive" })
                      }
                    />
                  </ThemedView>
                </ThemedView>

                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">Voice interrupt</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    A sustained loud sound near the device pauses and lowers
                    volume, then resumes on its own. It can never stop a run by
                    itself.
                  </ThemedText>
                  <ThemedView style={styles.chipRow}>
                    <Chip
                      label="Off"
                      selected={settings.voiceInterrupt === "off"}
                      onPress={() => updateSettings({ voiceInterrupt: "off" })}
                    />
                    <Chip
                      label="Gentle"
                      selected={settings.voiceInterrupt === "gentle"}
                      onPress={() =>
                        updateSettings({ voiceInterrupt: "gentle" })
                      }
                    />
                  </ThemedView>
                </ThemedView>

                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">Logging</ThemedText>
                  {LOG_CATEGORIES.map(({ id, label }) => (
                    <ThemedView key={id} style={styles.row}>
                      <ThemedText>{label}</ThemedText>
                      <Switch
                        value={settings.logCategories[id]}
                        onValueChange={(value) => updateLogCategory(id, value)}
                        trackColor={{ true: theme.text }}
                      />
                    </ThemedView>
                  ))}
                </ThemedView>

                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">Simulated context</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Drive a script&apos;s conditionals by hand, with no wearable
                    — takes effect live, even while a run is playing.
                  </ThemedText>

                  <ThemedView style={styles.row}>
                    <ThemedText>REM</ThemedText>
                    <Switch
                      value={settings.simulatedContext.rem}
                      onValueChange={(value) =>
                        updateSimulatedContext({ rem: value })
                      }
                      trackColor={{ true: theme.text }}
                    />
                  </ThemedView>

                  <ThemedText type="smallBold">Sleep stage</ThemedText>
                  <ThemedView style={styles.chipRow}>
                    {SLEEP_STAGES.map(({ id, label }) => (
                      <Chip
                        key={id}
                        label={label}
                        selected={settings.simulatedContext.sleepStage === id}
                        onPress={() =>
                          updateSimulatedContext({ sleepStage: id })
                        }
                      />
                    ))}
                  </ThemedView>

                  <ThemedView style={styles.row}>
                    <ThemedText>Heart rate</ThemedText>
                    <TextInput
                      value={settings.simulatedContext.hr?.toString() ?? ""}
                      onChangeText={(text) =>
                        updateSimulatedContext({
                          hr: parseOptionalNumber(text),
                        })
                      }
                      keyboardType="numeric"
                      placeholder="unset"
                      placeholderTextColor={theme.textSecondary}
                      style={[
                        styles.numericInput,
                        {
                          color: theme.text,
                          borderColor: theme.backgroundSelected,
                        },
                      ]}
                    />
                  </ThemedView>

                  <ThemedView style={styles.row}>
                    <ThemedText>HRV</ThemedText>
                    <TextInput
                      value={settings.simulatedContext.hrv?.toString() ?? ""}
                      onChangeText={(text) =>
                        updateSimulatedContext({
                          hrv: parseOptionalNumber(text),
                        })
                      }
                      keyboardType="numeric"
                      placeholder="unset"
                      placeholderTextColor={theme.textSecondary}
                      style={[
                        styles.numericInput,
                        {
                          color: theme.text,
                          borderColor: theme.backgroundSelected,
                        },
                      ]}
                    />
                  </ThemedView>
                </ThemedView>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    flexDirection: "row",
  },
  safeArea: {
    flex: 1,
    alignItems: "stretch",
    width: "100%",
    maxWidth: MaxContentWidth,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    alignItems: "stretch",
    gap: Spacing.three,
    paddingTop: Spacing.six,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  title: {
    textAlign: "center",
  },
  card: {
    gap: Spacing.two,
    alignSelf: "stretch",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    backgroundColor: "transparent",
  },
  numericInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    minWidth: 80,
    textAlign: "right",
  },
});
