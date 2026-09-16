import { InMemoryFileStore } from "@/storage/testing/in-memory-file-store";
import type { LibraryScript, LibrarySignal } from "@/storage/library-types";

import {
  prepareRun,
  RunCancelledError,
  RunPreparationError,
  type NightPlan,
} from "../prepare";

const PRESETS = { short: 5_000, medium: 20_000, long: 300_000 };

function script(id: string, name: string): LibraryScript {
  return {
    kind: "script",
    id,
    name,
    source: { type: "file", path: `scripts/${id}.yaml` },
    savedOffline: true,
    addedAt: 0,
  };
}

function signal(id: string, name: string): LibrarySignal {
  return {
    kind: "signal",
    id,
    name,
    source: { type: "file", path: `signals/${id}.wav` },
    savedOffline: true,
    addedAt: 0,
  };
}

const VALID_YAML = `name: Test
version: 1
volume: 0.5
body:
  - play: chime
`;

function planWith(
  overrides: Partial<NightPlan> = {},
  scripts: (LibraryScript | null)[] = [null, script("s1", "Early"), null],
): NightPlan {
  return {
    phases: [
      { index: 0, label: "Pre-sleep Training", script: scripts[0] },
      { index: 1, label: "Early Sleep", script: scripts[1] },
      { index: 2, label: "Wake Up", script: scripts[2] },
    ],
    masterVolume: 0.7,
    signals: [signal("g1", "chime")],
    durationPresets: PRESETS,
    ...overrides,
  };
}

function storeWith(entries: Record<string, string> = {}): InMemoryFileStore {
  const store = new InMemoryFileStore();
  store.writeText("document", "scripts/s1.yaml", VALID_YAML);
  store.writeText("document", "signals/g1.wav", "audio");
  for (const [path, content] of Object.entries(entries)) {
    store.writeText("document", path, content);
  }
  return store;
}

function neverAborted(): AbortSignal {
  return new AbortController().signal;
}

describe("prepareRun", () => {
  it("parses every phase and resolves its signals before anything is acquired", async () => {
    const prepared = await prepareRun(planWith(), storeWith(), neverAborted());

    expect(prepared.phases).toHaveLength(1);
    expect(prepared.phases[0].index).toBe(1);
    expect(prepared.phases[0].script.name).toBe("Test");
    expect(Object.keys(prepared.sourceMap)).toEqual(["chime"]);
  });

  it("applies the master volume to every phase", async () => {
    const prepared = await prepareRun(planWith(), storeWith(), neverAborted());
    expect(prepared.phases[0].script.volume).toBe(0.7);
  });

  it("names the run from all three slots, including the empty ones", async () => {
    const prepared = await prepareRun(planWith(), storeWith(), neverAborted());
    expect(prepared.name).toBe(
      "Pre-sleep Training: Empty · Early Sleep: Early · Wake Up: Empty",
    );
  });

  describe("refuses a plan the user can fix", () => {
    it("with no scripts at all", async () => {
      const plan = planWith({}, [null, null, null]);
      await expect(
        prepareRun(plan, storeWith(), neverAborted()),
      ).rejects.toThrow(RunPreparationError);
    });

    it("with a script only in the training slot", async () => {
      const plan = planWith({}, [script("s1", "Training"), null, null]);
      await expect(
        prepareRun(plan, storeWith(), neverAborted()),
      ).rejects.toThrow(/Early Sleep or Wake Up/);
    });

    it("naming the script that will not parse", async () => {
      const store = storeWith({ "scripts/s1.yaml": "body: [ { play: }" });
      await expect(
        prepareRun(planWith(), store, neverAborted()),
      ).rejects.toThrow(/"Early"/);
    });

    it("when a signal the script needs is missing from the library", async () => {
      const plan = planWith({ signals: [] });
      await expect(
        prepareRun(plan, storeWith(), neverAborted()),
      ).rejects.toThrow(/chime/);
    });
  });

  it("refuses two library signals sharing the name a script plays", async () => {
    // Matching is by name, so which file plays would otherwise depend on
    // library order — silently, and only discovered at 3am.
    const plan = planWith({
      signals: [signal("g1", "chime"), signal("g2", "chime")],
    });

    await expect(prepareRun(plan, storeWith(), neverAborted())).rejects.toThrow(
      /More than one sound/,
    );
  });

  it("allows a duplicate name the script never refers to", async () => {
    const plan = planWith({
      signals: [
        signal("g1", "chime"),
        signal("g2", "bell"),
        signal("g3", "bell"),
      ],
    });

    await expect(
      prepareRun(plan, storeWith(), neverAborted()),
    ).resolves.toBeDefined();
  });

  it("stops as soon as the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      prepareRun(planWith(), storeWith(), controller.signal),
    ).rejects.toThrow(RunCancelledError);
  });

  it("reports cancellation rather than a resolution failure when both apply", async () => {
    // Stop arriving during a slow download must read as "stopped", not as an
    // error the user is asked to act on.
    const controller = new AbortController();
    const store = storeWith();
    const original = store.readText.bind(store);
    jest.spyOn(store, "readText").mockImplementation(async (root, path) => {
      controller.abort();
      return original(root, path);
    });

    await expect(
      prepareRun(planWith(), store, controller.signal),
    ).rejects.toThrow(RunCancelledError);
  });
});
