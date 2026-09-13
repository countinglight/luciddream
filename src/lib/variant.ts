/** The prototype deployment serves the same bundle as production from the
 * separate luciddream-prototype Worker. It is recognised by hostname at
 * runtime rather than by a build-time flag, so a cached prototype build can
 * never carry a "Prototype" badge into production. `?variant=prototype`
 * previews the badge locally. */
export function isPrototypeHost(hostname: string, search: string): boolean {
  return (
    hostname.startsWith("luciddream-prototype.") ||
    new URLSearchParams(search).get("variant") === "prototype"
  );
}
