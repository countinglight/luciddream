import { isLockDemo } from '../demo-mode';

describe('isLockDemo', () => {
  it('enables only the explicit lock demo value', () => {
    expect(isLockDemo('?demo=lock')).toBe(true);
    expect(isLockDemo('?other=1&demo=lock')).toBe(true);
    expect(isLockDemo('?demo=true')).toBe(false);
    expect(isLockDemo('?demo=LOCK')).toBe(false);
    expect(isLockDemo('')).toBe(false);
  });

  it('supports the local demo target without weakening URL matching', () => {
    expect(isLockDemo('', 'lock')).toBe(true);
    expect(isLockDemo('', 'true')).toBe(false);
  });
});
