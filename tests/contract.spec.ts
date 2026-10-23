/**
 * Wire contract tests.
 *
 * The host manifest and the browser contribution must point at the same
 * descriptors, and the report schema must accept exactly what the detector
 * produces. Anything looser would let the two halves drift at boot.
 */
import { describe, expect, it } from 'vitest'
import { DSH_LIGHTHOUSE_INVOCATIONS, sessionIdSchema } from '../src/contract.ts'
import { TYPERT_MANIFEST } from '../src/typert.ts'
import { LighthouseReportSchema } from '../src/schema.ts'
import { DSH_LIGHTHOUSE_REMOTE } from '../src/client/remote.ts'
import { scanSample } from './sample.ts'

describe('wire contract', () => {
  it('declares one direct scan invocation', () => {
    expect(DSH_LIGHTHOUSE_INVOCATIONS).toHaveLength(1)
    const descriptor = DSH_LIGHTHOUSE_INVOCATIONS[0]!
    expect(descriptor).toMatchObject({
      id: 'dsh-lighthouse#lighthouse/scan',
      service: 'lighthouse',
      namespace: 'lighthouse',
      method: 'scan',
      invocation: { kind: 'direct' },
      cancellation: { parameter: 'signal' },
    })
    expect(descriptor.parameters).toHaveLength(1)
    expect(descriptor.parameters[0]).toMatchObject({
      name: 'sessionId',
      wire: 'sessionId',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-lighthouse#SessionId' },
    })
    expect(descriptor.result).toMatchObject({
      mode: 'strict',
      typeSymbol: 'dsh-lighthouse#LighthouseReport',
    })
  })

  it('shares the very same descriptor array with the host and the browser', () => {
    expect(TYPERT_MANIFEST.invocations).toBe(DSH_LIGHTHOUSE_INVOCATIONS)
    expect(DSH_LIGHTHOUSE_REMOTE.descriptors).toBe(DSH_LIGHTHOUSE_INVOCATIONS)
    expect(DSH_LIGHTHOUSE_REMOTE.package).toBe('dsh-lighthouse')
  })

  it('describes the same service in the host manifest', () => {
    expect(TYPERT_MANIFEST.package).toBe('dsh-lighthouse')
    expect(TYPERT_MANIFEST.face).toBe('host')
    const service = TYPERT_MANIFEST.model.services[0]!
    expect(service.key).toBe('lighthouse')
    expect(service.exportName).toBe('LighthouseRuntime')
    expect(service.members).toEqual([
      { kind: 'method', name: 'scan', signature: 'scan(sessionId: string, signal?: AbortSignal): Promise<LighthouseReport>' },
    ])
  })

  it('trims and bounds the session id', () => {
    expect(sessionIdSchema.parse('  session-01h  ')).toBe('session-01h')
    expect(sessionIdSchema.safeParse('').success).toBe(false)
    expect(sessionIdSchema.safeParse('   ').success).toBe(false)
    expect(sessionIdSchema.safeParse('x'.repeat(201)).success).toBe(false)
  })

  it('accepts a complete report from the detector', () => {
    const report = scanSample()
    expect(LighthouseReportSchema.parse(report)).toEqual(report)
  })

  it('rejects unknown rules and impossible counters', () => {
    const report = scanSample()
    const finding = report.findings[0]!
    const unknownRule = {
      ...report,
      findings: [{ ...finding, rule: 'made-up-rule' }],
    }
    const negative = {
      ...report,
      counts: { ...report.counts, findings: -1 },
    }
    expect(LighthouseReportSchema.safeParse(unknownRule).success).toBe(false)
    expect(LighthouseReportSchema.safeParse(negative).success).toBe(false)
  })
})
