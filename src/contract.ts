/**
 * dsh-lighthouse — Shared strict Typert wire contract.
 *
 * One InvocationDescriptor per Remote method, pointed at by BOTH the host
 * manifest (typert.ts) and the client contribution (client/remote.ts), so the
 * two halves can never drift.
 */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import { LighthouseReportSchema } from './schema.ts'

/** Wire codec for the target session id. */
export const sessionIdSchema = z.string().trim().min(1).max(200)

const parameter = (name: string, wire: string, typeSymbol: string, schema: z.ZodType) => ({
  name, wire, source: 'json' as const, codec: { mode: 'strict' as const, typeSymbol, schema },
})

const result = (typeSymbol: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol, schema })

const sessionIdParameter = parameter('sessionId', 'sessionId', 'dsh-lighthouse#SessionId', sessionIdSchema)

/** Strict Typert descriptors shared by the host and browser halves. */
export const DSH_LIGHTHOUSE_INVOCATIONS: readonly InvocationDescriptor[] = [
  {
    id: 'dsh-lighthouse#lighthouse/scan', service: 'lighthouse', namespace: 'lighthouse', method: 'scan', invocation: { kind: 'direct' },
    parameters: [sessionIdParameter], cancellation: { parameter: 'signal' },
    result: result('dsh-lighthouse#LighthouseReport', LighthouseReportSchema),
  },
]
