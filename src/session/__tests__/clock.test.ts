import { RealClockPort } from '../clock';

describe('RealClockPort', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('now() reflects the current wall clock', () => {
    jest.setSystemTime(12_345);
    expect(new RealClockPort().now()).toBe(12_345);
  });

  it('sleeps in bounded slices rather than one long setTimeout, so drift is bounded', async () => {
    const clock = new RealClockPort();
    let resolved = false;
    clock.sleep(70_000, new AbortController().signal).then(() => {
      resolved = true;
    });

    // Each slice is capped at 30s (session/clock.ts's MAX_SLICE_MS) — a
    // 70s sleep needs three slices (30s, 30s, 10s), not one 70s timer.
    await jest.advanceTimersByTimeAsync(30_000);
    expect(resolved).toBe(false);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(resolved).toBe(false);
    await jest.advanceTimersByTimeAsync(9_999);
    expect(resolved).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  it('resolves as soon as the signal aborts, mid-slice', async () => {
    const clock = new RealClockPort();
    const controller = new AbortController();
    let resolved = false;
    clock.sleep(60_000, controller.signal).then(() => {
      resolved = true;
    });

    await jest.advanceTimersByTimeAsync(5_000);
    expect(resolved).toBe(false);

    controller.abort();
    await jest.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
  });

  it('resolves immediately for an already-aborted signal', async () => {
    const clock = new RealClockPort();
    const controller = new AbortController();
    controller.abort();

    let resolved = false;
    clock.sleep(10_000, controller.signal).then(() => {
      resolved = true;
    });

    await jest.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
  });
});
