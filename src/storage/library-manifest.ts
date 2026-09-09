export type LibraryManifestEntry = {
  name: string;
  url: string;
};

export type LibraryManifest = {
  url: string;
  signals: LibraryManifestEntry[];
  scripts: LibraryManifestEntry[];
};

function httpUrl(value: string, base?: string): string {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  return url.toString();
}

function entries(
  value: unknown,
  kind: "signal" | "script",
  baseUrl: string,
): LibraryManifestEntry[] {
  if (!Array.isArray(value)) {
    throw new Error(`Manifest ${kind}s must be a list.`);
  }

  const result = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error(`Manifest ${kind} ${index + 1} must be an object.`);
    }
    const { name, url } = candidate as { name?: unknown; url?: unknown };
    if (typeof name !== "string" || !name.trim()) {
      throw new Error(`Manifest ${kind} ${index + 1} needs a name.`);
    }
    if (typeof url !== "string" || !url.trim()) {
      throw new Error(`Manifest ${kind} "${name.trim()}" needs a URL.`);
    }
    return { name: name.trim(), url: httpUrl(url.trim(), baseUrl) };
  });

  const seen = new Set<string>();
  for (const entry of result) {
    if (seen.has(entry.name)) {
      throw new Error(
        `Manifest contains more than one ${kind} named "${entry.name}".`,
      );
    }
    seen.add(entry.name);
  }
  return result;
}

export function parseLibraryManifest(
  manifestUrl: string,
  value: unknown,
): LibraryManifest {
  const url = httpUrl(manifestUrl);
  if (!value || typeof value !== "object") {
    throw new Error("Manifest must be a JSON object.");
  }
  const manifest = value as {
    version?: unknown;
    baseUrl?: unknown;
    signals?: unknown;
    scripts?: unknown;
  };
  if (manifest.version !== 1) {
    throw new Error("Unsupported manifest version. Expected version 1.");
  }
  if (manifest.baseUrl !== undefined && typeof manifest.baseUrl !== "string") {
    throw new Error("Manifest baseUrl must be a URL string.");
  }
  const baseUrl = manifest.baseUrl ? httpUrl(manifest.baseUrl, url) : url;

  return {
    url,
    signals: entries(manifest.signals, "signal", baseUrl),
    scripts: entries(manifest.scripts, "script", baseUrl),
  };
}

export async function loadLibraryManifest(
  manifestUrl: string,
): Promise<LibraryManifest> {
  const url = httpUrl(manifestUrl.trim());
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load manifest (HTTP ${response.status}).`);
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("Manifest is not valid JSON.");
  }
  return parseLibraryManifest(url, value);
}
