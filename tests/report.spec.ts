/**
 * Report builder tests.
 *
 * The Markdown leaves the tab and travels into chats and issues, so it must
 * carry every finding the scan produced, in severity order, in plain words —
 * and nothing it did not produce.
 */
import { describe, expect, it } from 'vitest'
import { buildReportMarkdown, reportFileName, stamp } from '../src/client/report.ts'
import { en, zh, type Translate } from '../src/client/locales.ts'
import type { LighthouseKey } from '../src/client/locales.ts'
import { T0, runCommand, sampleEvents, scan, scanSample, title, toolCall, toolResult, turn } from './sample.ts'

/** Build a translator over one dictionary, with `{name}` interpolation. */
function translator(dict: Record<string, string>): Translate {
  const translate = (key: string, params?: Record<string, string | number | undefined>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (marker, name: string) => String(params?.[name] ?? marker))
  return translate as unknown as Translate
}

const zhT = translator(zh as unknown as Record<string, string>)
const enT = translator(en as unknown as Record<string, string>)

/** Every dictionary key in the Chinese table, for lookups in assertions. */
const Z = (key: LighthouseKey): string => zh[key] as string

describe('report file name', () => {
  it('keeps the session name but strips anything a filesystem dislikes', () => {
    expect(reportFileName(scanSample())).toBe('lighthouse-session-01hlighthouse.md')
    const hostile = { ...scanSample(), sessionId: '../../etc/passwd?' }
    expect(reportFileName(hostile)).toBe('lighthouse-etcpasswd.md')
  })

  it('falls back to a generic name when the id has no usable characters', () => {
    expect(reportFileName({ ...scanSample(), sessionId: '///' })).toBe('lighthouse-session.md')
  })

  it('caps a very long id', () => {
    const name = reportFileName({ ...scanSample(), sessionId: 'a'.repeat(80) })
    expect(name).toBe(`lighthouse-${'a'.repeat(24)}.md`)
  })

  it('renders an invalid timestamp as a dash instead of an epoch date', () => {
    expect(stamp(0)).toBe('—')
    expect(stamp(Number.NaN)).toBe('—')
    expect(stamp(T0)).not.toBe('—')
  })
})

describe('Markdown report', () => {
  const report = scanSample()
  const markdown = buildReportMarkdown(report, zhT)

  it('names the session, its goal, and the scan point', () => {
    expect(markdown).toContain(`# ${Z('report.title')}`)
    expect(markdown).toContain(report.sessionId)
    expect(markdown).toContain(`到事件 #${report.throughSeq}`)
    expect(markdown).toContain(`## ${Z('report.goal')}`)
    expect(markdown).toContain(report.goal)
  })

  it('writes one section per finding and no extra finding', () => {
    const headings = markdown.match(/^### /gm) ?? []
    expect(headings).toHaveLength(report.findings.length)
    expect(markdown).toContain('5')
    expect(markdown).toContain(`## ${Z('severity.critical')} (5)`)
    expect(markdown).toContain(`## ${Z('severity.warning')} (1)`)
    expect(markdown).toContain(`## ${Z('severity.notice')} (1)`)
  })

  it('orders severities from critical down to notice', () => {
    const critical = markdown.indexOf(`## ${Z('severity.critical')}`)
    const warning = markdown.indexOf(`## ${Z('severity.warning')}`)
    const notice = markdown.indexOf(`## ${Z('severity.notice')}`)
    expect(critical).toBeGreaterThan(-1)
    expect(warning).toBeGreaterThan(critical)
    expect(notice).toBeGreaterThan(warning)
  })

  it('gives each finding a target, a reason, and a safer move', () => {
    expect(markdown).toContain('`.env`')
    expect(markdown).toContain('```sh')
    expect(markdown).toContain('cat .env')
    expect(markdown).toContain(Z('rule.secret-read.why'))
    expect(markdown).toContain(Z('rule.secret-read.safe'))
    expect(markdown).toContain(Z('rule.process-kill-broad.why'))
    expect(markdown).toContain(Z('rule.process-kill-broad.safe'))
  })

  it('uses the same outcome words as the tab', () => {
    expect(markdown).toContain(Z('outcome.failed'))
    expect(markdown).toContain(Z('outcome.unknown'))
    expect(markdown).toContain(Z('outcome.succeeded'))
  })

  it('closes the footer by saying the scan was local and read-only', () => {
    expect(markdown).toContain(Z('report.redacted'))
    expect(markdown).toContain(Z('report.generated'))
    expect(markdown.endsWith('\n')).toBe(true)
  })

  it('names a file once instead of repeating it as target and file', () => {
    const fileReport = scan([
      turn(1, 1),
      toolCall(2, 'c1', 'read', { file_path: 'C:\\work\\project\\.env' }),
      toolResult(3, 'c1'),
    ])
    const text = buildReportMarkdown(fileReport, zhT)
    expect(text).toContain(`- ${Z('report.file')}: \`.env\``)
    expect(text).not.toContain(`- ${Z('report.target')}:`)
  })

  it('says plainly when nothing was found', () => {
    const clean = runCommand('npm test')
    const text = buildReportMarkdown(clean, zhT)
    expect(text).toContain(Z('report.none'))
    expect(text).not.toContain('### ')
  })

  it('omits the goal section when the session has no prompt', () => {
    const text = buildReportMarkdown(scan([title(1, 'Only a title')]), zhT)
    expect(text).not.toContain(`## ${Z('report.goal')}`)
    expect(text).toContain('Only a title')
  })

  it('notes truncation and a disabled redactor honestly', () => {
    const capped = scan(sampleEvents(), { maxFindings: 1 })
    const plain = scan(sampleEvents(), { redactSecrets: false })
    expect(capped.truncated).toBe(true)
    expect(buildReportMarkdown(capped, zhT)).toContain(Z('report.truncated'))
    expect(buildReportMarkdown(plain, zhT)).toContain(Z('note.redactOff'))
  })

  it('widens the fence past the longest backtick run in the command', () => {
    const text = buildReportMarkdown(runCommand('rm -rf ./dist # ```'), zhT)
    expect(text).toContain('````sh')
    const wider = buildReportMarkdown(runCommand('rm -rf ./dist # ````'), zhT)
    expect(wider).toContain('`````sh')
  })

  it('speaks English when the shell language is English', () => {
    const text = buildReportMarkdown(report, enT)
    expect(text).toContain('# Lighthouse risk report')
    expect(text).toContain('## Summary')
    expect(text).toContain(en['rule.secret-read.why'])
    expect(text).toContain(en['report.generated'])
    expect(text).not.toContain('rule.secret-read')
    expect(text).not.toContain('undefined')
  })
})
