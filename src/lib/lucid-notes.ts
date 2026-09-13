import AsyncStorage from "@react-native-async-storage/async-storage";

/** The morning-after "Did you have a lucid dream?" answer, kept per run id.
 * Stored beside the run index rather than inside the JSONL log so the log
 * stays a pure record of what the engine did. */
export type LucidAnswer = "yes" | "unsure" | "no";

export const LUCID_OPTIONS: { value: LucidAnswer; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "unsure", label: "Not sure" },
  { value: "no", label: "No" },
];

const STORAGE_KEY = "luciddream.lucid.v1";
const VALID = new Set<string>(["yes", "unsure", "no"]);

export async function loadLucidNotes(): Promise<Record<string, LucidAnswer>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, LucidAnswer] =>
        VALID.has(String(entry[1])),
      ),
    );
  } catch {
    return {};
  }
}

export async function saveLucidNote(
  runId: string,
  answer: LucidAnswer | null,
): Promise<Record<string, LucidAnswer>> {
  const next = { ...(await loadLucidNotes()) };
  if (answer) next[runId] = answer;
  else delete next[runId];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function clearLucidNotes(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
