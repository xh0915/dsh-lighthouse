/**
 * dsh-lighthouse — Host plugin entry.
 *
 * The Node half: declares the validated Config, starts the LighthouseRuntime
 * Remote over the harness session-query service, and registers the Typert
 * manifest. It reads one session's log and keeps everything else untouched.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { LighthouseRuntime } from './runtime.ts'
import { TYPERT_MANIFEST } from './typert.ts'
import type { ResolvedConfig } from './types.ts'

/** Cordis plugin name. Must match package.json `name` and cordis.patch.yml. */
export const name = 'dsh-lighthouse'
/** Services required before the Remote can read a session. */
export const inject = ['typert', 'sessionQuery']

/** Plugin configuration, validated and defaulted by the schema below. */
export interface Config {
  /** Rewrite secret-shaped spans before anything crosses to the browser. */
  redactSecrets?: boolean
  /** Maximum findings kept; the rest is omitted and reported as truncated. */
  maxFindings?: number
}

/** Configuration schema with defaults. Users override keys in cordis.patch.yml. */
export const Config = z.object({
  redactSecrets: z.boolean().default(true),
  maxFindings: z.natural().min(5).max(200).default(50),
})

/** Start the host Remote and register the Typert manifest. */
export function apply(ctx: Context, config?: Config): void {
  const resolved = Config(config ?? {}) as ResolvedConfig
  new LighthouseRuntime(ctx, resolved)
  ctx.effect(() => {
    const dispose = ctx.typert.register(TYPERT_MANIFEST)
    return () => { void dispose() }
  }, 'dsh-lighthouse: typert manifest')
}
