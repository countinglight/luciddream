import { InMemoryFileStore } from '@/storage/testing/in-memory-file-store';

import { JsonlLogPort, logPathFor } from '../jsonl-log-port';

describe('JsonlLogPort', () => {
  it('writes one JSON line per event, in order', async () => {
    const store = new InMemoryFileStore();
    const port = new JsonlLogPort('run-1', store);

    port.log({ type: 'run.start', at: 0, scriptName: 'Test' });
    port.log({ type: 'play', at: 10, signal: 'chime', gain: 1, rate: 1, wait: false });
    port.log({ type: 'run.stop', at: 20, reason: 'completed' });

    // log() fires writes asynchronously — wait for the write queue to drain.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const content = await store.readText('document', logPathFor('run-1'));
    const lines = content.trim().split('\n').map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { type: 'run.start', at: 0, scriptName: 'Test' },
      { type: 'play', at: 10, signal: 'chime', gain: 1, rate: 1, wait: false },
      { type: 'run.stop', at: 20, reason: 'completed' },
    ]);
  });

  it('never throws even if the underlying file store rejects', () => {
    const store = new InMemoryFileStore();
    jest.spyOn(store, 'writeText').mockRejectedValue(new Error('disk full'));
    const port = new JsonlLogPort('run-1', store);

    expect(() => port.log({ type: 'run.start', at: 0, scriptName: 'Test' })).not.toThrow();
  });

  it('writes settle in event order even if an earlier write resolves late', async () => {
    const store = new InMemoryFileStore();
    let resolveFirst!: () => void;
    const originalWrite = store.writeText.bind(store);
    let callCount = 0;
    jest.spyOn(store, 'writeText').mockImplementation(async (root, path, content) => {
      callCount += 1;
      if (callCount === 1) {
        await new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return originalWrite(root, path, content);
    });

    const port = new JsonlLogPort('run-2', store);
    port.log({ type: 'run.start', at: 0, scriptName: 'Test' });
    port.log({ type: 'run.stop', at: 5, reason: 'completed' });

    // Let the mocked writeText actually get invoked (and assign
    // resolveFirst) before we resolve it — flushing microtasks with
    // Promise.resolve() alone isn't enough given the extra hop through
    // flush()'s own `await ensureDir()`.
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveFirst();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const content = await store.readText('document', logPathFor('run-2'));
    expect(content.trim().split('\n')).toHaveLength(2);
  });
});
