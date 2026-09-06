import * as DocumentPicker from "expo-document-picker";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, TextInput } from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { previewSignal } from "@/audio";
import { Button } from "@/components/button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { getLibraryFileStore, useLibrary } from "@/context/library-context";
import { useTheme } from "@/hooks/use-theme";
import type {
    LibraryItem,
    LibraryScript,
    LibrarySignal,
} from "@/storage/library-types";
import { resolveScriptText } from "@/storage/scripts";

function sourceBadge(item: LibraryItem): string {
  return item.source.type;
}

function SignalRow({ item }: { item: LibrarySignal }) {
  const { removeItem, setSavedOffline } = useLibrary();
  const isBundled = item.source.type === "bundled";
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  const toggleOffline = async () => {
    setBusy(true);
    try {
      await setSavedOffline(item, !item.savedOffline);
    } finally {
      setBusy(false);
    }
  };

  const play = async () => {
    setPlaying(true);
    setPlayError(null);
    try {
      await previewSignal(item, getLibraryFileStore());
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlaying(false);
    }
  };

  return (
    <ThemedView style={styles.row}>
      <ThemedView style={styles.rowMain}>
        <ThemedText type="smallBold">{item.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {sourceBadge(item)} ·{" "}
          {item.savedOffline ? "saved offline" : "not saved offline"}
        </ThemedText>
        {playError && (
          <ThemedText type="small" themeColor="danger">
            {playError}
          </ThemedText>
        )}
      </ThemedView>
      <ThemedView style={styles.rowActions}>
        <Button
          label={playing ? "Playing…" : "Play"}
          onPress={play}
          loading={playing}
          size="small"
        />
        {!isBundled && item.source.type === "url" && (
          <Button
            label={item.savedOffline ? "Remove offline" : "Save offline"}
            onPress={toggleOffline}
            disabled={busy}
            size="small"
          />
        )}
        {!isBundled && (
          <Button
            label="Remove"
            onPress={() => removeItem(item)}
            variant="danger"
            size="small"
          />
        )}
      </ThemedView>
    </ThemedView>
  );
}

function ScriptRow({
  item,
  onView,
}: {
  item: LibraryScript;
  onView: (item: LibraryScript) => void;
}) {
  const { removeItem, setSavedOffline } = useLibrary();
  const isBundled = item.source.type === "bundled";
  const [busy, setBusy] = useState(false);

  const toggleOffline = async () => {
    setBusy(true);
    try {
      await setSavedOffline(item, !item.savedOffline);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.row}>
      <ThemedView style={styles.rowMain}>
        <ThemedText type="smallBold">{item.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {sourceBadge(item)} ·{" "}
          {item.savedOffline ? "saved offline" : "not saved offline"}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.rowActions}>
        <Button label="View" onPress={() => onView(item)} size="small" />
        {!isBundled && item.source.type === "url" && (
          <Button
            label={item.savedOffline ? "Remove offline" : "Save offline"}
            onPress={toggleOffline}
            disabled={busy}
            size="small"
          />
        )}
        {!isBundled && (
          <Button
            label="Remove"
            onPress={() => removeItem(item)}
            variant="danger"
            size="small"
          />
        )}
      </ThemedView>
    </ThemedView>
  );
}

function ScriptViewer({
  item,
  onClose,
}: {
  item: LibraryScript;
  onClose: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveScriptText(item, getLibraryFileStore())
      .then((value) => {
        if (!cancelled) setText(value);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  return (
    <ThemedView style={styles.overlay}>
      <SafeAreaView style={styles.overlaySafeArea}>
        <ThemedView type="backgroundElement" style={styles.overlayCard}>
          <ThemedView style={styles.overlayHeader}>
            <ThemedText
              type="subtitle"
              style={styles.overlayTitle}
              numberOfLines={1}
            >
              {item.name}
            </ThemedText>
            <Button label="Close" onPress={onClose} size="small" />
          </ThemedView>
          <ScrollView
            style={styles.overlayScroll}
            contentContainerStyle={styles.overlayScrollContent}
          >
            {error ? (
              <ThemedText themeColor="danger">{error}</ThemedText>
            ) : text === null ? (
              <ThemedText themeColor="textSecondary">Loading…</ThemedText>
            ) : (
              <ThemedText type="code" selectable>
                {text}
              </ThemedText>
            )}
          </ScrollView>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

function AddFromUrlForm({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (url: string, name: string) => Promise<void>;
}) {
  const theme = useTheme();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(url.trim(), name.trim());
      setName("");
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.addForm}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.backgroundSelected },
        ]}
      />
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.backgroundSelected },
        ]}
      />
      <Button
        label="Add from URL"
        onPress={submit}
        disabled={busy}
        loading={busy}
        style={styles.addButton}
      />
      {error && (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      )}
    </ThemedView>
  );
}

export default function LibraryScreen() {
  const {
    isLoaded,
    signals,
    scripts,
    addSignalFromUrl,
    addScriptFromUrl,
    addSignalFromFile,
    addScriptFromFile,
  } = useLibrary();
  const [viewingScript, setViewingScript] = useState<LibraryScript | null>(
    null,
  );

  const pickSignalFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "audio/*" });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await addSignalFromFile(asset.uri, asset.name, asset.name);
  };

  const pickScriptFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      // Windows' file-open dialog filters by extension, not MIME type, and
      // .yaml/.yml aren't registered to any of these MIME types there — so
      // without the extensions listed, the default filter shows nothing.
      type: [
        ".yaml",
        ".yml",
        "text/yaml",
        "text/x-yaml",
        "text/*",
        "application/x-yaml",
        "*/*",
      ],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await addScriptFromFile(asset.uri, asset.name, asset.name);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText type="title" style={styles.title}>
            Library
          </ThemedText>

          {!isLoaded ? (
            <ThemedText themeColor="textSecondary">Loading…</ThemedText>
          ) : (
            <>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="subtitle" style={styles.sectionHeading}>
                  Signals
                </ThemedText>
                {signals.map((item) => (
                  <SignalRow key={item.id} item={item} />
                ))}
                <AddFromUrlForm
                  placeholder="https://…/signal.mp3"
                  onAdd={addSignalFromUrl}
                />
                <Button
                  label="Add from file"
                  onPress={pickSignalFile}
                  style={styles.addButton}
                />
              </ThemedView>

              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="subtitle" style={styles.sectionHeading}>
                  Scripts
                </ThemedText>
                {scripts.map((item) => (
                  <ScriptRow
                    key={item.id}
                    item={item}
                    onView={setViewingScript}
                  />
                ))}
                <AddFromUrlForm
                  placeholder="https://…/script.yaml"
                  onAdd={addScriptFromUrl}
                />
                <Button
                  label="Add from file"
                  onPress={pickScriptFile}
                  style={styles.addButton}
                />
              </ThemedView>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {viewingScript && (
        <ScriptViewer
          item={viewingScript}
          onClose={() => setViewingScript(null)}
        />
      )}
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
  scroll: {
    flex: 1,
    alignSelf: "stretch",
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
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
  sectionHeading: {
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  rowMain: {
    gap: 2,
    flexShrink: 1,
  },
  rowActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  addForm: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  addButton: {
    alignSelf: "flex-start",
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlaySafeArea: {
    width: "100%",
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  overlayCard: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    maxHeight: "80%",
    gap: Spacing.two,
  },
  overlayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "transparent",
  },
  overlayTitle: {
    flexShrink: 1,
  },
  overlayScroll: {
    flexGrow: 0,
  },
  overlayScrollContent: {
    paddingVertical: Spacing.two,
  },
});
