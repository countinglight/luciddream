import { useEffect, useState } from "react";

import { getFileStore } from "@/runtime/services";
import { logPathFor } from "@/logging/jsonl-log-port";
import type { RunRecord } from "@/logging/records";
import { parseLogText } from "@/lib/nights";

/** Reads a run's JSONL log. `refreshKey` re-reads it — the Morning screen
 * passes the run status so the final events written at stop are included. */
export function useRunEvents(runId: string | null, refreshKey?: unknown) {
  const [state, setState] = useState<{
    events: RunRecord[] | null;
    error: string | null;
  }>({
    events: null,
    error: null,
  });

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    getFileStore()
      .readText("document", logPathFor(runId))
      .then((text) => {
        if (!cancelled) setState({ events: parseLogText(text), error: null });
      })
      .catch((err) => {
        if (!cancelled)
          setState({
            events: null,
            error: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [runId, refreshKey]);

  return state;
}
