import {
  ensureResolved,
  importExternalFile,
  isSavedOffline,
  removeOfflineCopy,
  saveOffline,
} from '../library-content';
import { InMemoryFileStore } from '../testing/in-memory-file-store';

describe('ensureResolved (url source)', () => {
  it('downloads to cache on first resolution', async () => {
    const store = new InMemoryFileStore();
    const result = await ensureResolved('signals', 'sig1', { type: 'url', url: 'https://x.test/a.mp3' }, store, 'audio');

    expect(result).toEqual({ root: 'cache', path: 'signals/sig1.mp3' });
    expect(store.downloads).toEqual([{ url: 'https://x.test/a.mp3', root: 'cache', path: 'signals/sig1.mp3' }]);
  });

  it('does not re-download on a second resolution', async () => {
    const store = new InMemoryFileStore();
    const source = { type: 'url' as const, url: 'https://x.test/a.mp3' };

    await ensureResolved('signals', 'sig1', source, store, 'audio');
    await ensureResolved('signals', 'sig1', source, store, 'audio');

    expect(store.downloads).toHaveLength(1);
  });

  it('prefers a saved-offline (document root) copy over the cache', async () => {
    const store = new InMemoryFileStore();
    await store.writeText('document', 'signals/sig1.mp3', 'saved-copy');
    await store.writeText('cache', 'signals/sig1.mp3', 'stale-cache-copy');

    const result = await ensureResolved('signals', 'sig1', { type: 'url', url: 'https://x.test/a.mp3' }, store, 'audio');

    expect(result).toEqual({ root: 'document', path: 'signals/sig1.mp3' });
    expect(store.downloads).toHaveLength(0);
  });

  it('falls back to the default extension when the URL has none', async () => {
    const store = new InMemoryFileStore();
    const result = await ensureResolved('scripts', 'scr1', { type: 'url', url: 'https://x.test/script' }, store, 'yaml');
    expect(result).toEqual({ root: 'cache', path: 'scripts/scr1.yaml' });
  });
});

describe('ensureResolved (file source)', () => {
  it('resolves directly to the stored path, with no filesystem access', async () => {
    const store = new InMemoryFileStore();
    const result = await ensureResolved('signals', 'sig1', { type: 'file', path: 'signals/sig1.mp3' }, store, 'audio');
    expect(result).toEqual({ root: 'document', path: 'signals/sig1.mp3' });
    expect(store.downloads).toHaveLength(0);
  });
});

describe('saveOffline', () => {
  it('promotes a cached copy to document storage without re-downloading', async () => {
    const store = new InMemoryFileStore();
    const source = { type: 'url' as const, url: 'https://x.test/a.mp3' };
    await ensureResolved('signals', 'sig1', source, store, 'audio'); // populates the cache

    await saveOffline('signals', 'sig1', source, store, 'audio');

    expect(await store.exists('document', 'signals/sig1.mp3')).toBe(true);
    expect(store.downloads).toHaveLength(1); // only the original cache download
  });

  it('downloads straight to document storage when nothing was cached yet', async () => {
    const store = new InMemoryFileStore();
    const source = { type: 'url' as const, url: 'https://x.test/a.mp3' };

    await saveOffline('signals', 'sig1', source, store, 'audio');

    expect(await store.exists('document', 'signals/sig1.mp3')).toBe(true);
    expect(store.downloads).toEqual([{ url: source.url, root: 'document', path: 'signals/sig1.mp3' }]);
  });

  it('is a no-op for an already-saved item', async () => {
    const store = new InMemoryFileStore();
    const source = { type: 'url' as const, url: 'https://x.test/a.mp3' };
    await saveOffline('signals', 'sig1', source, store, 'audio');

    await saveOffline('signals', 'sig1', source, store, 'audio');

    expect(store.downloads).toHaveLength(1);
  });

  it('is a no-op for a file source', async () => {
    const store = new InMemoryFileStore();
    await saveOffline('signals', 'sig1', { type: 'file', path: 'signals/sig1.mp3' }, store, 'audio');
    expect(store.downloads).toHaveLength(0);
  });
});

describe('removeOfflineCopy / isSavedOffline', () => {
  it('deletes only the document copy, leaving the cache alone', async () => {
    const store = new InMemoryFileStore();
    const source = { type: 'url' as const, url: 'https://x.test/a.mp3' };
    await ensureResolved('signals', 'sig1', source, store, 'audio');
    await saveOffline('signals', 'sig1', source, store, 'audio');

    await removeOfflineCopy('signals', 'sig1', source, store, 'audio');

    expect(await isSavedOffline('signals', 'sig1', source, store, 'audio')).toBe(false);
    expect(await store.exists('cache', 'signals/sig1.mp3')).toBe(true);
  });

  it('treats a file source as always saved offline', async () => {
    const store = new InMemoryFileStore();
    expect(await isSavedOffline('signals', 'sig1', { type: 'file', path: 'signals/sig1.mp3' }, store, 'audio')).toBe(true);
  });
});

describe('importExternalFile', () => {
  it('copies the external file into document storage under the given id', async () => {
    const store = new InMemoryFileStore();
    const result = await importExternalFile('scripts', 'file-abc', 'content://picker/1', store, 'yaml');

    expect(result).toEqual({ type: 'file', path: 'scripts/file-abc.yaml' });
    expect(await store.exists('document', 'scripts/file-abc.yaml')).toBe(true);
  });
});
