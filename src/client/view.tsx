/**
 * dsh-lighthouse — The lighthouse view.
 *
 * One tab in the conversation view ring. It asks the host to scan the *current*
 * session, then shows every hard-to-undo action with its target, what could be
 * affected, a safer move, and the log event that proves it happened. Read-only:
 * nothing here blocks a tool or re-runs a command.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { Finding, LighthouseReport, RuleId, Severity } from '../schema.ts'
import type { Translate } from './locales.ts'
import { localizeScanError } from './errors.ts'
import {
  outcomeLabel,
  ruleLabel,
  ruleSafe,
  ruleWhy,
  severityLabel,
  severityWhy,
  variantLabel,
} from './catalog.ts'
import { buildReportMarkdown, reportFileName, stamp } from './report.ts'

/** Re-declare the view seat so this plugin types its registration without importing ui-conversation. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.view': {
      kind: 'list'
      scope: 'session'
      owner: { inspect?: { callId: string } | null; onInspectDone?: () => void }
    }
  }
}

/** Runtime shape the mounted lighthouse namespace returns. */
type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { message: string } }

/** The host Remote face passed into the view. */
export interface LighthouseActions {
  scan: (sessionId: string) => Promise<RemoteResult<LighthouseReport>>
}

/** Props the view-tab slot component receives (slot runtime + inject face). */
export type LighthouseViewSlotProps = PropsRuntime<'conversation.view'> & {
  actions: LighthouseActions
  t: Translate
}

type Phase = 'loading' | 'ready' | 'error'

/** `all` plus the three severities, in reading order. */
type Filter = 'all' | Severity

const FILTERS: readonly Severity[] = ['critical', 'warning', 'notice']

const MARK = (
  <svg className="l-mark" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M9.4 21h5.2" />
    <path d="M10.4 21l.8-8h1.6l.8 8" />
    <path d="M9.6 13h4.8" />
    <path d="M10.2 9h3.6l.6 4h-4.8z" />
    <path d="M11 9V7h2v2" />
    <path d="M12 3.2V7" />
    <path d="M5.4 6.4l3.2 1.6M18.6 6.4l-3.2 1.6" />
    <path d="M4 11h2M18 11h2" />
  </svg>
)

const GOOD = (
  <svg className="l-good-mark" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.2 12.3l2.5 2.4 5.1-5.2" />
  </svg>
)

/** Copy text, falling back to a selection when the async clipboard is unavailable. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

/** Save the report through a local object URL; nothing leaves the machine. */
function downloadMarkdown(markdown: string, name: string): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => { URL.revokeObjectURL(url) }, 30_000)
}

/** One `第 n 轮` / `第 a–b 轮` label. */
function turnsLabel(finding: Finding, t: Translate): string {
  return finding.turn === finding.lastTurn
    ? t('finding.turn', { turn: String(finding.turn) })
    : t('finding.turns', { first: String(finding.turn), last: String(finding.lastTurn) })
}

