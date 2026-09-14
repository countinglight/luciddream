import { Slider } from "@expo/ui/community/slider";
import Constants from "expo-constants";
import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Chip } from "@/components/chip";
import { Icon } from "@/components/icons";
import { OwlAvatar } from "@/components/owl-avatar";
import {
  SegmentedControl,
  type SegmentOption,
} from "@/components/segmented-control";
import { SheetHeader } from "@/components/sheet-header";
import { Surface } from "@/components/surface";
import { ThemedText } from "@/components/themed-text";
import { MaxContentWidth, Radius } from "@/constants/theme";
import { useSettings } from "@/context/settings-context";
import { formatDuration, parseDuration, type SleepStage } from "@/engine";
import { useTheme } from "@/hooks/use-theme";
import type {
  LogCategory,
  Settings,
  SimulatedContextSettings,
  ThemePreference,
} from "@/lib/settings";
import { telemetry } from "@/telemetry";

type PresetKey = keyof Settings["periodPresets"];

const THEME_OPTIONS: SegmentOption<ThemePreference>[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const AUDIO_FOCUS_OPTIONS: SegmentOption<Settings["audioFocus"]>[] = [
  { value: "duck", label: "Lower others" },
  { value: "exclusive", label: "Exclusive" },
];

const VOICE_OPTIONS: SegmentOption<Settings["voiceInterrupt"]>[] = [
  { value: "off", label: "Off" },
  { value: "gentle", label: "Gentle" },
];

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
  { id: "short", label: "$short" },
  { id: "medium", label: "$medium" },
  { id: "long", label: "$long" },
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
    <View style={styles.row}>
      <ThemedText type="mono" numberOfLines={1}>
        {label}
      </ThemedText>
      <TextInput
        value={draft ?? formatDuration(value)}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="e.g. 20m"
        placeholderTextColor={theme.textMuted}
        accessibilityLabel={`${label} duration`}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.background,
            borderColor: isInvalid ? theme.danger : theme.border,
          },
        ]}
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText
        type="eyebrow"
        themeColor="textSecondary"
        style={styles.sectionTitle}
      >
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, updateSettings, isLoaded } = useSettings();
  const theme = useTheme();
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  const enabledLogCount = LOG_CATEGORIES.filter(
    ({ id }) => settings.logCategories[id],
  ).length;
  const switchColors = { true: theme.tint, false: theme.track };

  return (
    <View style={[styles.root, { backgroundColor: theme.sheet }]}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <SheetHeader title="Settings" />
            {!isLoaded ? (
              <ThemedText themeColor="textSecondary">Loading…</ThemedText>
            ) : (
              <>
                <Section title="Appearance">
                  <Surface style={styles.card}>
                    <ThemedText>Theme</ThemedText>
                    <SegmentedControl
                      options={THEME_OPTIONS}
                      value={settings.themePreference}
                      onChange={(value) =>
                        updateSettings({ themePreference: value })
                      }
                    />
                  </Surface>
                </Section>

                <Section title="Sound">
                  <Surface style={styles.card}>
                    <View style={styles.row}>
                      <ThemedText>Default volume</ThemedText>
                      <ThemedText type="mono">
                        {Math.round(settings.masterDefaultVolume * 100)}%
                      </ThemedText>
                    </View>
                    <Slider
                      value={settings.masterDefaultVolume}
                      onValueChange={(value) =>
                        updateSettings({ masterDefaultVolume: value })
                      }
                      minimumTrackTintColor={theme.tint}
                    />
                    <ThemedText type="small" themeColor="textSecondary">
                      Where the volume starts on Tonight.
                    </ThemedText>
                    <View
                      style={[
                        styles.divider,
                        { backgroundColor: theme.border },
                      ]}
                    />
                    <ThemedText>Other apps&apos; audio</ThemedText>
                    <SegmentedControl
                      options={AUDIO_FOCUS_OPTIONS}
                      value={settings.audioFocus}
                      onChange={(value) =>
                        updateSettings({ audioFocus: value })
                      }
                    />
                    <ThemedText type="small" themeColor="textSecondary">
                      Lower others turns them down while cues still cut through.
                      Exclusive silences them.
                    </ThemedText>
                  </Surface>
                </Section>

                <Section title="Voice interrupt">
                  <Surface style={styles.card}>
                    <SegmentedControl
                      options={VOICE_OPTIONS}
                      value={settings.voiceInterrupt}
                      onChange={(value) =>
                        updateSettings({ voiceInterrupt: value })
                      }
                    />
                    <ThemedText type="small" themeColor="textSecondary">
                      A sustained loud sound near the device pauses and lowers
                      volume, then resumes on its own. It can never stop a run
                      by itself.
                    </ThemedText>
                  </Surface>
                </Section>

                <Section title="Period presets">
                  <Surface style={styles.card}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Durations your scripts can use as $short, $medium and
                      $long — anywhere a duration is accepted.
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
                  </Surface>
                </Section>

                {telemetry.available && (
                  <Section title="Beta diagnostics">
                    <Surface style={styles.card}>
                      <View style={styles.row}>
                        <ThemedText style={styles.shrink}>
                          Share night reports
                        </ThemedText>
                        <Switch
                          value={settings.diagnostics.enabled}
                          onValueChange={(enabled) =>
                            updateSettings({
                              diagnostics: { ...settings.diagnostics, enabled },
                            })
                          }
                          trackColor={switchColors}
                          accessibilityLabel="Share night reports with the LucidDream developer"
                        />
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        Helps test the beta. Each night sends when it started
                        and ended, how it ended, the script names, and your
                        phone model, system and app version. Never audio, logs
                        or your library. Turning this off deletes anything not
                        yet sent.
                      </ThemedText>
                      {settings.diagnostics.enabled && (
                        <View style={styles.row}>
                          <ThemedText>Your name</ThemedText>
                          <TextInput
                            value={settings.diagnostics.testerLabel}
                            onChangeText={(testerLabel) =>
                              updateSettings({
                                diagnostics: {
                                  ...settings.diagnostics,
                                  testerLabel,
                                },
                              })
                            }
                            autoCapitalize="words"
                            autoCorrect={false}
                            maxLength={60}
                            placeholder="optional"
                            placeholderTextColor={theme.textMuted}
                            accessibilityLabel="Name shown with your reports"
                            style={[
                              styles.input,
                              styles.wideInput,
                              {
                                color: theme.text,
                                backgroundColor: theme.background,
                                borderColor: theme.border,
                              },
                            ]}
                          />
                        </View>
                      )}
                    </Surface>
                  </Section>
                )}

                <Section title="Advanced">
                  <Surface style={styles.flushCard}>
                    <Pressable
                      onPress={() => setAdvancedOpen((open) => !open)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: advancedOpen }}
                      style={({ pressed }) => [
                        styles.disclosure,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.shrink}>
                        <ThemedText>Logging &amp; simulated context</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {`${enabledLogCount} of 4 log categories on · for testing without a wearable`}
                        </ThemedText>
                      </View>
                      <Icon
                        name={advancedOpen ? "chevron-down" : "chevron-right"}
                        color={theme.textSecondary}
                        size={16}
                      />
                    </Pressable>

                    {advancedOpen && (
                      <View
                        style={[
                          styles.advancedBody,
                          { borderTopColor: theme.border },
                        ]}
                      >
                        <ThemedText type="eyebrow" themeColor="textSecondary">
                          Logging
                        </ThemedText>
                        {LOG_CATEGORIES.map(({ id, label }) => (
                          <View key={id} style={styles.row}>
                            <ThemedText>{label}</ThemedText>
                            <Switch
                              value={settings.logCategories[id]}
                              onValueChange={(value) =>
                                updateLogCategory(id, value)
                              }
                              trackColor={switchColors}
                            />
                          </View>
                        ))}

                        <ThemedText
                          type="eyebrow"
                          themeColor="textSecondary"
                          style={styles.subheading}
                        >
                          Simulated context
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          Drive a script&apos;s conditionals by hand, with no
                          wearable — takes effect live, even while a run is
                          playing.
                        </ThemedText>
                        <View style={styles.row}>
                          <ThemedText>REM</ThemedText>
                          <Switch
                            value={settings.simulatedContext.rem}
                            onValueChange={(value) =>
                              updateSimulatedContext({ rem: value })
                            }
                            trackColor={switchColors}
                          />
                        </View>
                        <ThemedText>Sleep stage</ThemedText>
                        <View style={styles.chipRow}>
                          {SLEEP_STAGES.map(({ id, label }) => (
                            <Chip
                              key={id}
                              label={label}
                              selected={
                                settings.simulatedContext.sleepStage === id
                              }
                              onPress={() =>
                                updateSimulatedContext({ sleepStage: id })
                              }
                            />
                          ))}
                        </View>
                        <View style={styles.row}>
                          <ThemedText>Heart rate</ThemedText>
                          <TextInput
                            value={
                              settings.simulatedContext.hr?.toString() ?? ""
                            }
                            onChangeText={(text) =>
                              updateSimulatedContext({
                                hr: parseOptionalNumber(text),
                              })
                            }
                            keyboardType="numeric"
                            placeholder="unset"
                            placeholderTextColor={theme.textMuted}
                            style={[
                              styles.input,
                              {
                                color: theme.text,
                                backgroundColor: theme.background,
                                borderColor: theme.border,
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.row}>
                          <ThemedText>HRV</ThemedText>
                          <TextInput
                            value={
                              settings.simulatedContext.hrv?.toString() ?? ""
                            }
                            onChangeText={(text) =>
                              updateSimulatedContext({
                                hrv: parseOptionalNumber(text),
                              })
                            }
                            keyboardType="numeric"
                            placeholder="unset"
                            placeholderTextColor={theme.textMuted}
                            style={[
                              styles.input,
                              {
                                color: theme.text,
                                backgroundColor: theme.background,
                                borderColor: theme.border,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    )}
                  </Surface>
                </Section>

                <View style={styles.footer}>
                  <OwlAvatar size={22} />
                  <ThemedText type="eyebrow" themeColor="textMuted">
                    {`LucidDream ${Constants.expoConfig?.version ?? ""}`}
                  </ThemedText>
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  shrink: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
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
    gap: 18,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    marginLeft: 4,
  },
  card: {
    padding: 16,
    gap: 12,
  },
  flushCard: {
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  disclosure: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  advancedBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  subheading: {
    marginTop: 10,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 88,
    flexShrink: 0,
    textAlign: "right",
  },
  wideInput: {
    width: 160,
    flexShrink: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
});
