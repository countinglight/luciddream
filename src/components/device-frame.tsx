import type { PropsWithChildren } from 'react';

/** No-op on native — device-frame previewing only makes sense on the web
 * build, where the browser window can be much wider than a phone. See
 * device-frame.web.tsx for the real implementation. */
export function DeviceFrame({ children }: PropsWithChildren) {
  return <>{children}</>;
}
