import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { isPrototypeHost } from "@/lib/variant";

/** True when the web app is served from the prototype Worker. */
export function useIsPrototype(): boolean {
  const [isPrototype, setIsPrototype] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    // Read after hydration so the static HTML (rendered with no window)
    // matches the first client render; this one setState is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPrototype(
      isPrototypeHost(window.location.hostname, window.location.search),
    );
  }, []);

  return isPrototype;
}
