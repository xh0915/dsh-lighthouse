/**
 * dsh-lighthouse — Local secret redaction.
 *
 * Runs on the host before anything crosses to the browser, so no credential ever
 * reaches the view or a copied report. Pure and dependency-free so it can be
 * tested against real-looking payloads.
 */

/** One redaction rule: a family label plus the pattern it rewrites. */
interface Rule {
  readonly kind: string
  readonly pattern: RegExp
  /** @param match - the full match; @param groups - capture groups. */
  replace: (match: string, ...groups: string[]) => string
}

/** Marker text spliced in place of a secret. */
export const MASK = '«已脱敏»'

/** The replacement keeps any leading `key=`/`Bearer ` chrome and only eats the value. */
function keepPrefix(release: string): (match: string, head: string) => string {
  return (_match, head) => `${head}${release}${MASK}`
}

/**
 * Values that only *look* like secrets. Skipping these keeps the report readable:
 * environment references, template holes, dotted member paths, bare identifiers,
 * and our own mask.
 */
function looksLikeCode(value: string): boolean {
  if (value.length < 12) return true
  if (/^\$\{?[A-Za-z_]/.test(value) || value.startsWith('%') || value.startsWith('#{')) return true
  if (/^[A-Z0-9_]{12,}$/.test(value)) return true
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(value)) return true
  if (/^(?:true|false|null|undefined|string)$/i.test(value)) return true
  if (value.includes(MASK)) return true
  // A dotted member path with no digit anywhere is a field reference, not a credential.
  if (!/[0-9]/.test(value) && /^[A-Za-z_][\w.]*$/.test(value)) return true
  return false
}

const ASSIGNMENT = /\b((?:api[_\s-]?key|apikey|access[_\s-]?(?:key|token)|secret[_\s-]?key|client[_\s-]?(?:secret|id)|auth[_\s-]?token|refresh[_\s-]?token|private[_\s-]?key|password|passwd|pwd|token|secret)\b\s*[:=]\s*["']?)([^"'\s,;)}\]]{8,})(["'])?/gi
const BEARER = /\b(Bearer[ \t]+)([A-Za-z0-9._~+/-]{12,}={0,2})/gi
const PROVIDER_KEY = /((?:sk|pk|rk|rk_live|sk_live|sk_test|key|sg|vt|proc)-[A-Za-z0-9_-]{16,})/g
const DEEPSEEK_RELAY = /(sk_[A-Za-z0-9_-]{16,})/g
const GITHUB = /((?:gh[pousr]|gho)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g
const AWS = /((?:AKIA|ASIA|ABIA|ACCA)[0A-Z]{16})\b/g
const GOOGLE = /(AIza[0-9A-Za-z_-]{30,})\b/g
const SLACK = /(xox[abprs]-[A-Za-z0-9-]{18,}|xapp-[A-Za-z0-9-]{18,})\b/g
const STRIPE = /(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g
const NPM = /(npm_[A-Za-z0-9]{30,})/g
const PYPI = /(pypi-AgEIcHlwaSg[A-Za-z0-9_-]{20,})/g
const JWT = /(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,})/g
const PRIVATE_KEY = /-----BEGIN(?:\s+[A-Z]+)*\s*PRIVATE\s*KEY-----(?:.|\n)*?-----END(?:\s+[A-Z]+)*\s*PRIVATE\s*KEY-----/g
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]*:)([^/\s:@]{4,})(@)/gi
const EMAIL = /\b([A-Za-z0-9._%+-]{3,})@([A-Za-z0-9.-]{4,}\.[A-Za-z]{2,})\b/g

const RULES: readonly Rule[] = [
  { kind: 'private-key', pattern: PRIVATE_KEY, replace: () => MASK },
  { kind: 'jwt', pattern: JWT, replace: () => MASK },
  { kind: 'github-token', pattern: GITHUB, replace: () => MASK },
  { kind: 'aws-key', pattern: AWS, replace: () => MASK },
  { kind: 'google-key', pattern: GOOGLE, replace: () => MASK },
  { kind: 'slack-token', pattern: SLACK, replace: () => MASK },
  { kind: 'npm-token', pattern: NPM, replace: () => MASK },
  { kind: 'pypi-token', pattern: PYPI, replace: () => MASK },
  { kind: 'provider-key', pattern: PROVIDER_KEY, replace: () => MASK },
  { kind: 'provider-key', pattern: DEEPSEEK_RELAY, replace: () => MASK },
  { kind: 'provider-key', pattern: STRIPE, replace: () => MASK },
  { kind: 'bearer', pattern: BEARER, replace: keepPrefix('') },
  { kind: 'url-credentials', pattern: URL_CREDENTIALS, replace: (match, head, _value, tail) => `${head}${MASK}${tail}` },
  { kind: 'credential-assignment', pattern: ASSIGNMENT, replace: (match, head, value, quote) => (looksLikeCode(value) ? match : `${head}${MASK}${quote ?? ''}`) },
  { kind: 'email', pattern: EMAIL, replace: () => MASK },
]

/** One redaction pass over one string. */
export interface RedactionOutcome {
  readonly text: string
  /** Spans replaced on this pass. */
  readonly hits: number
  /** Rule families that fired on this pass. */
  readonly kinds: readonly string[]
}

/**
 * Rewrite every secret-shaped span in `input`.
 * Patterns are stateful globals; each rule gets a fresh clone so concurrent
 * folds can never share a `lastIndex`.
 * @param input - raw text from the session log.
 * @returns the redacted text plus what was touched.
 */
export function redact(input: string): RedactionOutcome {
  let text = input
  let hits = 0
  const kinds = new Set<string>()
  for (const rule of RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags)
    text = text.replace(pattern, (match: string, ...rest: unknown[]) => {
      const groups = rest.slice(0, -2) as string[]
      hits += 1
      kinds.add(rule.kind)
      return rule.replace(match, ...groups)
    })
  }
  return { text, hits, kinds: [...kinds] }
}

/** Accumulates redaction across the whole fold into one report. */
export class Redactor {
  private count = 0
  private readonly kinds = new Set<string>()

  /** @param enabled - when false the text passes through untouched. */
  constructor(readonly enabled: boolean) {}

  /**
   * Redact and cap in one step. The cap runs first so a truncated tail can never
   * split a secret in half and leak the remainder; the result is re-clamped
   * afterwards because a mask can shift a tail by a character. Re-clamping after
   * redaction is safe: the secrets are already gone from the string.
   * @param value - raw text; undefined passes through.
   * @param limit - maximum characters of the returned text.
   * @returns text safe to ship to the browser.
   */
  clip(value: string | undefined, limit: number): string | undefined {
    if (value === undefined) return undefined
    const budget = Math.max(0, limit - 1)
    const head = value.length > limit ? `${value.slice(0, budget)}…` : value
    if (!this.enabled) return head
    const outcome = redact(head)
    if (outcome.hits > 0) {
      this.count += outcome.hits
      for (const kind of outcome.kinds) this.kinds.add(kind)
    }
    return outcome.text.length > limit ? `${outcome.text.slice(0, budget)}…` : outcome.text
  }

  /** The redaction block to attach to the report. */
  summary(): { count: number; kinds: string[]; enabled: boolean } {
    return { count: this.count, kinds: [...this.kinds].sort(), enabled: this.enabled }
  }
}
