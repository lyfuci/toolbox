/**
 * Pure JWT input helpers, split out of the page so they stay unit-testable
 * without pulling in jose / CodeMirror.
 */

/**
 * Strip a leading `Bearer ` (and an optional `Authorization:`) prefix that comes
 * along when a token is copied straight from an HTTP Authorization header, so the
 * pasted value decodes as a bare JWT. Case-insensitive; a no-op otherwise.
 */
export function stripBearerPrefix(input: string): string {
  return input.replace(/^\s*(?:authorization\s*:\s*)?bearer\s+/i, '')
}
