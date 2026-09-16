import type { FileStorePort } from "../file-store";
import { InMemoryFileStore } from "../testing/in-memory-file-store";

/**
 * One contract, run against every FileStorePort implementation that can be
 * exercised without a device.
 *
 * The run log is the reason this exists: native appends through the
 * filesystem and web does read-modify-write over IndexedDB, and the log port
 * relies on both behaving the same way for ordering and creation
 * (architectural review A5 — "shared adapter contract tests").
 *
 * Only the in-memory fake is covered automatically. ExpoFileSystemStore needs
 * expo-file-system's native module and WebFileStore needs a real IndexedDB
 * (fake-indexeddb would be a new devDependency). Both are recorded in the
 * TODO document as uncovered, rather than claimed as tested here: this file
 * is the contract they must satisfy, not proof that they do.
 */
function describeFileStoreContract(
  name: string,
  create: () => FileStorePort,
): void {
  describe(`${name} (FileStorePort contract)`, () => {
    it("creates the file when appending to a path that does not exist", async () => {
      const store = create();
      await store.appendText("document", "logs/new.jsonl", "first\n");

      expect(await store.exists("document", "logs/new.jsonl")).toBe(true);
      expect(await store.readText("document", "logs/new.jsonl")).toBe(
        "first\n",
      );
    });

    it("appends to the end, preserving what was already there", async () => {
      const store = create();
      await store.writeText("document", "logs/run.jsonl", "one\n");
      await store.appendText("document", "logs/run.jsonl", "two\n");
      await store.appendText("document", "logs/run.jsonl", "three\n");

      expect(await store.readText("document", "logs/run.jsonl")).toBe(
        "one\ntwo\nthree\n",
      );
    });

    it("keeps sequential appends in order", async () => {
      const store = create();
      for (let i = 0; i < 20; i += 1) {
        await store.appendText("document", "logs/seq.jsonl", `${i}\n`);
      }

      const lines = (await store.readText("document", "logs/seq.jsonl"))
        .trim()
        .split("\n");
      expect(lines).toHaveLength(20);
      expect(lines[0]).toBe("0");
      expect(lines[19]).toBe("19");
    });

    it("keeps the two roots separate", async () => {
      const store = create();
      await store.appendText("document", "logs/same.jsonl", "document\n");
      await store.appendText("cache", "logs/same.jsonl", "cache\n");

      expect(await store.readText("document", "logs/same.jsonl")).toBe(
        "document\n",
      );
      expect(await store.readText("cache", "logs/same.jsonl")).toBe("cache\n");
    });

    it("writeText still replaces the whole file", async () => {
      const store = create();
      await store.appendText("document", "logs/replace.jsonl", "old\n");
      await store.writeText("document", "logs/replace.jsonl", "new\n");

      expect(await store.readText("document", "logs/replace.jsonl")).toBe(
        "new\n",
      );
    });

    it("deleting removes an appended file", async () => {
      const store = create();
      await store.appendText("document", "logs/gone.jsonl", "content\n");
      await store.deleteFile("document", "logs/gone.jsonl");

      expect(await store.exists("document", "logs/gone.jsonl")).toBe(false);
    });
  });
}

describeFileStoreContract("InMemoryFileStore", () => new InMemoryFileStore());
