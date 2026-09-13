/** Web build of notification.ts. Run notifications are native-only — every
 * function there already returned early on web — but merely importing
 * expo-notifications on web logs a "push token listener not supported"
 * warning at load. These no-ops keep the same API without that import. */

export const STOP_ACTION_ID = 'STOP';

export function configureNotificationHandler(): void {}

export async function ensureRunNotificationSetup(): Promise<boolean> {
  return false;
}

export async function showOrUpdateRunNotification(scriptName: string, stepText: string): Promise<void> {
  void scriptName;
  void stepText;
}

export async function dismissRunNotification(): Promise<void> {}

export function onStopAction(onStop: () => void): () => void {
  void onStop;
  return () => {};
}
