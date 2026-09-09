import { useEffect, useState, type PropsWithChildren } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { SimulatedViewportProvider } from "@/context/simulated-viewport-context";

/** Below this real browser width there's no room for a phone frame plus
 * toolbar, and the browser window is already phone-sized — so the frame
 * would just nest a phone preview inside an actual phone-sized window. */
const MIN_WIDTH_FOR_FRAME_CHROME = 700;

const STORAGE_KEY = "luciddream.devicePreview.v1";

const PRESETS = [
  { id: "full", label: "Full width", width: null, height: null },
  { id: "iphone-17", label: "iPhone 17 (402×874)", width: 402, height: 874 },
  { id: "galaxy-s26", label: "Galaxy S26 (360×780)", width: 360, height: 780 },
  { id: "pixel-10", label: "Pixel 10 (412×924)", width: 412, height: 924 },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

function readStoredPreset(): PresetId {
  try {
    if (typeof window === "undefined") return "pixel-10";
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    if (stored && PRESETS.some((preset) => preset.id === stored)) {
      return stored as PresetId;
    }
  } catch {
    // localStorage unavailable (e.g. privacy mode) — fall back to default.
  }
  return "pixel-10";
}

/**
 * Web-only dev tool: previews the app at a phone-sized viewport instead of
 * the full browser window, so narrow-screen layout issues (wrapping,
 * overflow forcing scroll) are visible without a physical device. Persists
 * the chosen preset in localStorage, per browser.
 */
export function DeviceFrame({ children }: PropsWithChildren) {
  const [presetId, setPresetId] = useState<PresetId>(() => readStoredPreset());
  const { width: realWidth } = useWindowDimensions();

  useEffect(() => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, presetId);
    } catch {
      // Ignore — preview preference just won't persist across reloads.
    }
  }, [presetId]);

  // Already on a narrow real window (a resized dev-tools viewport, or an
  // actual mobile browser) — there's no room for the frame, and none is
  // needed since the window itself already reproduces the constraint.
  if (realWidth < MIN_WIDTH_FOR_FRAME_CHROME) {
    return (
      <SimulatedViewportProvider value={null}>
        {children}
      </SimulatedViewportProvider>
    );
  }

  const preset =
    PRESETS.find((candidate) => candidate.id === presetId) ?? PRESETS[0];
  const viewport =
    preset.width && preset.height
      ? { width: preset.width, height: preset.height }
      : null;

  return (
    <View style={styles.page}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarLabel}>Preview:</Text>
        {PRESETS.map((candidate) => (
          <Pressable
            key={candidate.id}
            onPress={() => setPresetId(candidate.id)}
            style={[
              styles.presetButton,
              candidate.id === presetId && styles.presetButtonActive,
            ]}
          >
            <Text
              style={[
                styles.presetButtonText,
                candidate.id === presetId && styles.presetButtonTextActive,
              ]}
            >
              {candidate.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.stageScroll}
        contentContainerStyle={styles.stage}
      >
        {viewport ? (
          <View
            style={[
              styles.frame,
              { width: viewport.width, height: viewport.height },
            ]}
          >
            <SimulatedViewportProvider value={viewport}>
              {children}
            </SimulatedViewportProvider>
          </View>
        ) : (
          <View style={styles.fullWidth}>
            <SimulatedViewportProvider value={null}>
              {children}
            </SimulatedViewportProvider>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#1b1c1e",
  },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#111214",
  },
  toolbarLabel: {
    color: "#9aa0a6",
    fontSize: 12,
    marginRight: 4,
  },
  presetButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#2a2b2e",
  },
  presetButtonActive: {
    backgroundColor: "#3c87f7",
  },
  presetButtonText: {
    color: "#c9ccd1",
    fontSize: 12,
  },
  presetButtonTextActive: {
    color: "#ffffff",
    fontWeight: "600",
  },
  stageScroll: {
    flex: 1,
    alignSelf: "stretch",
  },
  stage: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  frame: {
    borderRadius: 32,
    borderWidth: 10,
    borderColor: "#000000",
    overflow: "hidden",
    backgroundColor: "#ffffff",
    // A physical-phone drop shadow so the frame reads as a device, not a box.
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.45,
    shadowRadius: 40,
    elevation: 12,
  },
  fullWidth: {
    flexGrow: 1,
    alignSelf: "stretch",
    width: "100%",
  },
});
