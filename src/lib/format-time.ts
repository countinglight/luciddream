const pad2 = (value: number) => String(value).padStart(2, "0");

/** The big live readout: m:ss under an hour so it visibly ticks at the start
 * of a night, h:mm after that. `unit` labels which one is showing. */
export function formatClock(ms: number): { value: string; unit: string } {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours === 0)
    return { value: `${minutes}:${pad2(seconds)}`, unit: "min : sec" };
  return { value: `${hours}:${pad2(minutes)}`, unit: "hr : min" };
}

/** Person-facing duration ("7h 42m", "12m", "40s"). The engine's
 * `formatDuration` stays the exact form for logs and scripts. */
export function formatHuman(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${pad2(minutes)}m`;
}

export function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)}h ${pad2(minutes % 60)}m ago`;
}

export function formatTimeOfDay(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatNightLabel(date: Date): string {
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatLongDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function greetingFor(hour: number): string {
  if (hour < 4) return "Hello, night owl";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
