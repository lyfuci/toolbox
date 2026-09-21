/**
 * Pure helpers for the JSON tool's tree view: JSONPath construction and what
 * a node's "copy" action puts on the clipboard. Split out of the page so the
 * rules stay unit-testable without rendering the tree.
 */

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue }

/**
 * Build a normalized JSONPath identifying a node: `$['foo'][0]['bar']`.
 * This matches what jsonpath-plus returns with `resultType: 'path'`, so
 * filter matches and tree rows agree on one spelling.
 */
export function buildPath(parent: string, segment: string | number): string {
  if (typeof segment === 'number') return `${parent}[${segment}]`
  // Escape backslashes and single quotes for the bracket-notation key.
  return `${parent}['${segment.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`
}

/**
 * Convert the verbose bracket form to a human-friendly dot path where keys are
 * valid JS identifiers: `$['foo'][0]['bar']` → `$.foo[0].bar`. Keys that need
 * quoting (dots, dashes, spaces) keep the bracket form.
 */
export function toFriendlyPath(p: string): string {
  return p.replace(/\['([A-Za-z_$][A-Za-z0-9_$]*)'\]/g, '.$1')
}

/**
 * What clicking a node's VALUE copies.
 *
 * Objects and arrays copy as pretty-printed JSON — the subtree, ready to paste
 * into another tool. A string copies its *content*, without the JSON quotes
 * and escapes: someone clicking `"T_GEO_SZ_DISTRICT.441521"` wants the id, not
 * a quoted literal to strip by hand. Numbers, booleans and null copy as they
 * read in the tree.
 */
export function valueToClipboardText(value: JsonValue, indent = 2): string {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object') return String(value)
  return JSON.stringify(value, null, indent)
}

/** True when the node is an object or array — i.e. it has children. */
export function isContainer(value: JsonValue): boolean {
  return typeof value === 'object' && value !== null
}
