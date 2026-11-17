import type { RobotId } from '@/types/robot'
import type { RobotInstruction } from '@/types/assistant'
import { parseLocalCommand, validateInstructions } from '@/simulation/commands'

export interface AIProvider { readonly name: string; parse(text: string, robot: RobotId, signal: AbortSignal): Promise<RobotInstruction[]>; test(signal: AbortSignal): Promise<string> }
export class LocalAIProvider implements AIProvider {
  readonly name = '本地规则'
  async parse(text: string, robot: RobotId) { return parseLocalCommand(text, robot) }
  async test() { return '本地解析器就绪，无需网络或 API Key。' }
}
export interface ProxyConfig { baseUrl: string; apiKey: string; model: string }
/** 代理持有上游密钥；用户输入的访问令牌只保存在当前会话内存。 */
export class ProxyAIProvider implements AIProvider {
  readonly name = '安全代理'
  constructor(private config: ProxyConfig) {
    const url = new URL(config.baseUrl)
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password || url.search || url.hash) throw new Error('代理地址需要 HTTPS（本机可 HTTP），且不能包含凭据、查询或片段。')
    if (/^(?:api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com)$/i.test(url.hostname)) throw new Error('请配置安全后端代理，不能直连上游模型服务。')
    if (!config.model.trim()) throw new Error('请填写代理配置的模型名称。')
  }
  private async request(body: object, signal: AbortSignal) {
    const response = await fetch(this.config.baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) }, body: JSON.stringify({ ...body, model: this.config.model }), signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), credentials: 'omit', redirect: 'error' })
    if (!response.ok) throw new Error(`代理请求失败（HTTP ${response.status}），可切回本地规则。`)
    return await response.json() as { ok?: boolean; commands?: unknown }
  }
  async test(signal: AbortSignal) { const result = await this.request({ operation: 'test' }, signal); if (result.ok !== true) throw new Error('代理未返回有效的连接确认。'); return '安全代理已确认连接；执行结果仍需通过本地白名单。' }
  async parse(text: string, robot: RobotId, signal: AbortSignal) { const result = await this.request({ operation: 'parse', text, robotType: robot }, signal); return validateInstructions(result.commands, robot) }
}
