import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadRunIndex, removeRun, saveRunIndex, upsertRun, type RunSummary } from '../run-index';

const sample: RunSummary = {
  id: 'run-1',
  scriptName: 'MILD with REM targeting',
  startedAt: 1000,
  eventCount: 3,
};

describe('run index persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns an empty list when nothing has been saved yet', async () => {
    expect(await loadRunIndex()).toEqual([]);
  });

  it('round-trips saved runs', async () => {
    await saveRunIndex([sample]);
    expect(await loadRunIndex()).toEqual([sample]);
  });

  it('falls back to an empty list if storage holds corrupt JSON', async () => {
    await AsyncStorage.setItem('luciddream.runs.v1', 'not-json');
    expect(await loadRunIndex()).toEqual([]);
  });

  it('falls back to an empty list if storage holds something other than a list', async () => {
    await AsyncStorage.setItem('luciddream.runs.v1', JSON.stringify({ not: 'a list' }));
    expect(await loadRunIndex()).toEqual([]);
  });
});

describe('upsertRun', () => {
  it('appends a new run', () => {
    expect(upsertRun([], sample)).toEqual([sample]);
  });

  it('replaces an existing run with the same id — how a run in progress gets its endedAt filled in', () => {
    const finished: RunSummary = { ...sample, endedAt: 2000, reason: 'completed' };
    expect(upsertRun([sample], finished)).toEqual([finished]);
  });

  it('leaves other runs untouched', () => {
    const other: RunSummary = { ...sample, id: 'run-2' };
    const finished: RunSummary = { ...sample, endedAt: 2000, reason: 'completed' };
    expect(upsertRun([sample, other], finished)).toEqual([finished, other]);
  });
});

describe('removeRun', () => {
  it('removes the run with the matching id', () => {
    expect(removeRun([sample], sample.id)).toEqual([]);
  });

  it('leaves the list untouched if the id is not present', () => {
    expect(removeRun([sample], 'nonexistent')).toEqual([sample]);
  });
});
