import fs from 'node:fs';
import path from 'node:path';

import { BUNDLED_SCRIPT_TEXT } from '../bundled-scripts';

/** Guards against the one duplication this codebase deliberately carries —
 * see the comment atop bundled-scripts.ts for why it exists. If someone
 * edits assets/scripts/*.yaml without updating the matching constant here
 * (or vice versa), this fails immediately instead of drifting silently
 * until a real device shows stale bundled content. */
describe('BUNDLED_SCRIPT_TEXT stays in sync with assets/scripts/*.yaml', () => {
  const examplesDir = path.join(__dirname, '..', '..', '..', 'assets', 'scripts');

  it.each(Object.keys(BUNDLED_SCRIPT_TEXT))('%s.yaml matches the constant exactly', (id) => {
    const onDisk = fs.readFileSync(path.join(examplesDir, `${id}.yaml`), 'utf8');
    expect(BUNDLED_SCRIPT_TEXT[id]).toBe(onDisk);
  });

  it('has no constants left over for files that no longer exist', () => {
    const filesOnDisk = fs.readdirSync(examplesDir).map((f) => f.replace(/\.yaml$/, ''));
    expect(Object.keys(BUNDLED_SCRIPT_TEXT).sort()).toEqual(filesOnDisk.sort());
  });
});
