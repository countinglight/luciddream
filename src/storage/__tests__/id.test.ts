import { extensionFromUrl, idForFile, idForUrl } from '../id';

describe('idForUrl', () => {
  it('is deterministic for the same URL', () => {
    expect(idForUrl('https://x.test/a.mp3')).toBe(idForUrl('https://x.test/a.mp3'));
  });

  it('differs for different URLs', () => {
    expect(idForUrl('https://x.test/a.mp3')).not.toBe(idForUrl('https://x.test/b.mp3'));
  });

  it('is a filesystem-safe string', () => {
    expect(idForUrl('https://x.test/a.mp3?x=1&y=2')).toMatch(/^url-[0-9a-f]+$/);
  });
});

describe('idForFile', () => {
  it('produces filesystem-safe ids', () => {
    expect(idForFile()).toMatch(/^file-[0-9a-f]+$/);
  });
});

describe('extensionFromUrl', () => {
  it('extracts a lowercase extension', () => {
    expect(extensionFromUrl('https://x.test/a.MP3', 'audio')).toBe('mp3');
  });

  it('ignores a query string or fragment', () => {
    expect(extensionFromUrl('https://x.test/a.mp3?x=1', 'audio')).toBe('mp3');
    expect(extensionFromUrl('https://x.test/a.mp3#frag', 'audio')).toBe('mp3');
  });

  it('falls back when there is no extension', () => {
    expect(extensionFromUrl('https://x.test/script', 'yaml')).toBe('yaml');
  });
});
