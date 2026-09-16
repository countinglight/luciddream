import * as DocumentPicker from "expo-document-picker";
import { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { previewSignal } from "@/audio";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { Icon } from "@/components/icons";
import { SegmentedControl } from "@/components/segmented-control";
import { SheetHeader } from "@/components/sheet-header";
import { Surface } from "@/components/surface";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing, withAlpha } from "@/constants/theme";
import { useLibrary } from "@/context/library-context";
import { getFileStore } from "@/runtime/services";
import { useTheme } from "@/hooks/use-theme";
import {
  loadLibraryManifest,
  type LibraryManifest,
} from "@/storage/library-manifest";
import type {
  LibraryItem,
  LibraryScript,
  LibrarySignal,
} from "@/storage/library-types";
import { resolveScriptText } from "@/storage/scripts";

function sourceBadge(item: LibraryItem): string {
  return item.manifestUrl ? "manifest" : item.source.type;
}

function manifestHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function ItemTile({ kind }: { kind: "signal" | "script" }) {
  const theme = useTheme();
  const color = kind === "signal" ? theme.phase3 : theme.phase2;
  return (
    <View style={[styles.tile, { backgroundColor: withAlpha(color, 0.16) }]}>
      <Icon
        name={kind === "signal" ? "wave" : "script"}
        color={color}
        size={20}
      />
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: withAlpha(color, 0.14) }]}>
      <ThemedText type="eyebrow" style={[styles.badgeText, { color }]}>
        {label}
      </ThemedText>
    </View>
  );
}

function Badges({ item }: { item: LibraryItem }) {
  const theme = useTheme();
  return (
    <View style={styles.badges}>
      <Badge label={sourceBadge(item)} color={theme.textSecondary} />
      <Badge
        label={item.savedOffline ? "saved offline" : "not saved offline"}
        color={item.savedOffline ? theme.lucid : theme.warn}
      />
    </View>
  );
}

function SignalRow({ item, isLast }: { item: LibrarySignal; isLast: boolean }) {
  const theme = useTheme();
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
      await previewSignal(item, getFileStore());
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlaying(false);
    }
  };

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
      <ItemTile kind="signal" />
      <View style={styles.rowMain}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {item.name}
        </ThemedText>
        <Badges item={item} />
        {playError && (
          <ThemedText type="small" themeColor="danger">
            {playError}
          </ThemedText>
        )}
      </View>
      <View style={styles.rowActions}>
        <IconButton
          label={`Play ${item.name}`}
          tone="tinted"
          color={theme.phase3}
          size={40}
          onPress={play}
          loading={playing}
        >
          <Icon name="play" color={theme.phase3} size={14} />
        </IconButton>
        {!isBundled && item.source.type === "url" && (
          <IconButton
            label={item.savedOffline ? "Remove offline copy" : "Save offline"}
            tone="plain"
            size={40}
            onPress={toggleOffline}
            disabled={busy}
          >
            <Icon
              name={item.savedOffline ? "close" : "download"}
              color={theme.textSecondary}
              size={18}
            />
          </IconButton>
        )}
        {!isBundled && (
          <IconButton
            label={`Remove ${item.name}`}
            tone="plain"
            size={40}
            onPress={() => removeItem(item)}
          >
            <Icon name="trash" color={theme.danger} size={18} />
          </IconButton>
        )}
      </View>
    </View>
  );
}

