import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LibraryItem } from './library-types';

const STORAGE_KEY = 'luciddream.library.v1';

/** Persisted metadata only — the actual signal/script content lives in the
 * file store (library-content.ts). Bundled items aren't persisted here at
 * all; they're synthesized at read time from the app's static registries
 * (see src/audio and the bundled example scripts) and merged in by callers. */
export async function loadLibraryItems(): Promise<LibraryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt or unavailable storage shouldn't crash the app — start empty,
    // matching src/lib/settings.ts's fallback behavior.
    return [];
  }
}

export async function saveLibraryItems(items: LibraryItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function upsertItem(items: LibraryItem[], item: LibraryItem): LibraryItem[] {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  const next = items.slice();
  next[index] = item;
  return next;
}

export function removeItem(items: LibraryItem[], id: string): LibraryItem[] {
  return items.filter((item) => item.id !== id);
}
