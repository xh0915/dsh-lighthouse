/**
 * dsh-lighthouse — Human-readable report builder.
 *
 * Turns the wire report into plain Markdown a person can paste into a chat,
 * an issue, or a review. It uses the same localized labels as the tab, and it
 * never adds a finding the scan did not produce.
 */
import type { Finding, LighthouseReport } from '../schema.ts'
import type { Translate } from './locales.ts'
import { outcomeLabel, ruleLabel, ruleSafe, ruleWhy, severityLabel } from './catalog.ts'

/** Local date-time for chips and report headers. */
export function stamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleString()
}

/** A filesystem-safe report name that still names the session. */
export function reportFileName(report: LighthouseReport): string {
  const id = report.sessionId.replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 24)
  return `lighthouse-${id === '' ? 'session' : id}.md`
}

/** Wrap a value as inline code, using more ticks than the value itself has. */
function code(value: string): string {
  const runs = value.match(/`+/g) ?? []
  const ticks = '`'.repeat(Math.max(0, ...runs.map((run) => run.length)) + 1)
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : ''
  return `${ticks}${pad}${value}${pad}${ticks}`
}

/** A fence longer than any backtick run in the command, so it cannot close early. */
function fence(command: string): string {
  const runs = command.match(/`+/g) ?? []
  return '`'.repeat(Math.max(3, ...runs.map((run) => run.length + 1)))
}

/** One finding as a Markdown section row. */
function findingLines(finding: Finding, t: Translate): string[] {
  const lines: string[] = []
  const meta = [
    ruleLabel(finding.rule, t),
    finding.turn === finding.lastTurn
      ? t('finding.turn', { turn: String(finding.turn) })
      : t('finding.turns', { first: String(finding.turn), last: String(finding.lastTurn) }),
    outcomeLabel(finding.outcome, t),
  ]
  if (finding.occurrences > 1) {
    meta.push(t('finding.occurrences', { count: String(finding.occurrences) }))
  }
  lines.push(`### ${meta.join(' · ')}`, '')

  if (finding.kind === 'command' && finding.target !== undefined) {
    lines.push(`- ${t('report.target')}: ${code(finding.target)}`)
  }
  if (finding.path !== undefined) lines.push(`- ${t('report.file')}: ${code(finding.path)}`)
  if (finding.command !== undefined) {
    const marker = fence(finding.command)
    lines.push(`- ${t('report.command')}:`, '', `${marker}sh`, finding.command, marker, '')
  }
  lines.push(`${t('report.why')}${ruleWhy(finding.rule, t)}`, '')
  lines.push(`${t('report.safe')}${ruleSafe(finding.rule, t)}`, '')
  lines.push(`<sub>${t('finding.seq', { seq: String(finding.seq) })}</sub>`, '')
  return lines
}

/** Build the complete Markdown report the tab copies or downloads. */
export function buildReportMarkdown(report: LighthouseReport, t: Translate): string {
  const lines: string[] = []
  lines.push(`# ${t('report.title')}`, '')
  lines.push(`> ${t('report.meta', {
    session: report.sessionId,
    time: stamp(report.generatedAt),
    seq: String(report.throughSeq),
  })}`, '')

  if (report.title !== '') lines.push(`**${report.title}**`, '')

  if (report.goal !== '') {
    lines.push(`## ${t('report.goal')}`, '', report.goal, '')
  }

  lines.push(`## ${t('report.summaryTitle')}`, '')
  lines.push(report.counts.findings === 0 ? t('report.none') : t('report.summary', {
    events: String(report.counts.events),
    commands: String(report.counts.commands),
    fileOps: String(report.counts.fileOps),
    findings: String(report.counts.findings),
    critical: String(report.counts.critical),
    warning: String(report.counts.warning),
    notice: String(report.counts.notice),
  }), '')

  for (const severity of ['critical', 'warning', 'notice'] as const) {
    const items = report.findings.filter((finding) => finding.severity === severity)
    if (items.length === 0) continue
    lines.push(`## ${severityLabel(severity, t)} (${items.length})`, '')
    for (const finding of items) lines.push(...findingLines(finding, t))
  }

  if (report.truncated) lines.push(t('report.truncated'), '')
  lines.push('---', '')
  lines.push(report.redaction.enabled ? t('report.redacted') : t('note.redactOff'))
  lines.push(t('report.generated'))
  return `${lines.join('\n')}\n`
}
