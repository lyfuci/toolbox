import { describe, it, expect } from 'vitest'
import {
  findLayerById,
  findLayerPath,
  getLayerAtPath,
  insertAtPath,
  isGroup,
  removeLayerById,
  walkLayers,
} from '../layer-tree'
import type { Layer, GroupLayer, AnnotationLayer } from '../types'

function ann(id: string, name = id): AnnotationLayer {
  return {
    id,
    name,
    visible: true,
    opacity: 100,
    blend: 'normal',
    kind: 'annotation',
    shape: { kind: 'rect', x: 0, y: 0, w: 10, h: 10, color: '#000', strokeWidth: 1 },
  }
}

function group(id: string, children: Layer[]): GroupLayer {
  return {
    id,
    name: id,
    visible: true,
    opacity: 100,
    blend: 'normal',
    kind: 'group',
    children,
    expanded: true,
  }
}

describe('layer-tree', () => {
  describe('isGroup', () => {
    it('distinguishes groups from annotations', () => {
      expect(isGroup(ann('a'))).toBe(false)
      expect(isGroup(group('g', []))).toBe(true)
    })
  })

  describe('walkLayers', () => {
    it('emits every layer including nested', () => {
      const tree: Layer[] = [
        ann('a'),
        group('g1', [ann('b'), group('g2', [ann('c')])]),
      ]
      const ids = [...walkLayers(tree)].map((l) => l.id)
      expect(ids).toEqual(['a', 'g1', 'b', 'g2', 'c'])
    })
  })

  describe('findLayerById', () => {
    it('returns nested layer', () => {
      const tree: Layer[] = [group('g', [ann('inner')])]
      expect(findLayerById(tree, 'inner')?.id).toBe('inner')
    })
    it('returns null when missing', () => {
      expect(findLayerById([ann('a')], 'b')).toBeNull()
    })
  })

  describe('findLayerPath + getLayerAtPath round-trip', () => {
    it('matches the same layer', () => {
      const tree: Layer[] = [ann('a'), group('g', [ann('b'), ann('c')])]
      const path = findLayerPath(tree, 'c')
      expect(path).toEqual([1, 1])
      expect(getLayerAtPath(tree, path!)?.id).toBe('c')
    })
  })

  describe('removeLayerById', () => {
    it('removes top-level layer', () => {
      const tree: Layer[] = [ann('a'), ann('b')]
      expect(removeLayerById(tree, 'a').map((l) => l.id)).toEqual(['b'])
    })
    it('removes nested layer, leaves group intact', () => {
      const tree: Layer[] = [group('g', [ann('a'), ann('b')])]
      const next = removeLayerById(tree, 'a')
      const g = next[0] as GroupLayer
      expect(g.children.map((c) => c.id)).toEqual(['b'])
    })
  })

  describe('insertAtPath', () => {
    it('inserts at top level', () => {
      const tree: Layer[] = [ann('a'), ann('c')]
      const next = insertAtPath(tree, [1], ann('b'))
      expect(next.map((l) => l.id)).toEqual(['a', 'b', 'c'])
    })
    it('inserts inside a group', () => {
      const tree: Layer[] = [group('g', [ann('a')])]
      const next = insertAtPath(tree, [0, 1], ann('b'))
      const g = next[0] as GroupLayer
      expect(g.children.map((c) => c.id)).toEqual(['a', 'b'])
    })
  })
})
