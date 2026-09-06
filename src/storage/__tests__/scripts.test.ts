import { BUNDLED_SCRIPT_TEXT } from '../bundled-scripts';
import { resolveScriptText } from '../scripts';
import { InMemoryFileStore } from '../testing/in-memory-file-store';
import type { LibraryScript } from '../library-types';

describe('resolveScriptText', () => {
  it('returns bundled text directly, with no filesystem access', async () => {
    const store = new InMemoryFileStore();
    const item: LibraryScript = {
      id: 'bundled-01-single-beep',
      kind: 'script',
      name: 'Single Beep',
      source: { type: 'bundled', assetId: '01-single-beep' },
      savedOffline: true,
      addedAt: 0,
    };

    expect(await resolveScriptText(item, store)).toBe(BUNDLED_SCRIPT_TEXT['01-single-beep']);
    expect(store.downloads).toHaveLength(0);
  });

  it('throws a readable error for an unknown bundled asset id', async () => {
    const item: LibraryScript = {
      id: 'bundled-nope',
      kind: 'script',
      name: 'Nope',
      source: { type: 'bundled', assetId: 'nope' },
      savedOffline: true,
      addedAt: 0,
    };
    await expect(resolveScriptText(item, new InMemoryFileStore())).rejects.toThrow(/Unknown bundled script/);
  });

  it('downloads and reads a url-sourced script', async () => {
    const store = new InMemoryFileStore();
    const url = 'https://x.test/my-script.yaml';
    const item: LibraryScript = {
      id: 'url-abc',
      kind: 'script',
      name: 'My Script',
      source: { type: 'url', url },
      savedOffline: false,
      addedAt: 0,
    };

    const text = await resolveScriptText(item, store);

    expect(text).toBe(`content-of(${url})`);
    expect(store.downloads).toEqual([{ url, root: 'cache', path: 'scripts/url-abc.yaml' }]);
  });
});
