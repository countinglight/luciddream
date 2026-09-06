type Listener = (status: { didJustFinish: boolean }) => void;

class FakePlayer {
  volume = 1;
  rate = 1;
  playCalls = 0;
  pauseCalls = 0;
  playing = false;
  seekCalls: number[] = [];
  removed = false;
  private listeners: Listener[] = [];

  setPlaybackRate(rate: number) {
    this.rate = rate;
  }

  async seekTo(seconds: number) {
    this.seekCalls.push(seconds);
  }

  play() {
    this.playCalls++;
    this.playing = true;
  }

  pause() {
    this.pauseCalls++;
    this.playing = false;
  }

  addListener(_event: string, listener: Listener) {
    this.listeners.push(listener);
    return {
      remove: () =>
        (this.listeners = this.listeners.filter((l) => l !== listener)),
    };
  }

  remove() {
    this.removed = true;
  }

  /** Test helper: simulate expo-audio reporting playback finished. */
  emitFinished() {
    this.playing = false;
    for (const listener of this.listeners) listener({ didJustFinish: true });
  }
}

const mockCreateAudioPlayer = jest.fn();

jest.mock("expo-audio", () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
}));

// Imported after the mock so the module under test picks up the mocked
// `createAudioPlayer` rather than the real native binding.
// eslint-disable-next-line import/first
import { ExpoAudioPort } from "../expo-audio-port";

describe("ExpoAudioPort", () => {
  beforeEach(() => {
    mockCreateAudioPlayer.mockReset();
  });

  it("creates a player from the resolved source, applies gain/rate, and plays from the start", async () => {
    const player = new FakePlayer();
    mockCreateAudioPlayer.mockReturnValue(player);
    const port = new ExpoAudioPort({ chime: 42 });

    await port.play("chime", { gain: 0.6, rate: 1.2 });

    expect(mockCreateAudioPlayer).toHaveBeenCalledWith(42);
    expect(player.volume).toBe(0.6);
    expect(player.rate).toBe(1.2);
    expect(player.seekCalls).toEqual([0]);
    expect(player.playCalls).toBe(1);
  });

  it("reuses the same player across repeated plays of the same signal", async () => {
    mockCreateAudioPlayer.mockReturnValue(new FakePlayer());
    const port = new ExpoAudioPort({ chime: 42 });

    await port.play("chime", { gain: 1, rate: 1 });
    await port.play("chime", { gain: 1, rate: 1 });

    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it("resolves the handle once playback reports didJustFinish", async () => {
    const player = new FakePlayer();
    mockCreateAudioPlayer.mockReturnValue(player);
    const port = new ExpoAudioPort({ chime: 42 });

    const handle = await port.play("chime", { gain: 1, rate: 1 });
    let finished = false;
    handle.finished.then(() => {
      finished = true;
    });

    await Promise.resolve();
    expect(finished).toBe(false);

    player.emitFinished();
    await handle.finished;
    expect(finished).toBe(true);
  });

  it("throws a readable error for a signal that was not resolved", async () => {
    const port = new ExpoAudioPort({});
    await expect(port.play("ghost", { gain: 1, rate: 1 })).rejects.toThrow(
      /"ghost"/,
    );
  });

  it("release() removes every created player once its last play has finished", async () => {
    const player = new FakePlayer();
    mockCreateAudioPlayer.mockReturnValue(player);
    const port = new ExpoAudioPort({ chime: 42 });
    await port.play("chime", { gain: 1, rate: 1 });

    const released = port.release();
    await Promise.resolve();
    expect(player.removed).toBe(false); // still playing — not removed yet

    player.emitFinished();
    await released;

    expect(player.removed).toBe(true);
  });

  it("duck() pauses currently-playing signals and attenuates future plays", async () => {
    const player = new FakePlayer();
    mockCreateAudioPlayer.mockReturnValue(player);
    const port = new ExpoAudioPort({ chime: 42 });
    await port.play("chime", { gain: 1, rate: 1 });

    port.duck(0.1);

    expect(player.pauseCalls).toBe(1);
    expect(player.playing).toBe(false);

    await port.play("chime", { gain: 0.5, rate: 1 });
    expect(player.volume).toBeCloseTo(0.05);
  });

  it("undoDuck() resumes only the signal duck() actually paused mid-playback", async () => {
    const chimePlayer = new FakePlayer();
    const bellPlayer = new FakePlayer();
    mockCreateAudioPlayer
      .mockReturnValueOnce(chimePlayer)
      .mockReturnValueOnce(bellPlayer);
    const port = new ExpoAudioPort({ chime: 1, bell: 2 });

    await port.play("chime", { gain: 1, rate: 1 });
    await port.play("bell", { gain: 1, rate: 1 });
    bellPlayer.emitFinished(); // bell already finished on its own before duck()

    port.duck(0.1);
    expect(chimePlayer.pauseCalls).toBe(1);
    expect(bellPlayer.pauseCalls).toBe(0); // wasn't playing — nothing to pause

    port.undoDuck();
    expect(chimePlayer.playCalls).toBe(2); // resumed
    expect(bellPlayer.playCalls).toBe(1); // left alone

    await port.play("chime", { gain: 0.5, rate: 1 });
    expect(chimePlayer.volume).toBeCloseTo(0.5); // full gain restored
  });
});
