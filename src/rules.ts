/**
 * dsh-lighthouse — The closed rule catalogue.
 *
 * Shared by the host detector, the Zod schema, and the browser copy table. Keep
 * it dependency-free: the browser imports this file, and Zod must stay on the
 * host.
 */
export const RULE_IDS = [
  'delete-recursive',
  'git-clean',
  'git-reset-hard',
  'git-discard',
  'git-force-push',
  'process-kill-broad',
  'secret-read',
  'secret-file-read',
  'secret-file-write',
  'db-destructive',
  'system-privilege',
  'permission-open',
  'global-config',
  'global-install',
  'docker-prune',
  'pipe-to-shell',
  'disk-format',
] as const

export type RuleId = (typeof RULE_IDS)[number]
