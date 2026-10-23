/**
 * dsh-lighthouse — The detector.
 *
 * Reads one raw DSH session log and reports the actions that are hard to undo:
 * broad deletes, history rewrites, process kills by name, credential reads, and
 * similar. Every finding points at a real event. Nothing here blocks a tool,
 * calls a model, or guesses intent: the copy says what the command would do,
 * not why the agent ran it.
 *
 * Rules are deliberately conservative. A command only matches at the start of a
 * shell segment (so `echo "rm -rf /"` is not a delete), quoted text is never cut
 * on a `;`, and a rule that cannot tell the blast radius says so instead of
 * inventing one.
 */
import { RULE_IDS } from './rules.ts'
import { Redactor } from './redact.ts'
import type { Category, Finding, LighthouseReport, Outcome, RuleId, Severity } from './schema.ts'

/** The shape of a raw log line as it arrives from `sessionQuery.readSession`. */
export interface RawEvent {
  readonly type: string
  readonly seq?: number
  readonly time?: number
  readonly data?: unknown
}

/** The session header line. */
export interface RawHeader {
  readonly id: string
  readonly createdAt: number
  readonly cwd?: string
  readonly agentPreset?: string
}

/** Detection knobs resolved from the plugin Config. */
export interface ScanOptions {
  readonly redactSecrets: boolean
  readonly maxFindings: number
  /** Host platform, passed in so the detector stays pure. */
  readonly platform: string
  /** Clock; injected by tests. */
  readonly now: number
}

const LIMIT = {
  title: 120,
  goal: 600,
  command: 1200,
  path: 400,
  target: 120,
  cwd: 400,
} as const

/** Directories that projects usually rebuild; deleting them is routine. */
const DISPOSABLE = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', '.cache', '.next', '.nuxt',
  '.output', '.turbo', '.parcel-cache', 'target', 'tmp', 'temp', '.tmp', '.vite',
  '.nyc_output', 'release',
])

/** Roots whose recursive deletion takes a machine with it. */
const UNIX_ROOTS = new Set([
  '/', '/home', '/users', '/root', '/etc', '/var', '/usr', '/opt', '/srv', '/mnt', '/media', '/tmp',
])

/** Windows switches that start with `/`, so `/home` stays a path, not a flag. */
const WINDOWS_SWITCHES = new Set([
  'a', 'c', 'd', 'e', 'f', 'h', 'k', 'l', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'w', 'y',
  'im', 'pid', 'fi', 'fo', 'nh', 'recursive', 'recurse', 'force', 'quiet', 'confirm',
  'path', 'filter', 'include', 'exclude', 'whatif',
])

/** Copy verbs: the secret leaves its file but is not printed into the log. */
const COPY_VERBS = new Set(['cp', 'copy', 'copy-item'])
/** Transfer verbs: the secret leaves the machine. */
const TRANSFER_VERBS = new Set(['scp'])

/** Read verbs whose output can carry a credential into the session log. */
const READ_AT_START = /^(?:sudo\s+)?(?:cat|type|more|less|head|tail|strings|xxd|base64|get-content|gc|grep|rg|sed|awk|copy-item|cp|copy|scp)\b/i

/** SQL clients at the start of a segment; a `DROP` in a markdown file is not a database action. */
const SQL_CLIENT = /^(?:sudo\s+)?(psql|mysql|mariadb|sqlite3|sqlcmd|mongosh)\b/i

/** File names that hold credentials or private keys. */
const SENSITIVE_NAMES: readonly RegExp[] = [
  /^\.env$/i,
  /^\.env\./i,
  /^\.credentials(?:\..+)?$/i,
  /^credentials\.(?:json|ya?ml|toml|ini|cfg|conf|txt)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.netrc$/i,
  /^\.git-credentials$/i,
  /^secrets?\.(?:ya?ml|json|toml)$/i,
  /^service-account.*\.json$/i,
  /^\.htpasswd$/i,
  /\.(?:pem|key|p12|pfx)$/i,
]

