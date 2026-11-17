import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SimulationAdapter } from '@/services/SimulationAdapter'
import { createScene, type SceneState } from './createScene'

const probes = vi.hoisted(() => ({
  failEnvironment: false, render: vi.fn(), rendererDispose: vi.fn(), controlsDispose: vi.fn(), removeCanvas: vi.fn(), environmentDispose: vi.fn(), pmremDispose: vi.fn(), forceLoss: vi.fn(),
  shadows: { enabled: true, type: 0 },
}))
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three')
  class Canvas extends EventTarget {
    dataset: Record<string, string> = {}
    style = { cursor: '' }
    setAttribute() {}
    remove() { probes.removeCanvas() }
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 } }
  }
  return { ...actual, WebGLRenderer: class {
    domElement = new Canvas()
    shadowMap = probes.shadows
    info = { render: { calls: 10 }, memory: { geometries: 10, textures: 4 } }
    renderLists = { dispose: vi.fn() }
    setClearColor() {} setSize() {} setPixelRatio() {}
    render() { probes.render() }
    dispose() { probes.rendererDispose() }
    getContext() { return { isContextLost: () => false } }
    forceContextLoss() { probes.forceLoss() }
  }, PMREMGenerator: class {
    fromScene() { if (probes.failEnvironment) throw new Error('环境创建失败'); return new actual.WebGLRenderTarget(1, 1) }
    dispose() { probes.pmremDispose() }
  } }
})
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { Vector3 } = await vi.importActual<typeof import('three')>('three')
  return { OrbitControls: class extends EventTarget {
    target = new Vector3()
    update() {}
    dispose() { probes.controlsDispose() }
  } }
})
vi.mock('three/addons/environments/RoomEnvironment.js', async () => {
  const { Scene } = await vi.importActual<typeof import('three')>('three')
  return { RoomEnvironment: class extends Scene { dispose() { probes.environmentDispose() } } }
})
vi.mock('gsap', () => ({ default: { killTweensOf() {}, to(target: object, values: Record<string, unknown>) {
  for (const key of ['x', 'y', 'z']) if (key in values) Reflect.set(target, key, values[key])
} } }))

let callbacks: Map<number, FrameRequestCallback>, frameId: number, documentMock: EventTarget & { hidden: boolean }, state: SceneState
const host = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() }
function create(onError = vi.fn()) { return createScene(host as unknown as HTMLElement, () => state, vi.fn(), onError) }
function frame(now: number) {
  const pending = [...callbacks.values()]; callbacks.clear()
  pending.forEach(callback => callback(now))
}
beforeEach(() => {
  vi.clearAllMocks(); probes.failEnvironment = false; probes.render.mockReset(); probes.shadows.enabled = true
  callbacks = new Map(); frameId = 0; documentMock = Object.assign(new EventTarget(), { hidden: false })
  state = { robot: 'quadruped', robots: new SimulationAdapter().snapshot().robots, paused: false, grid: true, quality: 'high', qualityRevision: 0 }
  vi.stubGlobal('document', documentMock); vi.stubGlobal('devicePixelRatio', 1)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++frameId, callback); return frameId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
})
afterEach(() => vi.unstubAllGlobals())

describe('场景失败与渲染生命周期', () => {
  it('环境初始化失败释放所有已创建资源，随后能重新创建并幂等卸载', () => {
    probes.failEnvironment = true
    expect(() => create()).toThrow('环境创建失败')
    for (const probe of [probes.rendererDispose, probes.controlsDispose, probes.removeCanvas, probes.environmentDispose, probes.pmremDispose, probes.forceLoss]) expect(probe).toHaveBeenCalledOnce()
    expect(callbacks.size).toBe(0)
    probes.failEnvironment = false
    const scene = create(); expect(callbacks.size).toBe(1)
    scene.dispose(); scene.dispose()
    expect(probes.rendererDispose).toHaveBeenCalledTimes(2); expect(probes.removeCanvas).toHaveBeenCalledTimes(2)
    expect(callbacks.size).toBe(0)
  })

  it('页面隐藏停止循环，恢复只创建一个循环，卸载后不再响应可见性', () => {
    const scene = create()
    documentMock.hidden = true; documentMock.dispatchEvent(new Event('visibilitychange')); expect(callbacks.size).toBe(0)
    documentMock.hidden = false; documentMock.dispatchEvent(new Event('visibilitychange')); expect(callbacks.size).toBe(1)
    documentMock.dispatchEvent(new Event('visibilitychange')); expect(callbacks.size).toBe(1)
    scene.dispose(); documentMock.dispatchEvent(new Event('visibilitychange')); expect(callbacks.size).toBe(0)
  })

  it('渲染失败中断循环并反馈，可见性变化不能重新触发失败循环', () => {
    const onError = vi.fn(), scene = create(onError)
    probes.render.mockImplementationOnce(() => { throw new Error('GPU 错误') })
    frame(performance.now() + 17)
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('GPU 错误'))
    expect(callbacks.size).toBe(0)
    documentMock.dispatchEvent(new Event('visibilitychange')); expect(callbacks.size).toBe(0)
    scene.dispose()
  })

  it('持续低帧率降低特效，同档重新应用会恢复质量与采样', () => {
    const scene = create(), start = performance.now()
    for (let i = 1; i <= 40; i++) frame(start + i * 200)
    expect(probes.shadows.enabled).toBe(false)
    state.qualityRevision = 1; frame(start + 8200)
    expect(probes.shadows.enabled).toBe(true)
    scene.dispose()
  })
})
