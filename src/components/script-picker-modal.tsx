import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { Icon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LibraryScript } from '@/storage/library-types';

type ScriptPickerModalProps = {
  visible: boolean;
  title: string;
  eyebrow?: string;
  accentColor?: string;
  scripts: LibraryScript[];
  selectedId: string | null;
  onSelect: (scriptId: string | null) => void;
  onClose: () => void;
  emptyLabel?: string;
  emptyHint?: string;
  onPreview?: (script: LibraryScript) => void;
  previewingId?: string | null;
  onManageLibrary?: () => void;
};

function sourceLabel(script: LibraryScript): string {
  const origin = script.manifestUrl ? 'extension' : script.source.type;
  return script.source.type === 'url' && !script.savedOffline ? `${origin} · not saved offline` : origin;
}

/** Bottom sheet for choosing one phase's script: a radio list with a ▶ preview
 * per script, a "skip this phase" option, and a way into the Library. */
export function ScriptPickerModal({
  visible,
  title,
  eyebrow,
  accentColor,
  scripts,
  selectedId,
  onSelect,
  onClose,
  emptyLabel = 'Empty',
  emptyHint,
  onPreview,
  previewingId,
  onManageLibrary,
}: ScriptPickerModalProps) {
  const theme = useTheme();
  const accent = accentColor ?? theme.tint;

  const choose = (scriptId: string | null) => {
    onSelect(scriptId);
    onClose();
  };

  const radio = (selected: boolean) => (
    <View
      style={[
        styles.radio,
        selected ? { backgroundColor: accent, borderColor: accent } : { borderColor: theme.textMuted },
      ]}>
      {selected && <Icon name="check" color={theme.sheet} size={12} />}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close script picker" />
        <View style={[styles.sheet, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <View style={styles.header}>
              <View style={styles.titles}>
                {eyebrow ? (
                  <ThemedText type="eyebrow" style={{ color: accent }}>
                    {eyebrow}
                  </ThemedText>
                ) : null}
                <ThemedText type="display">{title}</ThemedText>
              </View>
              <IconButton label="Close" onPress={onClose}>
                <Icon name="close" color={theme.text} size={18} />
              </IconButton>
            </View>

            <ScrollView contentContainerStyle={styles.list} style={styles.scroll}>
              <Pressable
                onPress={() => choose(null)}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedId === null }}
                style={({ pressed }) => [
                  styles.option,
                  styles.emptyOption,
                  { borderColor: selectedId === null ? accent : theme.border },
                  pressed && styles.pressed,
                ]}>
                {radio(selectedId === null)}
                <View style={styles.optionText}>
                  <ThemedText themeColor={selectedId === null ? 'text' : 'textSecondary'}>{emptyLabel}</ThemedText>
                  {emptyHint ? (
                    <ThemedText type="eyebrow" themeColor="textMuted">
                      {emptyHint}
                    </ThemedText>
                  ) : null}
                </View>
              </Pressable>

              {scripts.map((script) => {
                const selected = script.id === selectedId;
                // Select area and preview button are siblings — nested
                // Pressable buttons render <button> inside <button> on web.
                return (
                  <View
                    key={script.id}
                    style={[
                      styles.option,
                      selected
                        ? { borderColor: accent, backgroundColor: withAlpha(accent, 0.14) }
                        : { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                    ]}>
                    <Pressable
                      onPress={() => choose(script.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [styles.optionPick, pressed && styles.pressed]}>
                      {radio(selected)}
                      <View style={styles.optionText}>
                        <ThemedText type={selected ? 'defaultSemiBold' : 'default'} numberOfLines={1}>
                          {script.name}
                        </ThemedText>
                        <ThemedText type="eyebrow" themeColor="textSecondary">
                          {sourceLabel(script)}
                        </ThemedText>
                      </View>
                    </Pressable>
                    {onPreview && (
                      <IconButton
                        label={`Preview ${script.name}`}
                        tone={selected ? 'tinted' : 'soft'}
                        color={accent}
                        onPress={() => onPreview(script)}
                        loading={previewingId === script.id}
                        disabled={previewingId != null && previewingId !== script.id}>
                        <Icon name="play" color={selected ? accent : theme.text} size={14} />
                      </IconButton>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            {onManageLibrary && (
              <Pressable
                onPress={onManageLibrary}
                accessibilityRole="button"
                style={({ pressed }) => [styles.manage, pressed && styles.pressed]}>
                <ThemedText type="defaultSemiBold" themeColor="tint">
                  Manage library
                </ThemedText>
                <Icon name="chevron-right" color={theme.tint} size={14} />
              </Pressable>
            )}
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(5,6,15,0.55)',
  },
  sheet: {
    maxHeight: '84%',
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: 1,
  },
  safeArea: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 14,
    flexShrink: 1,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titles: {
    flexShrink: 1,
    gap: 2,
  },
  scroll: {
    flexGrow: 0,
  },
  list: {
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
    borderRadius: Radius.row,
    borderWidth: 1,
  },
  optionPick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 48,
  },
  emptyOption: {
    borderStyle: 'dashed',
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
  manage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
  },
});
