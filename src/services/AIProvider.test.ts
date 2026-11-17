import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalAIProvider, ProxyAIProvider } from './AIProvider'
import { parseLocalCommand } from '@/simulation/commands'

describe('AI Provider 边界', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('本地 Provider 始终离线可用', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const provider = new LocalAIProvider()
    expect(await provider.test()).toContain('无需网络')
    expect(await provider.parse('坐下', 'quadruped')).toEqual(parseLocalCommand('坐下', 'quadruped'))
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('代理禁止直连上游，接受本机安全地址', () => {
    expect(() => new ProxyAIProvider({ baseUrl: 'https://api.openai.com/v1', apiKey: 'x', model: 'm' })).toThrow('安全后端代理')
    expect(() => new ProxyAIProvider({ baseUrl: 'http://127.0.0.1:8787/parse', apiKey: '', model: 'm' })).not.toThrow()
    expect(() => new ProxyAIProvider({ baseUrl: 'http://example.test/parse', apiKey: '', model: 'm' })).toThrow('HTTPS')
  })
  it('代理返回的动作仍必须通过本地白名单验证', async () => {
    const command = { ...parseLocalCommand('站立', 'quadruped')[0]!, action: 'openDoor' }
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ commands: [command] }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new ProxyAIProvider({ baseUrl: 'http://127.0.0.1:8787/parse', apiKey: 'session-token', model: 'robot-model' })
    await expect(provider.parse('打开舱门', 'quadruped', new AbortController().signal)).rejects.toThrow('不支持')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error' })
  })
  it('有效代理指令与测试确认可用，请求携带正确配置与取消信号', async () => {
    const commands = parseLocalCommand('向右转45度', 'quadruped')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ commands })).mockResolvedValueOnce(Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController(), provider = new ProxyAIProvider({ baseUrl: 'https://proxy.example.test/robot', apiKey: 'test-session-token', model: 'robot-model' })
    expect(await provider.parse('向右转45度', 'quadruped', controller.signal)).toEqual(commands)
    const [, options] = fetchMock.mock.calls[0]!
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer test-session-token' })
    expect(JSON.parse(String(options?.body))).toEqual({ operation: 'parse', text: '向右转45度', robotType: 'quadruped', model: 'robot-model' })
    controller.abort(); expect(options?.signal?.aborted).toBe(true)
    expect(await provider.test(new AbortController().signal)).toContain('已确认连接')
  })
  it('HTTP 失败、无效确认和非 JSON 结果均拒绝成功', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(Response.json({ ok: false })).mockResolvedValueOnce(new Response('invalid-json'))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new ProxyAIProvider({ baseUrl: 'http://127.0.0.1:8787/parse', apiKey: '', model: 'm' }), signal = new AbortController().signal
    await expect(provider.parse('站立', 'quadruped', signal)).rejects.toThrow('HTTP 503')
    await expect(provider.test(signal)).rejects.toThrow('连接确认')
    await expect(provider.parse('站立', 'quadruped', signal)).rejects.toThrow()
  })
})
