import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Layered on top of expo-audio's own Android foreground-service
 * notification (see keep-alive-track.ts) purely for rich, updatable content:
 * the current step and a Stop action (spec §4.4). This is best-effort — expo-
 * notifications doesn't guarantee a "true, non-dismissable Android foreground
 * service" the way a bespoke native service would; verify swipe-dismiss
 * behavior against a real device during the spec §4.7 manual overnight
 * checklist rather than assuming it here. */
const CHANNEL_ID = 'luciddream-run';
const NOTIFICATION_ID = 'luciddream-run-status';
const CATEGORY_ID = 'run-controls';
export const STOP_ACTION_ID = 'STOP';

/** Requests notification permission and (re)registers the channel/category.
 * Returns false if permission was denied — callers should keep running
 * without a notification rather than fail the whole session over it. */
export async function ensureRunNotificationSetup(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Run status',
      importance: Notifications.AndroidImportance.HIGH,
      sound: null,
    });
  }

  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    { identifier: STOP_ACTION_ID, buttonTitle: 'Stop', options: { isDestructive: true } },
  ]);

  return true;
}

/** Shows the run notification, or updates it in place — always scheduled
 * under the same `identifier`, so a second call replaces the first rather
 * than stacking a new notification per step. */
export async function showOrUpdateRunNotification(scriptName: string, stepText: string): Promise<void> {
  if (Platform.OS === 'web') return;

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: scriptName,
      body: stepText,
      sticky: true,
      autoDismiss: false,
      categoryIdentifier: CATEGORY_ID,
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}

export async function dismissRunNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
}

/** Fires `onStop` when the notification's Stop action is tapped. Returns an
 * unsubscribe function — callers must remove this listener when the session
 * ends, since expo-notifications listeners are otherwise process-lifetime. */
export function onStopAction(onStop: () => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (
      response.notification.request.identifier === NOTIFICATION_ID &&
      response.actionIdentifier === STOP_ACTION_ID
    ) {
      onStop();
    }
  });
  return () => subscription.remove();
}
