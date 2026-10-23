/**
 * Test fixtures: a small but realistic DSH session log plus helpers.
 *
 * Every finding test builds its own log through these helpers, so the detector
 * is always fed the same event shapes the harness actually emits.
 */
import { scanSession, type RawEvent, type RawHeader, type ScanOptions } from '../src/detect.ts'
import type { LighthouseReport } from '../src/schema.ts'

export const T0 = 1_760_000_000_000

/** One `tool/call` line. */
export function toolCall(
  seq: number,
  callId: string,
  name: string,
  args: Record<string, unknown>,
  turnTime = T0 + seq * 1_000,
): RawEvent {
  return {
    type: 'tool/call',
    seq,
    time: turnTime,
    data: { name, callId, arguments: JSON.stringify(args) },
  }
}

/** One `tool/result` line answering `callId`. */
export function toolResult(
  seq: number,
  callId: string,
  options: { text?: string; failed?: boolean; errorName?: string; turnTime?: number } = {},
): RawEvent {
  const failed = options.failed === true
  return {
    type: 'tool/result',
    seq,
    time: options.turnTime ?? T0 + seq * 1_000,
    data: {
      message: {
        source: { callId },
        content: [{
          isError: failed,
          content: [{ type: 'text', text: options.text ?? (failed ? 'command failed' : 'ok') }],
        }],
      },
      ...(options.errorName === undefined ? {} : { error: { name: options.errorName } }),
    },
  }
}

/** A turn marker. */
export function turn(seq: number, index: number): RawEvent {
  return { type: 'turn/start', seq, time: T0 + seq * 1_000, data: { turn: index } }
}

/** A user prompt. */
export function prompt(seq: number, text: string): RawEvent {
  return { type: 'user/message', seq, time: T0 + seq * 1_000, data: { content: [{ type: 'text', text }] } }
}

/** A session title line. */
export function title(seq: number, text: string): RawEvent {
  return { type: 'session/title', seq, time: T0 + seq * 1_000, data: { title: text } }
}

const HEADER: RawHeader = {
  id: 'session-01hlighthouse',
  createdAt: T0,
  cwd: 'C:\\work\\project',
  agentPreset: 'default',
}

/** Run the detector on a synthetic log with sensible defaults. */
export function scan(
  events: readonly RawEvent[],
  overrides: Partial<ScanOptions> = {},
  header: Partial<RawHeader> = {},
): LighthouseReport {
  return scanSession(
    { ...HEADER, ...header },
    events,
    {
      redactSecrets: true,
      maxFindings: 50,
      platform: 'win32',
      now: T0 + 600_000,
      ...overrides,
    },
  )
}

/** One command, optionally with a result. */
export function runCommand(
  command: string,
  outcome: 'ok' | 'fail' | 'unknown' = 'ok',
  tool = 'bash',
): LighthouseReport {
  const events: RawEvent[] = [
    turn(1, 1),
    prompt(2, 'Run the task'),
    toolCall(3, 'c1', tool, { command }),
  ]
  if (outcome === 'ok') events.push(toolResult(4, 'c1'))
  if (outcome === 'fail') events.push(toolResult(4, 'c1', { failed: true, errorName: 'CommandFailed' }))
  return scan(events)
}

/** A fuller session used by the contract, report, and client-entry tests. */
export function sampleEvents(): RawEvent[] {
  return [
    turn(1, 1),
    prompt(2, 'Fix the deploy and rotate the key'),
    title(3, 'Deploy fix'),
    toolCall(4, 'c1', 'bash', { command: 'npm test' }),
    toolResult(5, 'c1'),
    toolCall(6, 'c2', 'bash', { command: 'rm -rf ./dist' }),
    toolResult(7, 'c2'),
    toolCall(8, 'c3', 'read', { file_path: 'C:\\work\\project\\.env' }),
    toolResult(9, 'c3'),
    toolCall(10, 'c4', 'bash', { command: 'cat .env' }),
    toolResult(11, 'c4'),
    turn(12, 2),
    toolCall(13, 'c5', 'bash', { command: 'git push --force origin main' }),
    toolResult(14, 'c5'),
    toolCall(15, 'c6', 'bash', { command: 'taskkill /F /IM node.exe' }),
    toolResult(16, 'c6', { failed: true, errorName: 'CommandFailed' }),
    toolCall(17, 'c7', 'bash', { command: 'rm -rf /' }),
    toolCall(18, 'c8', 'edit', { file_path: 'C:\\work\\project\\secrets.json' }),
    toolResult(19, 'c8'),
  ]
}

/** The shared sample report. */
export function scanSample(): LighthouseReport {
  return scan(sampleEvents())
}
