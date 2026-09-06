/** Keep demo activation explicit so ordinary production URLs never expose
 * testing controls. Additional demo types can be added without changing the
 * meaning of `?demo=lock`. */
export function isLockDemo(search: string, configuredDemo?: string): boolean {
  return new URLSearchParams(search).get('demo') === 'lock' || configuredDemo === 'lock';
}