/** The lighthouse tab body. */
export function LighthouseView({ sessionId, actions, t }: LighthouseViewSlotProps) {
  const [report, setReport] = useState<LighthouseReport | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [failure, setFailure] = useState('')
  const [nonce, setNonce] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')

  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (sessionId === undefined || sessionId === '') {
      setReport(null)
      setPhase('ready')
      setFailure('')
      return
    }
    let cancelled = false
    setPhase('loading')
    setFailure('')
    void actions.scan(sessionId).then(
      (result) => {
        if (cancelled) return
        if (result.ok) {
          setReport(result.value)
          setFilter('all')
          setPhase('ready')
        } else {
          setFailure(localizeScanError(result.error.message, t))
          setPhase('error')
        }
      },
      (reason: unknown) => {
        if (cancelled) return
        setFailure(localizeScanError(reason instanceof Error ? reason.message : String(reason), t))
        setPhase('error')
      },
    )
    return () => { cancelled = true }
  }, [sessionId, actions, t, nonce])

  const say = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => { setToast('') }, 3600)
  }, [])

  useEffect(() => () => { if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current) }, [])

  const shownCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, warning: 0, notice: 0 }
    for (const finding of report?.findings ?? []) counts[finding.severity] += 1
    return counts
  }, [report])

  const tally = useMemo(() => {
    const groups = new Map<RuleId, { severity: Severity; count: number }>()
    for (const finding of report?.findings ?? []) {
      const seen = groups.get(finding.rule)
      if (seen === undefined) groups.set(finding.rule, { severity: finding.severity, count: finding.occurrences })
      else seen.count += finding.occurrences
    }
    return [...groups.entries()]
  }, [report])

  const markdown = useMemo(() => (report === null ? '' : buildReportMarkdown(report, t)), [report, t])

  const visible = useMemo(
    () => (report?.findings ?? []).filter((finding) => filter === 'all' || finding.severity === filter),
    [report, filter],
  )

  const onCopy = useCallback(() => {
    if (markdown.trim() === '') return
    void writeClipboard(markdown).then((ok) => { say(ok ? t('action.copied') : t('action.copyFailed')) })
  }, [markdown, say, t])

  const onDownload = useCallback(() => {
    if (report === null || markdown.trim() === '') return
    downloadMarkdown(markdown, reportFileName(report))
    say(t('action.downloaded'))
  }, [markdown, report, say, t])

  if (phase === 'loading' && report === null) {
    return (
      <div className="l-root">
        <div className="l-inner">
          <div className="l-state"><span className="l-spin" />{t('state.loading')}</div>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="l-root">
        <div className="l-inner">
          <div className="l-bar">
            <button type="button" className="l-btn primary" onClick={() => { setNonce((value) => value + 1) }}>{t('action.refresh')}</button>
            <span className="l-spacer" />
          </div>
          <div className="l-empty">{t('state.error', { message: failure })}</div>
        </div>
      </div>
    )
  }

  if (report === null) {
    return (
      <div className="l-root">
        <div className="l-inner"><div className="l-empty">{t('state.noSession')}</div></div>
      </div>
    )
  }

  const nothingToCheck = report.counts.commands === 0 && report.counts.fileOps === 0
  const nextKey = report.counts.critical > 0
    ? 'next.critical'
    : report.counts.warning > 0 ? 'next.warning' : 'next.clear'

  const chips = [
    <span className="l-chip" key="gen">{t('hero.generated', { time: stamp(report.generatedAt) })}</span>,
    <span className="l-chip" key="seq">{t('hero.throughSeq', { seq: String(report.throughSeq) })}</span>,
    <span className="l-chip" key="rules">{t('hero.rules', { count: String(report.counts.rules) })}</span>,
  ]
  if (report.redaction.enabled && report.redaction.count > 0) {
    chips.push(<span className="l-chip" key="rd" title={report.redaction.kinds.join(', ')}>{t('note.redacted', { count: String(report.redaction.count) })}</span>)
  } else if (!report.redaction.enabled) {
    chips.push(<span className="l-chip warn" key="rdoff">{t('note.redactOff')}</span>)
  }
  if (report.truncated) chips.push(<span className="l-chip warn" key="tr">{t('note.truncated')}</span>)

  const metrics: Array<[string, string, string]> = [
    [t('metric.events'), String(report.counts.events), ''],
    [t('metric.commands'), String(report.counts.commands), ''],
    [t('metric.fileOps'), String(report.counts.fileOps), ''],
    [t('metric.findings'), String(report.counts.findings), report.counts.critical > 0 ? 'crit' : report.counts.warning > 0 ? 'warn' : ''],
    [t('metric.critical'), String(report.counts.critical), report.counts.critical > 0 ? 'crit' : ''],
    [t('metric.warning'), String(report.counts.warning), report.counts.warning > 0 ? 'warn' : ''],
    [t('metric.notice'), String(report.counts.notice), ''],
  ]

  return (
    <div className="l-root">
      <div className="l-inner">
        <div className="l-bar">
          <button type="button" className="l-btn" onClick={() => { setNonce((value) => value + 1) }} disabled={phase === 'loading'}>
            {phase === 'loading' ? t('action.refreshing') : t('action.refresh')}
          </button>
          <button type="button" className="l-btn" onClick={onCopy} disabled={markdown.trim() === ''}>{t('action.copy')}</button>
          <button type="button" className="l-btn" onClick={onDownload} disabled={markdown.trim() === ''}>{t('action.download')}</button>
          <span className="l-spacer" />
          <div className="l-filters" role="group" aria-label={t('section.findings')}>
            <button
              type="button"
              className={filter === 'all' ? 'l-fbtn active' : 'l-fbtn'}
              aria-pressed={filter === 'all'}
              onClick={() => { setFilter('all') }}
            >
              {t('filter.all')}<span className="l-fcount">{report.findings.length}</span>
            </button>
            {FILTERS.map((severity) => (
              <button
                type="button"
                className={filter === severity ? 'l-fbtn active' : 'l-fbtn'}
                aria-pressed={filter === severity}
                key={severity}
                onClick={() => { setFilter(severity) }}
              >
                <span className={`l-dot ${severity}`} />
                {severityLabel(severity, t)}<span className="l-fcount">{shownCounts[severity]}</span>
              </button>
            ))}
          </div>
        </div>

        <header className="l-hero">
          {MARK}
          <div>
            <h2>{report.title === '' ? t('hero.untitled') : report.title}</h2>
            <p className="l-sub">
              {t('hero.session')}：{report.sessionId}
              {report.cwd === '' ? null : <> · {t('hero.cwd')}：{report.cwd}</>}
            </p>
            <div className="l-chips">{chips}</div>
          </div>
        </header>

        <div className="l-grid">
          {metrics.map(([label, value, tone]) => (
            <div className={tone === '' ? 'l-cell' : `l-cell ${tone}`} key={label}><b>{value}</b><span>{label}</span></div>
          ))}
        </div>

        {report.goal === '' ? null : (
          <section className="l-panel l-goal-panel">
            <h4>{t('section.goal')}</h4>
            <p className="l-goal">{report.goal}</p>
          </section>
        )}

        <div className="l-cols">
          <div>
            <h3 className="l-h">
              {t('section.findings')}
              <span className="l-count">{filter === 'all' ? report.findings.length : `${visible.length} / ${report.findings.length}`}</span>
            </h3>

            {report.findings.length === 0 ? (
              <div className="l-good">
                {GOOD}
                <div>
                  <h3>{t(nothingToCheck ? 'state.noActions' : 'state.clear')}</h3>
                  <p>{t('note.readonly')}</p>
                  <p className="l-local">{t('note.evidence')}</p>
                </div>
              </div>
            ) : visible.length === 0 ? (
              <div className="l-empty inline">{t('filter.empty')}</div>
            ) : (
              <div className="l-cards">
                {visible.map((finding) => {
                  const variant = variantLabel(finding.variant, t)
                  const hint = finding.outcome === 'failed'
                    ? t('outcome.failedHint')
                    : finding.outcome === 'unknown' ? t('outcome.unknownHint') : ''
                  return (
                    <article className={`l-card ${finding.severity}`} key={finding.id}>
                      <header className="l-card-h">
                        <span className={`l-badge ${finding.severity}`}>{severityLabel(finding.severity, t)}</span>
                        <strong className="l-card-title">{ruleLabel(finding.rule, t)}</strong>
                        {variant === undefined ? null : <span className="l-tag">{variant}</span>}
                        <span className="l-spacer" />
                        <span className="l-meta">{turnsLabel(finding, t)}</span>
                        {finding.occurrences > 1 ? (
                          <span className="l-meta">{t('finding.occurrences', { count: String(finding.occurrences) })}</span>
                        ) : null}
                      </header>

                      {finding.target === undefined || finding.kind === 'file' ? null : (
                        <div className="l-kv">
                          <span className="l-k">{t('finding.target')}</span>
                          <code className="l-code">{finding.target}</code>
                        </div>
                      )}
                      {finding.path === undefined ? null : (
                        <div className="l-kv">
                          <span className="l-k">{t('finding.path')}</span>
                          <code className="l-code">{finding.path}</code>
                        </div>
                      )}
                      {finding.command === undefined ? null : <pre className="l-cmd">{finding.command}</pre>}

                      <p className="l-why"><b>{t('finding.why')}</b>{ruleWhy(finding.rule, t)}</p>
                      <p className="l-safe"><b>{t('finding.safe')}</b>{ruleSafe(finding.rule, t)}</p>

                      <footer className="l-card-f">
                        <span className={`l-outcome ${finding.outcome}`}>{outcomeLabel(finding.outcome, t)}</span>
                        {hint === '' ? null : <span className="l-hint">{hint}</span>}
                        <span className="l-spacer" />
                        <span className="l-evidence">{t('finding.seq', { seq: String(finding.seq) })}</span>
                      </footer>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <aside className="l-side">
            <section className="l-panel">
              <h4>{t('section.next')}</h4>
              <p className="l-next">{t(nextKey, { count: String(report.counts.critical) })}</p>
            </section>

            {tally.length === 0 ? null : (
              <section className="l-panel">
                <h4>{t('section.rules')} <span className="l-count">{tally.length}</span></h4>
                <ul className="l-tally">
                  {tally.map(([rule, group]) => (
                    <li key={rule}>
                      <span className={`l-dot ${group.severity}`} />
                      <span className="l-tally-label">{ruleLabel(rule, t)}</span>
                      <span className="l-count">{group.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="l-panel">
              <h4>{t('section.how')}</h4>
              <ul className="l-legend">
                {FILTERS.map((severity) => (
                  <li key={severity}>
                    <span className={`l-dot ${severity}`} />
                    <b>{severityLabel(severity, t)}</b>
                    <span>{severityWhy(severity, t)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <p className="l-local">{t('note.readonly')}</p>
            <p className="l-local">{t('note.local')}</p>
          </aside>
        </div>
      </div>

      {toast === '' ? null : <div className="l-toast" role="status">{toast}</div>}
    </div>
  )
}
