import { createAudioPlayer } from 'expo-audio';

import type { FileStorePort } from '@/storage/file-store';
import type { LibrarySignal } from '@/storage/library-types';

import { resolveSignal } from './resolve';

/** Resolves and plays a single signal once, end to end — the "does this
 * actually work" check the Library screen offers for any signal, bundled or
 * added by the user. Reuses resolveSignal so a broken/unreachable source
 * fails exactly the way a real script run would. */
export async function previewSignal(item: LibrarySignal, fileStore: FileStorePort): Promise<void> {
  const source = await resolveSignal(item, fileStore);
  const player = createAudioPlayer(source);
  try {
    await player.seekTo(0);
    player.play();
    await new Promise<void>((resolve) => {
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          subscription.remove();
          resolve();
        }
      });
    });
  } finally {
    player.remove();
  }
}
