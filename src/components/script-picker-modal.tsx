import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LibraryScript } from '@/storage/library-types';

type ScriptPickerModalProps = {
  visible: boolean;
  title: string;
  scripts: LibraryScript[];
  selectedId: string | null;
  onSelect: (scriptId: string | null) => void;
  onClose: () => void;
};

/** Bottom-sheet picker for a phase's script — keeps the Home screen's phase
 * rows to one line each instead of an inline chip list per phase, which is
 * what forced 4+ lines per phase (and a forced scroll past Start) on narrow
 * phones. */
export function ScriptPickerModal({
  visible,
  title,
  scripts,
  selectedId,
  onSelect,
  onClose,
}: ScriptPickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView type="backgroundElement" style={styles.sheet}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <ScrollView contentContainerStyle={styles.chipRow} style={styles.chipScroll}>
            <Chip
              label="Empty"
              selected={selectedId === null}
              onPress={() => {
                onSelect(null);
                onClose();
              }}
            />
            {scripts.map((script) => (
              <Chip
                key={script.id}
                label={script.name}
                selected={script.id === selectedId}
                onPress={() => {
                  onSelect(script.id);
                  onClose();
                }}
              />
            ))}
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    maxHeight: '70%',
  },
  chipScroll: {
    flexGrow: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
