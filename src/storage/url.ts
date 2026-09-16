/**
 * The one rule for every address the Library fetches from: HTTPS only.
 *
 * Plain HTTP let a script or signal be replaced in transit. A replaced script
 * cannot run code, but it can play loud cues all night, and a phone or a web
 * build behaved differently depending on whether the platform blocked
 * cleartext itself (architectural review AR-14). Everything LucidDream
 * publishes is already served over HTTPS; this makes that the requirement.
 */
export function requireHttpsUrl(value: string, base?: string): string {
  let url: URL;
  try {
    url = new URL(value.trim(), base);
  } catch {
    throw new Error(`That is not a web address: ${value}`);
  }
  if (url.protocol !== "https:") {
    throw new Error(
      "Only secure addresses are supported. Use an address starting with https://",
    );
  }
  return url.toString();
}
