/**
 * dsh-lighthouse — Host Typert manifest for the lighthouse Remote.
 *
 * Reflection metadata only (the registry contributes no prompt, tool, or session
 * event). Keep `invocations` pointing at contract.ts, which the client half shares.
 */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { DSH_LIGHTHOUSE_INVOCATIONS } from './contract.ts'

/** Host manifest for the lighthouse Remote. */
export const TYPERT_MANIFEST: TypertContribution = {
  package: 'dsh-lighthouse', face: 'host', schemas: [],
  model: {
    services: [{
      key: 'lighthouse', exportName: 'LighthouseRuntime',
      description: 'Read one session log and report the actions that are hard to undo, with their blast radius and a safer move.',
      tags: [], members: [
        { kind: 'method', name: 'scan', signature: 'scan(sessionId: string, signal?: AbortSignal): Promise<LighthouseReport>' },
      ], types: [],
    }], events: [], objects: [],
  },
  invocations: DSH_LIGHTHOUSE_INVOCATIONS,
}
