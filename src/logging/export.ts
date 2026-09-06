import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { FileStorePort } from '@/storage/file-store';

import { logPathFor } from './jsonl-log-port';

/** Shares a run's JSONL log via the device share sheet (spec §2.3: "share
 * the log file out via the device share sheet"). Native only — sharing
 * isn't a v1 distribution target for web (spec §1), so this is a best-effort
 * fallback there rather than a fully supported path. */
export async function shareRunLog(runId: string, fileStore: FileStorePort): Promise<void> {
  const path = logPathFor(runId);

  if (Platform.OS === 'web') {
    const text = await fileStore.readText('document', path);
    const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string }) => Promise<void> };
    if (nav.share) {
      await nav.share({ title: `${runId}.jsonl`, text });
      return;
    }
    throw new Error('Sharing is not supported in this browser.');
  }

  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(fileStore.uriFor('document', path));
}