function ScriptRow({
  item,
  onView,
  isLast,
}: {
  item: LibraryScript;
  onView: (item: LibraryScript) => void;
  isLast: boolean;
}) {
  const theme = useTheme();
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
    <View
      style={[
        styles.row,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <ItemTile kind="script" />
      <View style={styles.rowMain}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {item.name}
        </ThemedText>
        <Badges item={item} />
      </View>
      <View style={styles.rowActions}>
        {!isBundled && item.source.type === "url" && (
          <IconButton
            label={item.savedOffline ? "Remove offline copy" : "Save offline"}
            tone="plain"
            size={40}
            onPress={toggleOffline}
            disabled={busy}
          >
            <Icon
              name={item.savedOffline ? "close" : "download"}
              color={theme.textSecondary}
              size={18}
            />
          </IconButton>
        )}
        {!isBundled && (
          <IconButton
            label={`Remove ${item.name}`}
            tone="plain"
            size={40}
            onPress={() => removeItem(item)}
          >
            <Icon name="trash" color={theme.danger} size={18} />
          </IconButton>
        )}
        <IconButton
          label={`View ${item.name}`}
          tone="plain"
          size={40}
          onPress={() => onView(item)}
        >
          <Icon name="chevron-right" color={theme.textSecondary} size={16} />
        </IconButton>
      </View>
    </View>
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
    resolveScriptText(item, getFileStore())
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

function ImportItemPrompt({
  kind,
  name,
  onNameChange,
  onAddFromUrl,
  onAddFromFile,
  onClose,
}: {
  kind: "signal" | "script";
  name: string;
  onNameChange: (name: string) => void;
  onAddFromUrl: (url: string, name: string) => Promise<void>;
  onAddFromFile: () => Promise<boolean>;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFromUrl = async () => {
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAddFromUrl(url.trim(), name.trim());
      onNameChange("");
      setUrl("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const importFromFile = async () => {
    setBusy(true);
    setError(null);
    try {
      if (await onAddFromFile()) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ThemedView
        style={[styles.overlay, styles.manifestPromptOverlay]}
        onStartShouldSetResponder={(event) =>
          event.target === event.currentTarget
        }
        onResponderRelease={onClose}
      >
        <SafeAreaView style={styles.manifestReviewSafeArea}>
          <ThemedView
            type="backgroundElement"
            style={[
              styles.manifestReview,
              styles.itemImportSurface,
              { borderColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="subtitle">Import new {kind}</ThemedText>
            <TextInput
              value={name}
              onChangeText={onNameChange}
              placeholder="Name"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: theme.backgroundSelected,
                  backgroundColor: theme.background,
                },
              ]}
            />
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder={
                kind === "signal"
                  ? "https://…/signal.mp3"
                  : "https://…/script.yaml"
              }
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: theme.backgroundSelected,
                  backgroundColor: theme.background,
                },
              ]}
            />
            {error && (
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            )}
            <ThemedView style={styles.manifestReviewActions}>
              <Button
                label="Import from file"
                onPress={importFromFile}
                disabled={busy}
                style={styles.promptAction}
              />
              <Button
                label="Import from URL"
                onPress={importFromUrl}
                variant="primary"
                disabled={!name.trim() || !url.trim()}
                loading={busy}
                style={styles.promptAction}
              />
            </ThemedView>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

function ManifestReview({
  manifest,
  conflicts,
  busy,
  error,
  onImport,
  onClose,
}: {
  manifest: LibraryManifest;
  conflicts: number;
  busy: boolean;
  error: string | null;
  onImport: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const itemCount = manifest.signals.length + manifest.scripts.length;
  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ThemedView style={styles.overlay}>
        <SafeAreaView style={styles.manifestReviewSafeArea}>
          <ThemedView
            type="backgroundElement"
            style={[
              styles.manifestReview,
              styles.itemImportSurface,
              { borderColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="subtitle">Import this library?</ThemedText>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              numberOfLines={1}
            >
              {manifest.url}
            </ThemedText>
            <ThemedView style={styles.manifestSummary}>
              <ThemedView
                type="backgroundSelected"
                style={styles.manifestSummaryCell}
              >
                <ThemedText type="subtitle">
                  {manifest.signals.length}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  signals
                </ThemedText>
              </ThemedView>
              <ThemedView
                type="backgroundSelected"
                style={styles.manifestSummaryCell}
              >
                <ThemedText type="subtitle">
                  {manifest.scripts.length}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  scripts
                </ThemedText>
              </ThemedView>
            </ThemedView>
            {conflicts > 0 ? (
              <ThemedText type="small" themeColor="danger">
                {conflicts} item name
                {conflicts === 1 ? " conflicts" : "s conflict"}
                {
                  " with your current library. Remove or rename the existing item first."
                }
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Existing items with the same source URL will be updated, not
                duplicated.
              </ThemedText>
            )}
            {error && (
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            )}
            <ThemedView style={styles.manifestReviewActions}>
              <Button label="Cancel" onPress={onClose} />
              <Button
                label={`Import ${itemCount} item${itemCount === 1 ? "" : "s"}`}
                onPress={onImport}
                variant="primary"
                disabled={conflicts > 0 || itemCount === 0}
                loading={busy}
              />
            </ThemedView>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

function ManifestUrlPrompt({
  url,
  busy,
  error,
  onUrlChange,
  onReview,
  onClose,
}: {
  url: string;
  busy: boolean;
  error: string | null;
  onUrlChange: (url: string) => void;
  onReview: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ThemedView
        style={styles.overlay}
        onStartShouldSetResponder={(event) =>
          event.target === event.currentTarget
        }
        onResponderRelease={onClose}
      >
        <SafeAreaView style={styles.manifestReviewSafeArea}>
          <ThemedView
            type="backgroundElement"
            style={[
              styles.manifestReview,
              styles.itemImportSurface,
              { borderColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="subtitle">Import extension</ThemedText>
            <TextInput
              value={url}
              onChangeText={onUrlChange}
              placeholder="https://…/manifest.json"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: theme.backgroundSelected,
                  backgroundColor: theme.background,
                },
              ]}
            />
            {error && (
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            )}
            <ThemedView style={styles.manifestReviewActions}>
              <Button label="Cancel" onPress={onClose} />
              <Button
                label="Review"
                onPress={onReview}
                variant="primary"
                disabled={!url.trim()}
                loading={busy}
              />
            </ThemedView>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

export default function LibraryScreen() {
  const theme = useTheme();
  const {
    isLoaded,
    signals,
    scripts,
    addSignalFromUrl,
    addScriptFromUrl,
    addSignalFromFile,
    addScriptFromFile,
    importManifest,
  } = useLibrary();
  const [viewingScript, setViewingScript] = useState<LibraryScript | null>(
    null,
  );
  const [signalName, setSignalName] = useState("");
  const [scriptName, setScriptName] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [manifestPreview, setManifestPreview] =
    useState<LibraryManifest | null>(null);
  const [manifestBusy, setManifestBusy] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [showManifestUrlPrompt, setShowManifestUrlPrompt] = useState(false);
  const [showSignalImport, setShowSignalImport] = useState(false);
  const [showScriptImport, setShowScriptImport] = useState(false);
  const [tab, setTab] = useState<"scripts" | "signals">("scripts");

  const manifestSources = useMemo(() => {
    const sources = new Map<string, number>();
    for (const item of [...signals, ...scripts]) {
      if (item.manifestUrl) {
        sources.set(item.manifestUrl, (sources.get(item.manifestUrl) ?? 0) + 1);
      }
    }
    return [...sources].map(([url, count]) => ({ url, count }));
  }, [scripts, signals]);

  const manifestConflicts = useMemo(() => {
    if (!manifestPreview) return 0;
    const conflictsWith = (
      entry: LibraryManifest["signals"][number],
      items: LibraryItem[],
    ) =>
      items.some(
        (item) =>
          item.name === entry.name &&
          item.manifestUrl !== manifestPreview.url &&
          (item.source.type !== "url" || item.source.url !== entry.url),
      );
    return (
      manifestPreview.signals.filter((entry) => conflictsWith(entry, signals))
        .length +
      manifestPreview.scripts.filter((entry) => conflictsWith(entry, scripts))
        .length
    );
  }, [manifestPreview, scripts, signals]);

  const reviewManifest = async (url = manifestUrl) => {
    if (!url.trim()) return;
    setManifestBusy(true);
    setManifestError(null);
    try {
      const manifest = await loadLibraryManifest(url);
      setManifestUrl(manifest.url);
      setShowManifestUrlPrompt(false);
      setManifestPreview(manifest);
    } catch (err) {
      setManifestError(err instanceof Error ? err.message : String(err));
    } finally {
      setManifestBusy(false);
    }
  };

  const confirmManifestImport = async () => {
    if (!manifestPreview || manifestConflicts > 0) return;
    setManifestBusy(true);
    setManifestError(null);
    try {
      await importManifest(manifestPreview);
      setManifestPreview(null);
      setManifestUrl("");
    } catch (err) {
      setManifestError(err instanceof Error ? err.message : String(err));
    } finally {
      setManifestBusy(false);
    }
  };

  const pickSignalFile = async (): Promise<boolean> => {
    const result = await DocumentPicker.getDocumentAsync({ type: "audio/*" });
    if (result.canceled || !result.assets[0]) return false;
    const asset = result.assets[0];
    await addSignalFromFile(
      asset.uri,
      asset.name,
      signalName.trim() || asset.name,
    );
    setSignalName("");
    return true;
  };

  const pickScriptFile = async (): Promise<boolean> => {
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
    if (result.canceled || !result.assets[0]) return false;
    const asset = result.assets[0];
    await addScriptFromFile(
      asset.uri,
      asset.name,
      scriptName.trim() || asset.name,
    );
    setScriptName("");
    return true;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.sheet }]}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <SheetHeader title="Library" />
          {!isLoaded ? (
            <ThemedText themeColor="textSecondary">Loading…</ThemedText>
          ) : (
            <>
              <SegmentedControl
                options={[
                  { value: "scripts", label: "Scripts" },
                  { value: "signals", label: "Signals" },
                ]}
                value={tab}
                onChange={setTab}
              />

              {tab === "scripts" ? (
                <Surface style={styles.listCard}>
                  {scripts.length === 0 ? (
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      style={styles.emptyList}
                    >
                      No scripts yet.
                    </ThemedText>
                  ) : (
                    scripts.map((item, index) => (
                      <ScriptRow
                        key={item.id}
                        item={item}
                        onView={setViewingScript}
                        isLast={index === scripts.length - 1}
                      />
                    ))
                  )}
                </Surface>
              ) : (
                <Surface style={styles.listCard}>
                  {signals.length === 0 ? (
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      style={styles.emptyList}
                    >
                      No signals yet.
                    </ThemedText>
                  ) : (
                    signals.map((item, index) => (
                      <SignalRow
                        key={item.id}
                        item={item}
                        isLast={index === signals.length - 1}
                      />
                    ))
                  )}
                </Surface>
              )}

              {tab === "scripts" ? (
                <Button
                  label="Import new script"
                  icon={<Icon name="plus" color={theme.text} size={16} />}
                  onPress={() => setShowScriptImport(true)}
                />
              ) : (
                <Button
                  label="Import new signal"
                  icon={<Icon name="plus" color={theme.text} size={16} />}
                  onPress={() => setShowSignalImport(true)}
                />
              )}

              <ThemedText
                type="eyebrow"
                themeColor="textSecondary"
                style={styles.sectionTitle}
              >
                Library extensions
              </ThemedText>
              <Surface style={styles.card}>
                {manifestSources.length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    Add a whole collection of scripts and signals from one
                    manifest URL.
                  </ThemedText>
                )}
                {manifestSources.map((source) => (
                  <View
                    key={source.url}
                    style={[
                      styles.manifestSourceRow,
                      { borderColor: theme.border },
                    ]}
                  >
                    <View style={styles.rowMain}>
                      <ThemedText type="smallBold">
                        {manifestHost(source.url)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {source.count} item{source.count === 1 ? "" : "s"}
                      </ThemedText>
                    </View>
                    <Button
                      label="Refresh"
                      onPress={() => {
                        setManifestUrl(source.url);
                        setShowManifestUrlPrompt(true);
                        void reviewManifest(source.url);
                      }}
                      size="small"
                    />
                  </View>
                ))}
                <Button
                  label="Import extension"
                  size="small"
                  onPress={() => {
                    setManifestError(null);
                    setManifestUrl("");
                    setShowManifestUrlPrompt(true);
                  }}
                  style={styles.addButton}
                />
              </Surface>
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
      {manifestPreview && (
        <ManifestReview
          manifest={manifestPreview}
          conflicts={manifestConflicts}
          busy={manifestBusy}
          error={manifestError}
          onImport={confirmManifestImport}
          onClose={() => setManifestPreview(null)}
        />
      )}
      {showManifestUrlPrompt && (
        <ManifestUrlPrompt
          url={manifestUrl}
          busy={manifestBusy}
          error={manifestError}
          onUrlChange={setManifestUrl}
          onReview={() => reviewManifest()}
          onClose={() => setShowManifestUrlPrompt(false)}
        />
      )}
      {showSignalImport && (
        <ImportItemPrompt
          kind="signal"
          name={signalName}
          onNameChange={setSignalName}
          onAddFromUrl={addSignalFromUrl}
          onAddFromFile={pickSignalFile}
          onClose={() => setShowSignalImport(false)}
        />
      )}
      {showScriptImport && (
        <ImportItemPrompt
          kind="script"
          name={scriptName}
          onNameChange={setScriptName}
          onAddFromUrl={addScriptFromUrl}
          onAddFromFile={pickScriptFile}
          onClose={() => setShowScriptImport(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
  },
  scroll: {
    flex: 1,
    alignSelf: "stretch",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
    gap: 14,
  },
  card: {
    gap: Spacing.two,
    padding: 16,
  },
  listCard: {
    paddingHorizontal: 14,
  },
  emptyList: {
    paddingVertical: 18,
  },
  sectionTitle: {
    marginLeft: 4,
    marginTop: 8,
  },
  tile: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 9.5,
    lineHeight: 14,
    letterSpacing: 1,
  },
  sectionHeading: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
    marginBottom: Spacing.one,
  },
  extensionsCard: {
    paddingVertical: Spacing.three,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    paddingVertical: 10,
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  manifestSourceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
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
  manifestReviewSafeArea: {
    width: "100%",
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  manifestPromptOverlay: {
    justifyContent: "flex-start",
  },
  manifestReview: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  manifestSummary: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  manifestSummaryCell: {
    flex: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  manifestReviewActions: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.two,
    backgroundColor: "transparent",
  },
  promptAction: {
    flex: 1,
  },
  itemImportSurface: {
    borderWidth: 1,
    boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
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
