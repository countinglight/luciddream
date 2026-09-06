import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadLibraryItems, removeItem, saveLibraryItems, upsertItem } from '../library-store';
import type { LibraryItem, LibrarySignal } from '../library-types';

const sample: LibrarySignal = {
  id: 'url-abc123',
  kind: 'signal',
  name: 'Ocean waves',
  source: { type: 'url', url: 'https://x.test/waves.mp3' },
  savedOffline: false,
  addedAt: 1000,
};

describe('library persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns an empty list when nothing has been saved yet', async () => {
    expect(await loadLibraryItems()).toEqual([]);
  });

  it('round-trips saved items', async () => {
    await saveLibraryItems([sample]);
    expect(await loadLibraryItems()).toEqual([sample]);
  });

  it('falls back to an empty list if storage holds corrupt JSON', async () => {
    await AsyncStorage.setItem('luciddream.library.v1', 'not-json');
    expect(await loadLibraryItems()).toEqual([]);
  });

  it('falls back to an empty list if storage holds something other than a list', async () => {
    await AsyncStorage.setItem('luciddream.library.v1', JSON.stringify({ not: 'a list' }));
    expect(await loadLibraryItems()).toEqual([]);
  });
});

describe('upsertItem', () => {
  it('appends a new item', () => {
    expect(upsertItem([], sample)).toEqual([sample]);
  });

  it('replaces an existing item with the same id', () => {
    const updated: LibraryItem = { ...sample, savedOffline: true };
    expect(upsertItem([sample], updated)).toEqual([updated]);
  });

  it('leaves other items untouched', () => {
    const other: LibrarySignal = { ...sample, id: 'url-other', name: 'Other' };
    const updated: LibraryItem = { ...sample, savedOffline: true };
    expect(upsertItem([sample, other], updated)).toEqual([updated, other]);
  });
});

describe('removeItem', () => {
  it('removes the item with the matching id', () => {
    expect(removeItem([sample], sample.id)).toEqual([]);
  });

  it('leaves the list untouched if the id is not present', () => {
    expect(removeItem([sample], 'nonexistent')).toEqual([sample]);
  });
});
