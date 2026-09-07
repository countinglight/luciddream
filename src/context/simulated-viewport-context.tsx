import { createContext, useContext, type PropsWithChildren } from 'react';
import { useWindowDimensions } from 'react-native';

type ViewportSize = { width: number; height: number };

/** Set (web-only, by DeviceFrame) when the user has picked a phone preset to
 * preview the app at, instead of the real browser window size. */
const SimulatedViewportContext = createContext<ViewportSize | null>(null);

export function SimulatedViewportProvider({
  value,
  children,
}: PropsWithChildren<{ value: ViewportSize | null }>) {
  return (
    <SimulatedViewportContext.Provider value={value}>
      {children}
    </SimulatedViewportContext.Provider>
  );
}

/** Like `useWindowDimensions`, but honors a simulated phone-size preview on
 * web when one is active. Native platforms always get the real dimensions. */
export function useViewportSize(): ViewportSize {
  const simulated = useContext(SimulatedViewportContext);
  const real = useWindowDimensions();
  return simulated ?? real;
}
