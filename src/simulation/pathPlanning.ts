import { Box3, Ray, Vector3 } from 'three'
import { objectBounds, trainingBounds, type Bounds, type EnvironmentObject } from '@/config/perception'
import type { Vector3Tuple } from '@/types/robot'

const cellSize = .25
const distance = (a: Vector3Tuple, b: Vector3Tuple) => Math.hypot(a[0] - b[0], a[2] - b[2])

function collisionBoxes(objects: EnvironmentObject[], zones: Bounds[], clearance: number) {
  return [...objects.filter(object => object.category !== 'ground').map(objectBounds), ...zones].map(bounds => new Box3(
    new Vector3(bounds.min[0] - clearance, -10, bounds.min[2] - clearance),
    new Vector3(bounds.max[0] + clearance, 10, bounds.max[2] + clearance),
  ))
}

function freeSegment(a: Vector3Tuple, b: Vector3Tuple, boxes: Box3[], clearance: number) {
  const inside = (point: Vector3Tuple) => point.every(Number.isFinite) && point[0] >= trainingBounds.min[0] + clearance && point[0] <= trainingBounds.max[0] - clearance && point[2] >= trainingBounds.min[2] + clearance && point[2] <= trainingBounds.max[2] - clearance
  if (!inside(a) || !inside(b)) return false
  const origin = new Vector3(a[0], 0, a[2]), target = new Vector3(b[0], 0, b[2])
  const length = origin.distanceTo(target), ray = new Ray(origin, target.clone().sub(origin).normalize()), hit = new Vector3()
  return !boxes.some(box => box.containsPoint(origin) || box.containsPoint(target) || (length > 0 && ray.intersectBox(box, hit) !== null && origin.distanceTo(hit) <= length + 1e-8))
}

/** 路段与膨胀后的实体相交测试；规划、执行与移动障碍物使用同一安全边界。 */
export function isSegmentFree(a: Vector3Tuple, b: Vector3Tuple, objects: EnvironmentObject[], zones: Bounds[], clearance: number) {
  return freeSegment(a, b, collisionBoxes(objects, zones, clearance), clearance)
}

/** 八邻域 A*，对角线同样检查碰撞；视线简化保留每段的真实安全间距。 */
export function planPath(start: Vector3Tuple, goal: Vector3Tuple, objects: EnvironmentObject[], zones: Bounds[], clearance: number): Vector3Tuple[] {
  const boxes = collisionBoxes(objects, zones, clearance)
  const free = (a: Vector3Tuple, b: Vector3Tuple) => freeSegment(a, b, boxes, clearance)
  if (!free(start, start) || !free(goal, goal)) return []
  if (free(start, goal)) return [[...start], [...goal]]
  const width = Math.round((trainingBounds.max[0] - trainingBounds.min[0]) / cellSize) + 1
  const height = Math.round((trainingBounds.max[2] - trainingBounds.min[2]) / cellSize) + 1
  const point = (index: number): Vector3Tuple => [trainingBounds.min[0] + (index % width) * cellSize, 0, trainingBounds.min[2] + Math.floor(index / width) * cellSize]
  const index = (value: Vector3Tuple) => Math.round((value[2] - trainingBounds.min[2]) / cellSize) * width + Math.round((value[0] - trainingBounds.min[0]) / cellSize)
  const first = index(start), last = index(goal)
  if (!free(start, point(first)) || !free(point(last), goal)) return []
  const scores = new Float64Array(width * height).fill(Infinity), priorities = new Float64Array(width * height).fill(Infinity)
  const parents = new Int32Array(width * height).fill(-1), closed = new Set<number>(), open = new Set([first])
  scores[first] = 0; priorities[first] = distance(start, goal)
  const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]
  while (open.size) {
    let current = -1, best = Infinity
    for (const candidate of open) if (priorities[candidate]! < best) { current = candidate; best = priorities[candidate]! }
    if (current === last) {
      const cells: Vector3Tuple[] = []
      for (let cursor = last; cursor !== -1; cursor = parents[cursor]!) cells.unshift(point(cursor))
      const raw = [[...start] as Vector3Tuple, ...cells, [...goal] as Vector3Tuple].filter((value, i, values) => i === 0 || distance(value, values[i - 1]!) > 1e-8)
      const path = [raw[0]!]
      for (let i = 0; i < raw.length - 1;) {
        let next = raw.length - 1
        while (next > i + 1 && !free(raw[i]!, raw[next]!)) next--
        path.push(raw[next]!); i = next
      }
      return path
    }
    open.delete(current); closed.add(current)
    const x = current % width, z = Math.floor(current / width), from = point(current)
    for (const [dx, dz] of neighbors) {
      const nx = x + dx!, nz = z + dz!, neighbor = nz * width + nx
      if (nx < 0 || nx >= width || nz < 0 || nz >= height || closed.has(neighbor)) continue
      const to = point(neighbor)
      if (!free(from, to)) continue
      const score = scores[current]! + distance(from, to)
      if (score >= scores[neighbor]!) continue
      parents[neighbor] = current; scores[neighbor] = score; priorities[neighbor] = score + distance(to, goal); open.add(neighbor)
    }
  }
  return []
}

export const pathLength = (path: Vector3Tuple[]) => path.slice(1).reduce((sum, point, i) => sum + distance(path[i]!, point), 0)