function dict(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

/** Trim to an exact length budget, counting the ellipsis inside it. */
function hard(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`
}

/** Collapse whitespace runs so a one-line label stays on one line. */
function inline(value: string, limit: number): string {
  return hard(value.replace(/\s+/g, ' ').trim(), limit)
}

/** Concatenate the `text` blocks of a message content array. */
function textOf(content: readonly unknown[]): string {
  const parts: string[] = []
  for (const block of content) {
    const record = dict(block)
    if (record.type === 'text' && typeof record.text === 'string') parts.push(record.text)
  }
  return parts.join('\n').trim()
}

/** Pull the printable body and error flag out of a `tool/result` payload. */
function resultBody(data: Record<string, unknown>): { text: string; isError: boolean } {
  const blocks = list(dict(data.message).content)
  const parts: string[] = []
  let isError = false
  for (const block of blocks) {
    const record = dict(block)
    for (const inner of list(record.content)) {
      const item = dict(inner)
      if (typeof item.text === 'string') parts.push(item.text)
    }
    if (record.isError === true) isError = true
  }
  return { text: parts.join('\n').trim(), isError }
}

/** Parse a tool call's `arguments` JSON defensively. */
function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined || raw === '') return {}
  try {
    return dict(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

/** Split a shell line on `&&`, `||`, `;`, and newlines, but never inside quotes. */
function segments(command: string): string[] {
  const out: string[] = []
  let current = ''
  let quote: string | null = null
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i] ?? ''
    if (quote !== null) {
      current += char
      if (char === '\\' && quote === '"') {
        const next = command[i + 1]
        if (next !== undefined) { current += next; i += 1 }
        continue
      }
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      current += char
      continue
    }
    if (char === '\n' || char === '\r') {
      out.push(current)
      current = ''
      continue
    }
    if (char === ';') {
      out.push(current)
      current = ''
      continue
    }
    if (char === '&' && command[i + 1] === '&') {
      out.push(current)
      current = ''
      i += 1
      continue
    }
    if (char === '|' && command[i + 1] === '|') {
      out.push(current)
      current = ''
      i += 1
      continue
    }
    current += char
  }
  out.push(current)
  return out.map((part) => part.trim()).filter((part) => part !== '')
}

/** Split a segment into words, keeping quoted paths together. */
function tokens(text: string): string[] {
  const out: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|`([^`]*)`|([^\s"'`]+)/g
  for (const match of text.matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? ''
    if (value !== '') out.push(value)
  }
  return out
}

/** A word that is a switch rather than a path. `/home` is a path, `/s` is not. */
function isFlag(word: string): boolean {
  if (word === '' || word === '-' || word === '/' || word === '--') return false
  if (word.startsWith('--')) return true
  if (word.startsWith('-')) return true
  if (word.startsWith('/')) {
    const rest = word.slice(1)
    if (rest.includes('/') || rest.includes('\\')) return false
    return WINDOWS_SWITCHES.has(rest.toLowerCase())
  }
  return false
}

/** Collect single-letter and long flags so `-rf`, `-r -f` and `--force` all count. */
function flagSet(words: readonly string[]): Set<string> {
  const set = new Set<string>()
  for (const word of words) {
    if (!word.startsWith('-') || word === '-' || word === '--') continue
    const body = word.replace(/^-+/, '')
    const raw = body.toLowerCase()
    if (raw === '') continue
    set.add(raw)
    // Expand only short clusters like -rf. `-Force` must not donate an `r`.
    const longForm = word.startsWith('--') || WINDOWS_SWITCHES.has(raw) || raw.length > 4
    if (!longForm) for (const char of raw) set.add(char)
  }
  return set
}

/** Windows-style switches (`/s`, `/q`) as a separate flag set. */
function windowsFlags(words: readonly string[]): Set<string> {
  const set = new Set<string>()
  for (const word of words) {
    if (!word.startsWith('/') || word === '/') continue
    const raw = word.slice(1).toLowerCase()
    if (WINDOWS_SWITCHES.has(raw)) {
      set.add(raw)
      for (const char of raw) set.add(char)
    }
  }
  return set
}

function hasAny(flags: ReadonlySet<string>, ...names: readonly string[]): boolean {
  return names.some((name) => flags.has(name))
}

/** Display a logged path relative to the workspace when it sits inside it. */
function displayPath(cwd: string, path: string, platform: string): string {
  if (cwd === '' || path === '') return path
  const normalizeSlash = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '')
  const root = normalizeSlash(cwd)
  const full = normalizeSlash(path)
  const fold = (value: string) => (platform === 'win32' ? value.toLowerCase() : value)
  if (fold(full) === fold(root)) return '.'
  if (fold(full).startsWith(`${fold(root)}/`)) return full.slice(root.length + 1)
  return path
}

/** The last path component, for matching a credential file wherever it lives. */
function baseName(path: string): string {
  const clean = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return clean.slice(clean.lastIndexOf('/') + 1)
}

/** Whether a path names a credential or private key. */
export function isSensitivePath(path: string): boolean {
  const base = baseName(path.trim())
  if (base === '') return false
  // Templates and public keys are meant to be read.
  if (/\.(?:example|sample|template|pub)$/i.test(base)) return false
  return SENSITIVE_NAMES.some((rule) => rule.test(base))
}

/** Strip a trailing `/*` and decide whether the target is a rebuildable directory. */
function isDisposable(target: string): boolean {
  const clean = target.replace(/\\/g, '/').replace(/[/*\s]+$/, '').replace(/\/+$/, '')
  const parts = clean.split('/').filter((part) => part !== '' && part !== '.' && part !== '..')
  const last = parts[parts.length - 1]?.toLowerCase() ?? ''
  return DISPOSABLE.has(last)
}

/** Whether a delete target is broad enough to take much more than the project. */
function isBroadTarget(target: string, cwd: string, platform: string): boolean {
  const clean = target.replace(/^["']|["']$/g, '').trim()
  if (clean === '' || clean === '.' || clean === '..' || clean === '~' || clean === '*' || clean === '*.*') return true
  if (/^(?:\$HOME|\$\{HOME\}|\$PWD|\$\{PWD\}|%USERPROFILE%|~)[\\/]?\*?$/i.test(clean)) return true
  if (/^[a-zA-Z]:[\\/]?\*?$/.test(clean)) return true
  if (/^[a-zA-Z]:[\\/](?:windows|users|program files)(?:[\\/]|$)/i.test(clean)) return true
  if (/^[a-zA-Z]:[\\/]users[\\/][^\\/]+[\\/]?$/i.test(clean)) return true
  const slashed = clean.replace(/\\/g, '/')
  const unix = /^\/+$/.test(slashed) ? '/' : slashed.replace(/\/+$/, '')
  if (unix === '/*' || unix === '/*.*') return true
  if (UNIX_ROOTS.has(unix.toLowerCase())) return true
  if (/^\/(?:home|users)\/[^/]+\/?$/i.test(unix)) return true
  if (/(?:^|\/)\.git(?:\/|$)/.test(unix)) return true
  if (cwd !== '') {
    const fold = (value: string) => (platform === 'win32' ? value.toLowerCase() : value)
    if (fold(unix) === fold(cwd.replace(/\\/g, '/').replace(/\/+$/, ''))) return true
  }
  return false
}

/** One rule match before it becomes a finding. */
interface Match {
  readonly rule: RuleId
  readonly severity: Severity
  readonly category: Category
  readonly target?: string
  readonly variant?: string
}

/** Build a match with the rule's fixed category. */
function match(rule: RuleId, severity: Severity, category: Category, target?: string, variant?: string): Match {
  return {
    rule, severity, category,
    ...(target === undefined || target.trim() === '' ? {} : { target: inline(target, LIMIT.target) }),
    ...(variant === undefined ? {} : { variant }),
  }
}

/** Classify a recursive delete by how much the target holds. */
function deleteMatch(targets: readonly string[], cwd: string, platform: string): Match | null {
  if (targets.length === 0) return null
  const broad = targets.some((target) => isBroadTarget(target, cwd, platform))
  const disposable = !broad && targets.every((target) => isDisposable(target))
  const target = targets[0]
  if (broad) return match('delete-recursive', 'critical', 'delete', target, 'broad')
  if (disposable) return match('delete-recursive', 'notice', 'delete', target, 'disposable')
  return match('delete-recursive', 'warning', 'delete', target, 'narrow')
}

/** Targets of a delete command: words that are not switches. */
function deleteTargets(words: readonly string[], from: number): string[] {
  const out: string[] = []
  let afterDoubleDash = false
  for (const word of words.slice(from)) {
    if (word === '--') { afterDoubleDash = true; continue }
    if (!afterDoubleDash && isFlag(word)) continue
    out.push(word)
  }
  return out
}

/** Match a recursive deletion written with rm, Remove-Item, del, or rd. */
function detectDelete(segment: string, cwd: string, platform: string): Match | null {
  const words = tokens(segment)
  const first = words[0]?.toLowerCase() ?? ''
  const command = first === 'sudo' ? (words[1]?.toLowerCase() ?? '') : first
  if (command === '') return null
  const from = first === 'sudo' ? 2 : 1
  const flags = new Set([...flagSet(words), ...windowsFlags(words)])

  if (command === 'rm' || command === 'remove-item' || command === 'ri') {
    if (!hasAny(flags, 'r', 'recursive', 'recurse')) return null
    return deleteMatch(deleteTargets(words, from), cwd, platform)
  }
  if (command === 'del' || command === 'erase' || command === 'rd' || command === 'rmdir') {
    if (!hasAny(flags, 's')) return null
    return deleteMatch(deleteTargets(words, from), cwd, platform)
  }
  return null
}

/** Git options that consume the following word. */
const GIT_TAKES_VALUE = new Set([
  '-c', '-C', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env', '--super-prefix',
])

/** Parse `git [-C path] <subcommand> ...` without mistaking a path for the verb. */
function gitInvocation(segment: string): { sub: string; rest: string[] } | null {
  const found = /^(?:sudo\s+)?git\b(.*)$/i.exec(segment)
  if (found === null) return null
  const words = tokens(found[1] ?? '')
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? ''
    if (word.startsWith('-')) {
      const name = word.split('=')[0] ?? word
      if (GIT_TAKES_VALUE.has(name) && !word.includes('=')) i += 1
      continue
    }
    return { sub: word.toLowerCase(), rest: words.slice(i + 1) }
  }
  return null
}

/** Match git commands that rewrite or discard history. */
function detectGit(segment: string): Match | null {
  const invocation = gitInvocation(segment)
  if (invocation === null) return null
  const { sub, rest } = invocation
  const flags = flagSet(rest)
  const joined = rest.join(' ')

  if (sub === 'clean') {
    if (hasAny(flags, 'n', 'dry-run')) return null
    if (!hasAny(flags, 'f', 'force')) return null
    const ignored = hasAny(flags, 'x')
    return match('git-clean', ignored ? 'critical' : 'warning', 'git', undefined, ignored ? 'ignored' : 'tracked')
  }
  if (sub === 'reset' && hasAny(flags, 'hard')) {
    return match('git-reset-hard', 'critical', 'git')
  }
  if (sub === 'checkout') {
    if (/(?:^|\s)--(?:\s|$)/.test(joined) || /(?:^|\s)\.(?:\/|\s|$)/.test(joined)) {
      return match('git-discard', 'warning', 'git')
    }
    if (hasAny(flags, 'f', 'force')) return match('git-discard', 'warning', 'git')
    return null
  }
  if (sub === 'restore') {
    // `--staged` alone only unstages; touching the worktree throws changes away.
    if (hasAny(flags, 'staged') && !hasAny(flags, 'worktree')) return null
    return match('git-discard', 'warning', 'git')
  }
  if (sub === 'push') {
    if (/--force-with-lease\b/.test(joined)) return match('git-force-push', 'notice', 'git', undefined, 'lease')
    if (hasAny(flags, 'mirror')) return match('git-force-push', 'critical', 'git', undefined, 'mirror')
    if (hasAny(flags, 'delete')) return match('git-force-push', 'warning', 'git', undefined, 'delete')
    if (/(?:^|\s)\+\S+/.test(joined)) return match('git-force-push', 'critical', 'git', undefined, 'force')
    if (/(?:^|\s)--force(?:\s|$)/.test(joined) || hasAny(flags, 'f', 'force')) {
      return match('git-force-push', 'critical', 'git', undefined, 'force')
    }
  }
  return null
}

/** Killing every process with a name can take the harness down with it. */
function killSeverity(target: string | undefined): Severity {
  if (target === undefined) return 'warning'
  const base = baseName(target).toLowerCase().replace(/\.exe$/, '')
  return /^(?:node|nodejs|dsh|deepseek|qoder|code|explorer|wt|windowsterminal|terminal|cmd|powershell|pwsh|bash|zsh|conhost)$/.test(base)
    ? 'critical'
    : 'warning'
}

/** Match a kill aimed at every process with a name instead of one PID. */
function detectProcessKill(segment: string): Match | null {
  const words = tokens(segment)
  const first = words[0]?.toLowerCase() ?? ''
  if (first === 'taskkill') {
    const named = /\/im\s+("[^"]+"|'[^']+'|\S+)/i.exec(segment)
    if (named === null) return null
    const target = named[1]?.replace(/^["']|["']$/g, '')
    return match('process-kill-broad', killSeverity(target), 'process', target, 'name')
  }
  if (first === 'stop-process') {
    const named = /-(?:name|n)\s+("[^"]+"|'[^']+'|\S+)/i.exec(segment)
    if (named === null) return null
    const target = named[1]?.replace(/^["']|["']$/g, '')
    return match('process-kill-broad', killSeverity(target), 'process', target, 'name')
  }
  if (first === 'killall') {
    const target = words.slice(1).find((word) => !word.startsWith('-'))
    if (target === undefined) return null
    return match('process-kill-broad', killSeverity(target), 'process', target, 'name')
  }
  if (first === 'pkill') {
    if (hasAny(flagSet(words), 'x', 'exact')) return null
    const target = words.slice(1).find((word) => !word.startsWith('-'))
    if (target === undefined) return null
    return match('process-kill-broad', killSeverity(target), 'process', target, 'pattern')
  }
  return null
}

/** Match a shell read, copy, or transfer of a credential file. */
function detectSecretRead(segment: string): Match | null {
  if (!READ_AT_START.test(segment)) return null
  const words = tokens(segment)
  const start = words[0]?.toLowerCase() === 'sudo' ? 1 : 0
  const verb = words[start]?.toLowerCase() ?? ''
  const args = words.slice(start + 1)

  if (COPY_VERBS.has(verb)) {
    // Only the source matters: copying an example into `.env` is routine.
    const source = args.find((word) => !isFlag(word))
    if (source === undefined || !isSensitivePath(source)) return null
    return match('secret-read', 'warning', 'secrets', baseName(source), 'copy')
  }
  const candidates = TRANSFER_VERBS.has(verb) ? args : args.filter((word) => !isFlag(word))
  for (const word of candidates) {
    if (!isSensitivePath(word)) continue
    return TRANSFER_VERBS.has(verb)
      ? match('secret-read', 'critical', 'secrets', baseName(word), 'transfer')
      : match('secret-read', 'critical', 'secrets', baseName(word), 'shell')
  }
  return null
}

/** Drop the quoting SQL uses around identifiers so the name reads plainly. */
function sqlName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.replace(/^[`"[\]]+|[`"[\]]+$/g, '')
  return trimmed === '' ? undefined : trimmed
}

/** Match dropping or emptying database objects. */
function detectDatabase(segment: string): Match | null {
  if (!SQL_CLIENT.test(segment)) return null
  const drop = /\bdrop\s+(?:table|database|schema)\s+(?:if\s+exists\s+)?([\w."`[\]]+)/i.exec(segment)
  if (drop !== null) return match('db-destructive', 'critical', 'database', sqlName(drop[1]), 'drop')
  const truncate = /\btruncate\s+(?:table\s+)?([\w."`[\]]+)/i.exec(segment)
  if (truncate !== null) return match('db-destructive', 'critical', 'database', sqlName(truncate[1]), 'truncate')
  const remove = /\bdelete\s+from\s+([\w."`[\]]+)([^;]*)/i.exec(segment)
  if (remove !== null && !/\bwhere\b/i.test(remove[2] ?? '')) {
    return match('db-destructive', 'critical', 'database', sqlName(remove[1]), 'delete-all')
  }
  if (/\bdropdatabase\s*\(\s*\)/i.test(segment)) {
    return match('db-destructive', 'critical', 'database', undefined, 'drop-database')
  }
  return null
}

/** Match elevated execution, broad permissions, and persistent global changes. */
function detectSystem(segment: string): Match[] {
  const out: Match[] = []
  const words = tokens(segment)
  const first = words[0]?.toLowerCase() ?? ''

  // A plain `sudo` is common for installs; the inner command gets its own rule.
  if (first === 'sudo' || first === 'runas') {
    out.push(match('system-privilege', 'notice', 'system', first === 'sudo' ? 'root' : 'administrator', first))
  }
  if (first === 'start-process' && /-verb\s+runas/i.test(segment)) {
    out.push(match('system-privilege', 'notice', 'system', 'administrator', 'runas'))
  }
  if (/^(?:sudo\s+)?chmod\s+(?:-r\s+)?0?777\b/i.test(segment)) {
    out.push(match('permission-open', 'warning', 'system', '777', 'chmod'))
  }
  if (/^(?:sudo\s+)?icacls\b/i.test(segment) && /\/grant\b/i.test(segment) && /\beveryone\b/i.test(segment)) {
    out.push(match('permission-open', 'warning', 'system', 'Everyone', 'icacls'))
  }

  const gitConfig = /^(?:sudo\s+)?git\s+config\s+--(?:global|system)\s/i.test(segment)
  if (gitConfig && /(credential|url\.|https?\.|proxy|hookspath|sshcommand)/i.test(segment)) {
    const key = /(credential[.\w-]*|url\.[\w.-]+|https?\.[\w.-]+|proxy|core\.hookspath|core\.sshcommand)/i.exec(segment)
    out.push(match('global-config', 'warning', 'system', key?.[0], 'git'))
  }
  const managerConfig = /^(?:sudo\s+)?(?:npm|pnpm|yarn)\s+config\s+set\s+(\S+)/i.exec(segment)
  if (managerConfig !== null) {
    out.push(match('global-config', 'warning', 'system', managerConfig[1], 'package-manager'))
  }
  const setx = /^(?:sudo\s+)?setx\s+([A-Za-z_]\w*)/i.exec(segment)
  if (setx !== null) {
    out.push(match('global-config', 'warning', 'system', setx[1], 'environment'))
  }
  if (/^(?:\[Environment\]::SetEnvironmentVariable)/i.test(segment)) {
    out.push(match('global-config', 'warning', 'system', undefined, 'environment'))
  }
  if (/^(?:sudo\s+)?(?:npm|pnpm)\s+(?:i|install|add)\s+(?:-g|--global)\b/i.test(segment) ||
      /^(?:sudo\s+)?yarn\s+global\s+add\b/i.test(segment)) {
    out.push(match('global-install', 'notice', 'system', undefined, 'package-manager'))
  }
  if (/^(?:sudo\s+)?docker\s+(system|volume|image|container|builder)\s+prune\b/i.test(segment)) {
    const kind = /^(?:sudo\s+)?docker\s+(system|volume|image|container|builder)\s+prune\b/i.exec(segment)
    out.push(match('docker-prune', 'warning', 'system', kind?.[1], kind?.[1]))
  }
  if (/^(?:format\s+[a-z]:|mkfs(?:\.\w+)?\s|diskpart\b[\s\S]*\bclean\b)/i.test(segment)) {
    const drive = /^format\s+([a-z]:)/i.exec(segment)
    out.push(match('disk-format', 'critical', 'system', drive?.[1], 'disk'))
  }
  return out
}

/** Match a remote script piped straight into a shell. */
function detectPipeToShell(segment: string): Match | null {
  if (/^(?:sudo\s+)?(?:curl|wget|invoke-webrequest|iwr|invoke-restmethod|irm)\b[^|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|fish|node|python\d?|iex|invoke-expression)\b/i.test(segment)) {
    const host = /(?:https?:\/\/)([^/\s"']+)/i.exec(segment)
    return match('pipe-to-shell', 'critical', 'network', host?.[1], 'pipe')
  }
  return null
}

/** The payload of `bash -c "…"` / `pwsh -Command "…"`, when written that way. */
function nestedCommand(segment: string): string | null {
  const words = tokens(segment)
  const start = words[0]?.toLowerCase() === 'sudo' ? 1 : 0
  const shell = words[start]?.toLowerCase() ?? ''
  if (!['bash', 'sh', 'zsh', 'pwsh', 'powershell'].includes(shell)) return null
  const flag = words.findIndex((word, index) => index > start && /^-(?:c|command)$/i.test(word))
  if (flag === -1) return null
  const payload = words[flag + 1]
  return payload === undefined || payload.trim() === '' ? null : payload
}

/** Every rule that applies to one shell segment. */
function matchSegment(segment: string, cwd: string, platform: string, depth = 1): Match[] {
  const out: Match[] = []
  const remove = detectDelete(segment, cwd, platform)
  if (remove !== null) out.push(remove)
  const git = detectGit(segment)
  if (git !== null) out.push(git)
  const kill = detectProcessKill(segment)
  if (kill !== null) out.push(kill)
  const secret = detectSecretRead(segment)
  if (secret !== null) out.push(secret)
  const database = detectDatabase(segment)
  if (database !== null) out.push(database)
  out.push(...detectSystem(segment))
  const pipe = detectPipeToShell(segment)
  if (pipe !== null) out.push(pipe)
  if (depth > 0) {
    const nested = nestedCommand(segment)
    if (nested !== null) out.push(...matchSegment(nested, cwd, platform, depth - 1))
  }
  return out
}

/** A tool call and the result that answered it. */
interface Call {
  readonly name: string
  readonly args: Record<string, unknown>
  readonly turn: number
  readonly seq: number
  readonly time: number
  readonly outcome: Outcome
}

/** Mutable accumulator; the wire type is readonly. */
interface Accumulator {
  readonly key: string
  readonly rule: RuleId
  readonly severity: Severity
  readonly category: Category
  readonly kind: 'command' | 'file'
  readonly command?: string
  readonly path?: string
  readonly target?: string
  readonly variant?: string
  readonly outcome: Outcome
  readonly turn: number
  lastTurn: number
  readonly seq: number
  readonly time: number
  occurrences: number
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, notice: 2 }
const OUTCOME_RANK: Record<Outcome, number> = { succeeded: 0, unknown: 1, failed: 2 }

/** Scan one session log for dangerous actions. */
export function scanSession(header: RawHeader, events: readonly RawEvent[], options: ScanOptions): LighthouseReport {
  const redactor = new Redactor(options.redactSecrets)
  const clip = (value: string | undefined, limit: number): string => redactor.clip(value, limit) ?? ''
  const ordered = [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

  const results = new Map<string, { isError: boolean; errorName?: string }>()
  for (const event of ordered) {
    if (event.type !== 'tool/result') continue
    const data = dict(event.data)
    const callId = str(dict(dict(data.message).source).callId)
    if (callId === undefined) continue
    const body = resultBody(data)
    const error = dict(data.error)
    results.set(callId, {
      isError: body.isError || Object.keys(error).length > 0,
      ...(str(error.name) === undefined ? {} : { errorName: str(error.name) }),
    })
  }

  const calls: Call[] = []
  let firstPrompt = ''
  let sessionTitle = ''
  let turn = 1
  let endedAt = Math.max(0, Math.floor(header.createdAt))
  let throughSeq = 0

  for (const event of ordered) {
    const at = Math.max(0, Math.floor(event.time ?? endedAt))
    if (at > endedAt) endedAt = at
    if ((event.seq ?? 0) > throughSeq) throughSeq = event.seq ?? 0
    const data = dict(event.data)
    if (event.type === 'turn/start') {
      turn = Math.max(0, Math.floor(num(data.turn) ?? turn + 1))
      continue
    }
    if (event.type === 'user/message') {
      if (firstPrompt === '') firstPrompt = textOf(list(data.content))
      continue
    }
    if (event.type === 'session/title') {
      const title = str(data.title)
      if (title !== undefined && title.trim() !== '') sessionTitle = title
      continue
    }
    if (event.type !== 'tool/call') continue
    const name = str(data.name)
    if (name === undefined || name === '') continue
    const callId = str(data.callId)
    const answered = callId === undefined ? undefined : results.get(callId)
    const outcome: Outcome = answered === undefined
      ? 'unknown'
      : answered.isError || answered.errorName !== undefined ? 'failed' : 'succeeded'
    calls.push({
      name,
      args: parseArgs(str(data.arguments)),
      turn,
      seq: event.seq ?? 0,
      time: at,
      outcome,
    })
  }

  const cwd = header.cwd ?? ''
  const accumulators = new Map<string, Accumulator>()
  const safeCache = new Map<string, string>()
  let commandCount = 0
  let fileOps = 0

  /** Clip and redact a repeated string only once, so counters stay honest. */
  const safe = (value: string, limit: number): string => {
    const key = `${limit}\u0000${value}`
    const seen = safeCache.get(key)
    if (seen !== undefined) return seen
    const text = clip(value, limit)
    safeCache.set(key, text)
    return text
  }

  /** Add one match to the accumulator, merging an identical earlier occurrence. */
  const record = (
    m: Match,
    call: Call,
    evidence: { command?: string; path?: string },
  ): void => {
    const command = evidence.command
    const path = evidence.path
    const target = m.target === undefined ? undefined : safe(m.target, LIMIT.target)
    const key = [m.rule, m.variant ?? '', call.outcome, command ?? '', path ?? '', target ?? ''].join('\u0000')
    const seen = accumulators.get(key)
    if (seen !== undefined) {
      seen.occurrences += 1
      if (call.turn > seen.lastTurn) seen.lastTurn = call.turn
      return
    }
    accumulators.set(key, {
      key,
      rule: m.rule,
      severity: m.severity,
      category: m.category,
      kind: command === undefined ? 'file' : 'command',
      ...(command === undefined || command === '' ? {} : { command }),
      ...(path === undefined || path === '' ? {} : { path }),
      ...(target === undefined || target === '' ? {} : { target }),
      ...(m.variant === undefined ? {} : { variant: m.variant }),
      outcome: call.outcome,
      turn: call.turn,
      lastTurn: call.turn,
      seq: call.seq,
      time: call.time,
      occurrences: 1,
    })
  }

  for (const call of calls) {
    if (call.name === 'bash' || call.name === 'pwsh') {
      commandCount += 1
      const raw = str(call.args.command)
      if (raw === undefined || raw.trim() === '') continue
      const command = safe(raw, LIMIT.command)
      for (const segment of segments(raw)) {
        for (const m of matchSegment(segment, cwd, options.platform)) record(m, call, { command })
      }
      continue
    }
    if (call.name !== 'read' && call.name !== 'edit' && call.name !== 'write') continue
    fileOps += 1
    const path = str(call.args.file_path)
    if (path === undefined || path.trim() === '' || !isSensitivePath(path)) continue
    const display = safe(displayPath(cwd, path, options.platform), LIMIT.path)
    if (call.name === 'read') {
      record(match('secret-file-read', 'critical', 'secrets', baseName(path), 'file-tool'), call, { path: display })
    } else {
      record(match('secret-file-write', 'warning', 'secrets', baseName(path), 'file-tool'), call, { path: display })
    }
  }

  const all = [...accumulators.values()].sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    OUTCOME_RANK[a.outcome] - OUTCOME_RANK[b.outcome] ||
    a.seq - b.seq)
  const shown = all.slice(0, options.maxFindings)

  const safeGoal = inline(safe(firstPrompt, LIMIT.goal), LIMIT.goal)
  const safeTitle = sessionTitle === '' ? safeGoal : inline(safe(sessionTitle, LIMIT.title), LIMIT.title)

  const findings: Finding[] = shown.map((item, index) => ({
    id: `f-${item.seq}-${index + 1}`,
    rule: item.rule,
    severity: item.severity,
    category: item.category,
    kind: item.kind,
    ...(item.command === undefined ? {} : { command: item.command }),
    ...(item.path === undefined ? {} : { path: item.path }),
    ...(item.target === undefined ? {} : { target: item.target }),
    ...(item.variant === undefined ? {} : { variant: item.variant }),
    outcome: item.outcome,
    occurrences: item.occurrences,
    turn: item.turn,
    lastTurn: item.lastTurn,
    seq: item.seq,
    time: item.time,
  }))

  return {
    sessionId: header.id,
    title: safeTitle,
    goal: safeGoal,
    cwd: inline(safe(cwd, LIMIT.cwd), LIMIT.cwd),
    startedAt: Math.max(0, Math.floor(header.createdAt)),
    endedAt,
    generatedAt: options.now,
    throughSeq,
    findings,
    counts: {
      events: ordered.length,
      calls: calls.length,
      commands: commandCount,
      fileOps,
      findings: all.length,
      critical: all.filter((item) => item.severity === 'critical').length,
      warning: all.filter((item) => item.severity === 'warning').length,
      notice: all.filter((item) => item.severity === 'notice').length,
      rules: RULE_IDS.length,
    },
    redaction: redactor.summary(),
    truncated: all.length > shown.length,
  }
}
