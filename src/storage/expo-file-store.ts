import { Directory, File, Paths } from 'expo-file-system';

import { FileRoot, FileStoreError, FileStorePort } from './file-store';

function rootDirectory(root: FileRoot): Directory {
  return root === 'cache' ? Paths.cache : Paths.document;
}

/** Splits a "a/b/c.txt" path into its directory segments and file name, so
 * callers can address files with a plain forward-slash-joined path without
 * knowing anything about expo-file-system's Directory/File constructors. */
function splitPath(path: string): { dirSegments: string[]; fileName: string } {
  const segments = path.split('/').filter(Boolean);
  const fileName = segments.pop();
  if (!fileName) throw new FileStoreError(`Invalid file path: "${path}"`);
  return { dirSegments: segments, fileName };
}

function toFile(root: FileRoot, path: string): File {
  const { dirSegments, fileName } = splitPath(path);
  return new File(rootDirectory(root), ...dirSegments, fileName);
}

function toDirectory(root: FileRoot, path: string): Directory {
  const segments = path.split('/').filter(Boolean);
  return new Directory(rootDirectory(root), ...segments);
}

function parentDirSegments(path: string): string[] {
  return splitPath(path).dirSegments;
}

/** The real FileStorePort, backed by expo-file-system's File/Directory API
 * (SDK 54+). Kept thin and adapter-only — see storage/__tests__ for the
 * mocked-module tests, and audio/resolve.ts for the actual resolution logic
 * that's tested against an in-memory fake instead of this class. */
export class ExpoFileSystemStore implements FileStorePort {
  async exists(root: FileRoot, path: string): Promise<boolean> {
    return toFile(root, path).exists;
  }

  async ensureDir(root: FileRoot, path: string): Promise<void> {
    const dir = toDirectory(root, path);
    if (!dir.exists) {
      dir.create({ intermediates: true });
    }
  }

  async writeText(root: FileRoot, path: string, content: string): Promise<void> {
    await this.ensureDir(root, parentDirSegments(path).join('/'));
    const file = toFile(root, path);
    if (!file.exists) file.create({ overwrite: true });
    file.write(content);
  }

  async readText(root: FileRoot, path: string): Promise<string> {
    return toFile(root, path).text();
  }

  async downloadTo(url: string, root: FileRoot, path: string): Promise<void> {
    await this.ensureDir(root, parentDirSegments(path).join('/'));
    const destination = toFile(root, path);
    if (destination.exists) destination.delete();
    await File.downloadFileAsync(url, destination);
  }

  async copy(from: { root: FileRoot; path: string }, to: { root: FileRoot; path: string }): Promise<void> {
    await this.ensureDir(to.root, parentDirSegments(to.path).join('/'));
    const source = toFile(from.root, from.path);
    const destination = toFile(to.root, to.path);
    if (destination.exists) destination.delete();
    await source.copy(destination);
  }

  async copyExternal(sourceUri: string, to: { root: FileRoot; path: string }): Promise<void> {
    await this.ensureDir(to.root, parentDirSegments(to.path).join('/'));
    const source = new File(sourceUri);
    const destination = toFile(to.root, to.path);
    if (destination.exists) destination.delete();
    await source.copy(destination);
  }

  async deleteFile(root: FileRoot, path: string): Promise<void> {
    const file = toFile(root, path);
    if (file.exists) file.delete();
  }

  uriFor(root: FileRoot, path: string): string {
    return toFile(root, path).uri;
  }
}
