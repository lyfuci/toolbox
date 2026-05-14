import type { GroupLayer, Layer } from './types'

/**
 * Recursive helpers over a layer tree (`Layer[]` where any element may be a
 * `GroupLayer` whose `children` is itself a `Layer[]`). All helpers are pure —
 * they return new arrays/layers instead of mutating in place, so they slot
 * directly into the `history.set(...)` flow.
 */

export function isGroup(layer: Layer): layer is GroupLayer {
  return layer.kind === 'group'
}

/** Walk the entire tree, yielding each layer once (parents before children). */
export function* walkLayers(layers: Layer[]): Generator<Layer> {
  for (const l of layers) {
    yield l
    if (isGroup(l)) yield* walkLayers(l.children)
  }
}

/** Find a layer by id anywhere in the tree (DFS). Returns null if absent. */
export function findLayerById(layers: Layer[], id: string): Layer | null {
  for (const l of walkLayers(layers)) {
    if (l.id === id) return l
  }
  return null
}

/**
 * Path from the root of `layers` to the layer with `id`, as a sequence of
 * indices. The last index points at the layer itself; preceding indices
 * navigate into successive group children. Returns null when not found.
 *
 * Example: `[2, 0, 1]` ⇒ `layers[2].children[0].children[1]` (the layer is
 * the second child of the first group inside the third top-level layer).
 */
export function findLayerPath(layers: Layer[], id: string): number[] | null {
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].id === id) return [i]
    const l = layers[i]
    if (isGroup(l)) {
      const sub = findLayerPath(l.children, id)
      if (sub) return [i, ...sub]
    }
  }
  return null
}

/** Get layer at path; null if path is invalid. */
export function getLayerAtPath(layers: Layer[], path: number[]): Layer | null {
  let cur: Layer | undefined = undefined
  let list = layers
  for (let i = 0; i < path.length; i++) {
    cur = list[path[i]]
    if (!cur) return null
    if (i < path.length - 1) {
      if (!isGroup(cur)) return null
      list = cur.children
    }
  }
  return cur ?? null
}

/**
 * Apply `fn` to the layer with `id`. Returns a new tree where that one layer
 * is replaced by `fn(layer)`. If `fn` returns a Layer of a different kind
 * (e.g. patching a property), the replacement is taken verbatim; the only
 * guarantee is structural — siblings and ancestors are preserved.
 */
export function mapLayerById(
  layers: Layer[],
  id: string,
  fn: (layer: Layer) => Layer,
): Layer[] {
  return layers.map((l) => {
    if (l.id === id) return fn(l)
    if (isGroup(l)) {
      const next = mapLayerById(l.children, id, fn)
      if (next === l.children) return l
      return { ...l, children: next }
    }
    return l
  })
}

/** Remove the layer with `id` from the tree. No-op if absent. */
export function removeLayerById(layers: Layer[], id: string): Layer[] {
  let removed = false
  const result: Layer[] = []
  for (const l of layers) {
    if (l.id === id) {
      removed = true
      continue
    }
    if (isGroup(l)) {
      const next = removeLayerById(l.children, id)
      if (next !== l.children) {
        removed = true
        result.push({ ...l, children: next })
        continue
      }
    }
    result.push(l)
  }
  return removed ? result : layers
}

/**
 * Remove the layer at the given path. Returns the new tree and the removed
 * layer (or null if the path was invalid). The two-value return lets callers
 * relocate the layer (e.g. wrap in a group, or drop into another parent).
 */
export function removeAtPath(
  layers: Layer[],
  path: number[],
): { tree: Layer[]; removed: Layer | null } {
  if (path.length === 0) return { tree: layers, removed: null }
  const [head, ...rest] = path
  if (head < 0 || head >= layers.length) return { tree: layers, removed: null }
  if (rest.length === 0) {
    const removed = layers[head]
    return { tree: [...layers.slice(0, head), ...layers.slice(head + 1)], removed }
  }
  const cur = layers[head]
  if (!isGroup(cur)) return { tree: layers, removed: null }
  const sub = removeAtPath(cur.children, rest)
  if (!sub.removed) return { tree: layers, removed: null }
  const next = [...layers]
  next[head] = { ...cur, children: sub.tree }
  return { tree: next, removed: sub.removed }
}

