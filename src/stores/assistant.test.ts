import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { parseLocalCommand } from '@/simulation/commands'
import { useSimulationStore } from './simulation'
import { useAssistantStore } from './assistant'

describe('助手异步请求生命周期', () => {
  let pinia: ReturnType<typeof createPinia>
  beforeEach(() => { vi.useFakeTimers(); pinia = createPinia(); setActivePinia(pinia) })
  afterEach(() => { disposePinia(pinia); vi.useRealTimers(); vi.unstubAllGlobals() })
  function delayedProxy() {
    const ai = useAssistantStore()
    Object.assign(ai.config, { provider: 'proxy', enabled: true, baseUrl: 'http://127.0.0.1:8787/parse', apiKey: '', model: 'test-model' })
    let respond!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => new Promise<Response>(resolve => { respond = resolve })))
    return { ai, respond: (body: object) => respond(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) }
  }

  it('普通仿真 tick 不会取消待解析请求，有效结果只提交一次', async () => {
    const sim = useSimulationStore(), { ai, respond } = delayedProxy()
    await sim.start()
    const request = ai.request('坐下')
    vi.advanceTimersByTime(1000)
    expect(ai.busy).toBe('parsing')
    respond({ commands: parseLocalCommand('坐下', 'quadruped') }); await request
    expect(ai.busy).toBeNull(); expect(ai.history).toHaveLength(1)
    vi.advanceTimersByTime(100)
    expect(sim.current.action).toBe('sit')
  })

  it('切机取消待解析请求，旧结果不能给新机型执行', async () => {
    const sim = useSimulationStore(), { ai, respond } = delayedProxy()
    await sim.start()
    const request = ai.request('坐下')
    sim.select('humanoid')
    expect(ai.busy).toBeNull()
    respond({ commands: parseLocalCommand('坐下', 'quadruped') }); await request
    expect(ai.history).toHaveLength(0); expect(sim.current.action).toBe('stand')
  })

  it('取消后的连接测试结果不能覆盖更新的反馈', async () => {
    const { ai, respond } = delayedProxy()
    const request = ai.request()
    ai.cancel()
    ai.config.enabled = false
    await ai.request('打开舱门')
    const feedback = ai.feedback
    respond({ ok: true }); await request
    expect(ai.feedback).toBe(feedback)
    expect(ai.feedback).toContain('未识别')
  })
})
