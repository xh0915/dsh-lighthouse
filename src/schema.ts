/**
 * dsh-lighthouse — The single wire authority.
 *
 * Everything that crosses the host/client Remote boundary is declared here as a
 * strict Zod schema, and the TypeScript types are inferred from it, so the
 * detector, the Typert descriptors, and the browser view cannot drift. The
 * browser imports these types only, so Zod stays on the host.
 */
import { z } from 'zod'
import { RULE_IDS, type RuleId } from './rules.ts'

export type { RuleId }

/** How much a finding deserves attention. */
export const SeveritySchema = z.enum(['critical', 'warning', 'notice'])
export type Severity = z.infer<typeof SeveritySchema>

/** What kind of action the finding is about. */
export const CategorySchema = z.enum(['delete', 'git', 'process', 'secrets', 'system', 'database', 'network'])
export type Category = z.infer<typeof CategorySchema>

/** The closed rule catalogue. The view localizes these ids; the host never sends prose. */
export const RuleIdSchema = z.enum(RULE_IDS)

/** Whether the action actually happened, failed, or is still unknown. */
export const OutcomeSchema = z.enum(['succeeded', 'failed', 'unknown'])
export type Outcome = z.infer<typeof OutcomeSchema>

/** One dangerous action found in the session. */
export const FindingSchema = z.object({
  /** Stable per report, e.g. `f-42-1`. */
  id: z.string().min(1).max(40),
  rule: RuleIdSchema,
  severity: SeveritySchema,
  category: CategorySchema,
  /** `command` for a shell action, `file` for a file tool. */
  kind: z.enum(['command', 'file']),
  /** The command as logged, redacted and capped. */
  command: z.string().min(1).max(1200).optional(),
  /** The file a read/write touched, redacted and capped. */
  path: z.string().min(1).max(400).optional(),
  /** The process, drive, table, or path the rule matched, capped for a chip. */
  target: z.string().max(120).optional(),
  /** Rule-specific qualifier, e.g. `broad`, `ignored`, `lease`. */
  variant: z.string().max(40).optional(),
  outcome: OutcomeSchema,
  /** How many identical actions appeared; 1 for a single occurrence. */
  occurrences: z.number().int().min(1),
  /** First turn the action appeared in. */
  turn: z.number().int().min(0),
  /** Last turn the identical action appeared in. */
  lastTurn: z.number().int().min(0),
  /** Raw log seq of the first occurrence — the evidence pointer. */
  seq: z.number().int().min(0),
  /** Source event timestamp, Unix epoch ms. */
  time: z.number().int().min(0),
}).readonly()
export type Finding = z.infer<typeof FindingSchema>

/** Honest counters for the hero strip. */
export const LighthouseCountsSchema = z.object({
  /** Raw log events inspected. */
  events: z.number().int().min(0),
  /** Tool calls seen. */
  calls: z.number().int().min(0),
  /** Shell calls seen. */
  commands: z.number().int().min(0),
  /** File read/edit/write calls seen. */
  fileOps: z.number().int().min(0),
  /** Findings after identical actions were merged. */
  findings: z.number().int().min(0),
  critical: z.number().int().min(0),
  warning: z.number().int().min(0),
  notice: z.number().int().min(0),
  /** How many rules the scan applied. */
  rules: z.number().int().min(0),
}).readonly()
export type LighthouseCounts = z.infer<typeof LighthouseCountsSchema>

/** What the redactor touched while building the report. */
export const LighthouseRedactionSchema = z.object({
  count: z.number().int().min(0),
  kinds: z.array(z.string().max(40)),
  enabled: z.boolean(),
}).readonly()
export type LighthouseRedaction = z.infer<typeof LighthouseRedactionSchema>

/** The report returned by `lighthouse.scan`. */
export const LighthouseReportSchema = z.object({
  sessionId: z.string().min(1).max(200),
  /** Session title or the first prompt, capped for a heading. */
  title: z.string().max(120),
  /** The first user prompt, redacted; what the session set out to do. */
  goal: z.string().max(600),
  cwd: z.string().max(400),
  startedAt: z.number().int().min(0),
  endedAt: z.number().int().min(0),
  generatedAt: z.number().int().min(0),
  throughSeq: z.number().int().min(0),
  findings: z.array(FindingSchema),
  counts: LighthouseCountsSchema,
  redaction: LighthouseRedactionSchema,
  /** True when findings hit the cap and the rest was omitted. */
  truncated: z.boolean(),
}).readonly()
export type LighthouseReport = z.infer<typeof LighthouseReportSchema>
