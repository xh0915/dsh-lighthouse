/**
 * dsh-lighthouse — Typed lookups from wire ids to product copy.
 *
 * The host only sends rule ids, severity ids, and variant ids; this file is the
 * single place that maps them onto dictionary keys, so a missing translation is
 * a compile error rather than a raw id rendered in the tab.
 */
import type { Outcome, RuleId, Severity } from '../schema.ts'
import type { Translate } from './locales.ts'

/** Any dictionary key the tab may ask for. */
type Key = Parameters<Translate>[0]

const RULE_LABEL = {
  'delete-recursive': 'rule.delete-recursive.label',
  'git-clean': 'rule.git-clean.label',
  'git-reset-hard': 'rule.git-reset-hard.label',
  'git-discard': 'rule.git-discard.label',
  'git-force-push': 'rule.git-force-push.label',
  'process-kill-broad': 'rule.process-kill-broad.label',
  'secret-read': 'rule.secret-read.label',
  'secret-file-read': 'rule.secret-file-read.label',
  'secret-file-write': 'rule.secret-file-write.label',
  'db-destructive': 'rule.db-destructive.label',
  'system-privilege': 'rule.system-privilege.label',
  'permission-open': 'rule.permission-open.label',
  'global-config': 'rule.global-config.label',
  'global-install': 'rule.global-install.label',
  'docker-prune': 'rule.docker-prune.label',
  'pipe-to-shell': 'rule.pipe-to-shell.label',
  'disk-format': 'rule.disk-format.label',
} satisfies Record<RuleId, Key>

const RULE_WHY = {
  'delete-recursive': 'rule.delete-recursive.why',
  'git-clean': 'rule.git-clean.why',
  'git-reset-hard': 'rule.git-reset-hard.why',
  'git-discard': 'rule.git-discard.why',
  'git-force-push': 'rule.git-force-push.why',
  'process-kill-broad': 'rule.process-kill-broad.why',
  'secret-read': 'rule.secret-read.why',
  'secret-file-read': 'rule.secret-file-read.why',
  'secret-file-write': 'rule.secret-file-write.why',
  'db-destructive': 'rule.db-destructive.why',
  'system-privilege': 'rule.system-privilege.why',
  'permission-open': 'rule.permission-open.why',
  'global-config': 'rule.global-config.why',
  'global-install': 'rule.global-install.why',
  'docker-prune': 'rule.docker-prune.why',
  'pipe-to-shell': 'rule.pipe-to-shell.why',
  'disk-format': 'rule.disk-format.why',
} satisfies Record<RuleId, Key>

const RULE_SAFE = {
  'delete-recursive': 'rule.delete-recursive.safe',
  'git-clean': 'rule.git-clean.safe',
  'git-reset-hard': 'rule.git-reset-hard.safe',
  'git-discard': 'rule.git-discard.safe',
  'git-force-push': 'rule.git-force-push.safe',
  'process-kill-broad': 'rule.process-kill-broad.safe',
  'secret-read': 'rule.secret-read.safe',
  'secret-file-read': 'rule.secret-file-read.safe',
  'secret-file-write': 'rule.secret-file-write.safe',
  'db-destructive': 'rule.db-destructive.safe',
  'system-privilege': 'rule.system-privilege.safe',
  'permission-open': 'rule.permission-open.safe',
  'global-config': 'rule.global-config.safe',
  'global-install': 'rule.global-install.safe',
  'docker-prune': 'rule.docker-prune.safe',
  'pipe-to-shell': 'rule.pipe-to-shell.safe',
  'disk-format': 'rule.disk-format.safe',
} satisfies Record<RuleId, Key>

const VARIANT = {
  broad: 'variant.broad',
  narrow: 'variant.narrow',
  disposable: 'variant.disposable',
  tracked: 'variant.tracked',
  ignored: 'variant.ignored',
  lease: 'variant.lease',
  mirror: 'variant.mirror',
  delete: 'variant.delete',
  force: 'variant.force',
  name: 'variant.name',
  pattern: 'variant.pattern',
  shell: 'variant.shell',
  copy: 'variant.copy',
  transfer: 'variant.transfer',
  'file-tool': 'variant.file-tool',
  drop: 'variant.drop',
  truncate: 'variant.truncate',
  'delete-all': 'variant.delete-all',
  'drop-database': 'variant.drop-database',
  sudo: 'variant.sudo',
  runas: 'variant.runas',
  chmod: 'variant.chmod',
  icacls: 'variant.icacls',
  git: 'variant.git',
  'package-manager': 'variant.package-manager',
  environment: 'variant.environment',
  system: 'variant.system',
  volume: 'variant.volume',
  image: 'variant.image',
  container: 'variant.container',
  builder: 'variant.builder',
  pipe: 'variant.pipe',
  disk: 'variant.disk',
} satisfies Record<string, Key>

const SEVERITY = {
  critical: 'severity.critical',
  warning: 'severity.warning',
  notice: 'severity.notice',
} satisfies Record<Severity, Key>

const SEVERITY_WHY = {
  critical: 'severity.critical.why',
  warning: 'severity.warning.why',
  notice: 'severity.notice.why',
} satisfies Record<Severity, Key>

const OUTCOME = {
  succeeded: 'outcome.succeeded',
  failed: 'outcome.failed',
  unknown: 'outcome.unknown',
} satisfies Record<Outcome, Key>

/** Localized rule name. */
export function ruleLabel(rule: RuleId, t: Translate): string {
  return t(RULE_LABEL[rule])
}

/** Plain-language impact of the rule. */
export function ruleWhy(rule: RuleId, t: Translate): string {
  return t(RULE_WHY[rule])
}

/** What to do instead. */
export function ruleSafe(rule: RuleId, t: Translate): string {
  return t(RULE_SAFE[rule])
}

/** Localized variant chip, or undefined when the host sends an unknown one. */
export function variantLabel(variant: string | undefined, t: Translate): string | undefined {
  if (variant === undefined) return undefined
  const key = (VARIANT as Record<string, Key | undefined>)[variant]
  return key === undefined ? undefined : t(key)
}

/** Localized severity name. */
export function severityLabel(severity: Severity, t: Translate): string {
  return t(SEVERITY[severity])
}

/** Plain-language meaning of a severity. */
export function severityWhy(severity: Severity, t: Translate): string {
  return t(SEVERITY_WHY[severity])
}

/** Localized outcome name. */
export function outcomeLabel(outcome: Outcome, t: Translate): string {
  return t(OUTCOME[outcome])
}
