/**
 * dsh-lighthouse — Host Remote service.
 *
 * `lighthouse.scan(sessionId)` reads one real session log through the harness
 * session-query service and reports the actions that are hard to undo. It never
 * runs a command, blocks a tool, or writes anything: it is a read-only second
 * pass over the log the session already produced.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionLogSnapshot } from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-session-query'
import { sessionIdSchema } from './contract.ts'
import { scanSession, type RawEvent, type RawHeader } from './detect.ts'
import type { LighthouseReport } from './schema.ts'
import type { ResolvedConfig } from './types.ts'

/** Failure codes this service can forward from the query engine. */
const NOT_FOUND = 'SESSION_QUERY_SESSION_NOT_FOUND'
const ABORTED = 'SESSION_QUERY_ABORTED'
const CORRUPT = 'SESSION_QUERY_CORRUPT_SESSION'
const INVALID_SURFACE = 'SESSION_QUERY_INVALID_SURFACE'
const PERSISTENCE = 'SESSION_QUERY_PERSISTENCE_FAILED'

/** Map a query-engine failure onto copy the view can show honestly. */
function lighthouseFailure(reason: unknown): Error {
  const code = (reason as { code?: unknown }).code
  if (typeof code === 'string') {
    if (code === NOT_FOUND) return new Error('LIGHTHOUSE_NO_LOG|')
    if (code === ABORTED) return new Error('LIGHTHOUSE_ABORTED|')
    if (code === CORRUPT || code === INVALID_SURFACE) return new Error('LIGHTHOUSE_BAD_LOG|')
    if (code === PERSISTENCE) return new Error('LIGHTHOUSE_UNREADABLE|')
  }
  return reason instanceof Error ? reason : new Error(String(reason))
}

/** Host-side service backing the `lighthouse` Remote namespace. */
export class LighthouseRuntime extends TypertRemoteService {
  /** @param ctx - owning Cordis context. @param config - resolved plugin config. */
  constructor(ctx: Context, private readonly config: ResolvedConfig) { super(ctx, 'lighthouse') }

  /**
   * Scan the session log of `sessionId` for hard-to-undo actions.
   * @param sessionId - the session the view is currently showing.
   * @param signal - transport cancellation from the browser.
   * @returns the redacted, evidence-backed report.
   */
  @Remote
  async scan(sessionId: string, signal?: AbortSignal): Promise<LighthouseReport> {
    const id = sessionIdSchema.parse(sessionId)
    let snapshot: SessionLogSnapshot
    try {
      snapshot = await this.ctx.sessionQuery.readSession(id as unknown as SessionId)
    } catch (reason) {
      throw lighthouseFailure(reason)
    }
    if (signal?.aborted) throw new Error('LIGHTHOUSE_ABORTED|')

    const header = snapshot.session as unknown as RawHeader
    const createdAt = Number.isFinite(header.createdAt) ? header.createdAt : Date.now()
    return scanSession(
      { id: String(header.id), createdAt, cwd: header.cwd, agentPreset: header.agentPreset },
      snapshot.events as unknown as RawEvent[],
      {
        redactSecrets: this.config.redactSecrets,
        maxFindings: this.config.maxFindings,
        platform: process.platform,
        now: Date.now(),
      },
    )
  }
}