/**
 * Insert `layer` at the given path. The last index in `path` is the insertion
 * index inside the destination list (so `[2, 0]` inserts at index 0 of the
 * third top-level layer's children, which must be a group). Out-of-range
 * insertion indices clamp to the end of the destination list.
 */
export function insertAtPath(
  layers: Layer[],
  path: number[],
  layer: Layer,
): Layer[] {
  if (path.length === 0) return layers
  const [head, ...rest] = path
  if (rest.length === 0) {
    const idx = Math.max(0, Math.min(head, layers.length))
    return [...layers.slice(0, idx), layer, ...layers.slice(idx)]
  }
  const cur = layers[head]
  if (!cur || !isGroup(cur)) return layers
  return layers.map((l, i) =>
    i === head ? { ...cur, children: insertAtPath(cur.children, rest, layer) } : l,
  )
}

/**
 * Path that points to the parent list containing `id`, plus the index in
 * that list. Returns null if `id` is not present.
 *
 * For top-level layers this returns `{ parentPath: [], index }`; for layers
 * inside a group at top index 2, it returns `{ parentPath: [2], index }`.
 */
export function parentPathOf(
  layers: Layer[],
  id: string,
): { parentPath: number[]; index: number } | null {
  const full = findLayerPath(layers, id)
  if (!full) return null
  return { parentPath: full.slice(0, -1), index: full[full.length - 1] }
}

/**
 * Deep-clone a layer (and any nested group children), regenerating every id
 * so the resulting subtree is distinct from the original — used when
 * duplicating a layer or group via the panel / Cmd+J.
 */
export function deepCloneLayerWithNewIds(layer: Layer): Layer {
  const copy = JSON.parse(JSON.stringify(layer)) as Layer
  reassignIds(copy)
  return copy
}

function reassignIds(layer: Layer): void {
  layer.id = crypto.randomUUID()
  if (isGroup(layer)) {
    for (const c of layer.children) reassignIds(c)
  }
}

/**
 * Reorder one layer in-place within its current sibling list. Direction:
 * - 'forward'  → up by one (toward the top of the stack)
 * - 'backward' → down by one
 * - 'front'    → to the top of its siblings
 * - 'back'     → to the bottom of its siblings
 *
 * The layer stays inside its current group; cross-group moves are out of
 * scope (use the panel's drag-and-drop or the Group/Ungroup menu actions).
 */
export function reorderSibling(
  layers: Layer[],
  id: string,
  direction: 'forward' | 'backward' | 'front' | 'back',
): Layer[] {
  const path = findLayerPath(layers, id)
  if (!path) return layers
  const parentPath = path.slice(0, -1)
  const idx = path[path.length - 1]
  const parentChildren = parentPath.length === 0 ? layers : (getLayerAtPath(layers, parentPath) as GroupLayer).children
  let newIdx: number
  if (direction === 'forward') newIdx = Math.min(parentChildren.length - 1, idx + 1)
  else if (direction === 'backward') newIdx = Math.max(0, idx - 1)
  else if (direction === 'front') newIdx = parentChildren.length - 1
  else newIdx = 0
  if (newIdx === idx) return layers

  // Splice out then in, then rebuild the tree along the parentPath.
  const next = [...parentChildren]
  const [moved] = next.splice(idx, 1)
  next.splice(newIdx, 0, moved)
  return replaceChildrenAtPath(layers, parentPath, next)
}

/** Replace the child list at `path` with `children`. Used by reorder + DnD. */
export function replaceChildrenAtPath(
  layers: Layer[],
  path: number[],
  children: Layer[],
): Layer[] {
  if (path.length === 0) return children
  const [head, ...rest] = path
  if (head < 0 || head >= layers.length) return layers
  const cur = layers[head]
  if (!isGroup(cur)) return layers
  return layers.map((l, i) =>
    i === head
      ? { ...cur, children: replaceChildrenAtPath(cur.children, rest, children) }
      : l,
  )
}
