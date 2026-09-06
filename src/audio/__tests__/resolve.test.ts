import { parseScript } from '@/engine';
import { SOUNDS } from '@/lib/sounds';
import { InMemoryFileStore } from '@/storage/testing/in-memory-file-store';
import type { LibrarySignal } from '@/storage/library-types';

import { collectSignalNames, firstSignalName, resolveSignal, resolveSignalMap } from '../resolve';

const bundledChime: LibrarySignal = {
  id: 'bundled-chime',
  kind: 'signal',
  name: 'chime',
  source: { type: 'bundled', assetId: 'chime' },
  savedOffline: true,
  addedAt: 0,
};

describe('resolveSignal', () => {
  it('returns the bundled asset source directly for a bundled signal', async () => {
    const store = new InMemoryFileStore();
    expect(await resolveSignal(bundledChime, store)).toBe(SOUNDS.chime.source);
    expect(store.downloads).toHaveLength(0);
  });

  it('throws a readable error for an unknown bundled asset id', async () => {
    const item: LibrarySignal = { ...bundledChime, source: { type: 'bundled', assetId: 'nope' } };
    await expect(resolveSignal(item, new InMemoryFileStore())).rejects.toThrow(/Unknown bundled signal/);
  });

  it('downloads and returns a local uri for a url-sourced signal', async () => {
    const store = new InMemoryFileStore();
    const item: LibrarySignal = {
      id: 'url-waves',
      kind: 'signal',
      name: 'waves',
      source: { type: 'url', url: 'https://x.test/waves.mp3' },
      savedOffline: false,
      addedAt: 0,
    };

    const source = await resolveSignal(item, store);

    expect(source).toEqual({ uri: 'file://cache/signals/url-waves.mp3' });
    expect(store.downloads).toHaveLength(1);
  });
});

describe('collectSignalNames', () => {
  it('finds a play statement at every nesting level', () => {
    const script = parseScript(`
name: Test
body:
  - play: a
  - repeat: 2
    body:
      - play: b
  - with: { gain: 0.5 }
    body:
      - play: c
  - if: { rem: true }
    then:
      - play: d
    else:
      - play: e
`);
    expect(collectSignalNames(script)).toEqual(new Set(['a', 'b', 'c', 'd', 'e']));
  });

  it('deduplicates repeated monikers', () => {
    const script = parseScript('name: Test\nbody:\n  - play: chime\n  - play: chime\n');
    expect(collectSignalNames(script)).toEqual(new Set(['chime']));
  });
});

describe('firstSignalName', () => {
  it('finds the first play statement in execution order, skipping into repeat/with/if', () => {
    const script = parseScript(`
name: Test
body:
  - log: "start"
  - repeat: 2
    body:
      - play: b
  - play: a
`);
    expect(firstSignalName(script)).toBe('b');
  });

  it('looks into an if statement\'s then branch before its else branch', () => {
    const script = parseScript(`
name: Test
body:
  - if: { rem: true }
    then:
      - play: d
    else:
      - play: e
`);
    expect(firstSignalName(script)).toBe('d');
  });

  it('returns undefined for a script with no play statements', () => {
    const script = parseScript('name: Test\nbody:\n  - log: "nothing to play"\n');
    expect(firstSignalName(script)).toBeUndefined();
  });
});

describe('resolveSignalMap', () => {
  it('resolves every requested moniker by matching library item name', async () => {
    const store = new InMemoryFileStore();
    const map = await resolveSignalMap(['chime'], [bundledChime], store);
    expect(map).toEqual({ chime: SOUNDS.chime.source });
  });

  it('throws naming the missing moniker when the library has no match', async () => {
    const store = new InMemoryFileStore();
    await expect(resolveSignalMap(['ghost'], [bundledChime], store)).rejects.toThrow(/"ghost"/);
  });
});
