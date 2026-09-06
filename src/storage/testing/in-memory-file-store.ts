import { FileRoot, FileStorePort } from '../file-store';

function key(root: FileRoot, path: string): string {
  return `${root}:${path}`;
}

/** A FileStorePort with no real filesystem behind it — everything lives in
 * a Map. Lets resolve.ts and library-store.ts be tested exhaustively
 * without touching expo-file-system. */
export class InMemoryFileStore implements FileStorePort {
  private files = new Map<string, string>();
  /** Every download this fake was asked to make, for assertions like "did
   * we actually go to the network, or did we reuse a saved copy". */
  readonly downloads: { url: string; root: FileRoot; path: string }[] = [];

  async exists(root: FileRoot, path: string): Promise<boolean> {
    return this.files.has(key(root, path));
  }

  async ensureDir(): Promise<void> {
    // No real directories to create.
  }

  async writeText(root: FileRoot, path: string, content: string): Promise<void> {
    this.files.set(key(root, path), content);
  }

  async readText(root: FileRoot, path: string): Promise<string> {
    const content = this.files.get(key(root, path));
    if (content === undefined) throw new Error(`InMemoryFileStore: no file at ${root}:${path}`);
    return content;
  }

  async downloadTo(url: string, root: FileRoot, path: string): Promise<void> {
    this.downloads.push({ url, root, path });
    this.files.set(key(root, path), `content-of(${url})`);
  }

  async copy(from: { root: FileRoot; path: string }, to: { root: FileRoot; path: string }): Promise<void> {
    const content = await this.readText(from.root, from.path);
    this.files.set(key(to.root, to.path), content);
  }

  async copyExternal(sourceUri: string, to: { root: FileRoot; path: string }): Promise<void> {
    this.files.set(key(to.root, to.path), `content-of(${sourceUri})`);
  }

  async deleteFile(root: FileRoot, path: string): Promise<void> {
    this.files.delete(key(root, path));
  }

  uriFor(root: FileRoot, path: string): string {
    return `file://${root}/${path}`;
  }
}
