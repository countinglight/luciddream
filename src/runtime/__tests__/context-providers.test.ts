import { ManualContextProvider, ScriptedContextProvider } from '../context-providers';

describe('ManualContextProvider', () => {
  it('returns an empty snapshot until values are set', async () => {
    const provider = new ManualContextProvider();
    const snapshot = await provider.snapshot();
    expect(snapshot.hr).toBeUndefined();
    expect(snapshot.rem).toBeUndefined();
  });

  it('reflects whatever was last set', async () => {
    const provider = new ManualContextProvider();
    provider.set({ rem: true, hr: 55 });
    expect(await provider.snapshot()).toMatchObject({ rem: true, hr: 55 });

    provider.set({ hrv: 60 });
    const second = await provider.snapshot();
    expect(second.hrv).toBe(60);
    expect(second.rem).toBeUndefined(); // set() replaces, it doesn't merge
  });
});

describe('ScriptedContextProvider', () => {
  it('has no values before the first timeline entry', async () => {
    let now = 1000;
    const provider = new ScriptedContextProvider(() => now);
    const snapshot = await provider.snapshot();
    expect(snapshot.rem).toBeUndefined();
  });

  it('applies the entry whose offset has passed, latest wins', async () => {
    let now = 1000;
    const provider = new ScriptedContextProvider(() => now);
    provider.at(0, { rem: false }).at(5000, { rem: true, hr: 55 });

    expect((await provider.snapshot()).rem).toBe(false);

    now = 1000 + 5000;
    expect(await provider.snapshot()).toMatchObject({ rem: true, hr: 55 });
  });

  it('accepts entries added out of order', async () => {
    let now = 1000;
    const provider = new ScriptedContextProvider(() => now);
    provider.at(10_000, { hrv: 10 }).at(0, { hrv: 1 }).at(5_000, { hrv: 5 });

    now = 1000 + 5_000;
    expect((await provider.snapshot()).hrv).toBe(5);
  });
});
