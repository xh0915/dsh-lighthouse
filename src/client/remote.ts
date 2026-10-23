/**
 * dsh-lighthouse — Client Remote contribution and typed namespace face.
 *
 * `TypertRemoteNamespace$6c69676874686f757365` is the hex encoding of the
 * service key "lighthouse" (l=6c i=69 g=67 h=68 t=74 h=68 o=6f u=75 s=73 e=65).
 * Keep this name and the TypertRemoteMap keys in sync with the `id`s in
 * contract.ts.
 */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { LighthouseReport } from '../schema.ts'
import { DSH_LIGHTHOUSE_INVOCATIONS } from '../contract.ts'

/** Client contribution for the lighthouse Remote. */
export const DSH_LIGHTHOUSE_REMOTE: TypertRemoteContribution = { package: 'dsh-lighthouse', descriptors: DSH_LIGHTHOUSE_INVOCATIONS }

declare module '@deepseek-ai/dsh-typert-protocol' {
  /** The mounted lighthouse namespace face. */
  interface TypertRemoteNamespace$6c69676874686f757365 {
    scan: (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<LighthouseReport>>
  }
  interface TypertRemoteMap {
    'lighthouse/scan': TypertRemoteNamespace$6c69676874686f757365['scan']
  }
  interface TypertRemoteNamespaceMap { lighthouse: TypertRemoteNamespace$6c69676874686f757365 }
}
