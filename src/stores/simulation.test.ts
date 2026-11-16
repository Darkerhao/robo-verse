import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { useSimulationStore } from './simulation'

describe('遥测会话生命周期', () => {
  let pinia: ReturnType<typeof createPinia>
  beforeEach(() => { vi.useFakeTimers(); pinia = createPinia(); setActivePinia(pinia) })
  afterEach(() => { disposePinia(pinia); vi.useRealTimers() })

  it('长期运行保持每秒两次采样，滚动窗口保留最近一分钟', async () => {
    const sim = useSimulationStore()
    await sim.start()
    vi.advanceTimersByTime(180_000)
    expect(sim.history).toHaveLength(120)
    expect(sim.history[0]!.time).toBeGreaterThanOrEqual(sim.snapshot.time - 60)
    const lastTime = sim.history.at(-1)!.time
    vi.advanceTimersByTime(10_000)
    expect(sim.history.at(-1)!.time - lastTime).toBeCloseTo(10, 0)
  })

  it('暂停保持采样不变，重置清空数据但保留急停，停止释放定时器', async () => {
    const sim = useSimulationStore()
    await sim.start(); await sim.start()
    vi.advanceTimersByTime(2000)
    sim.send({ type: 'pause', value: true })
    const samples = JSON.stringify(sim.histories)
    vi.advanceTimersByTime(2000)
    expect(JSON.stringify(sim.histories)).toBe(samples)
    sim.send({ type: 'emergency', robot: 'quadruped' })
    sim.send({ type: 'reset' })
    expect(sim.history).toHaveLength(0)
    expect(sim.current.emergency).toBe(true)
    vi.advanceTimersByTime(100)
    expect(sim.history).toHaveLength(1)
    sim.stop()
    expect(sim.connected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
