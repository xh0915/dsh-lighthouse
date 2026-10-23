/**
 * Catalogue tests.
 *
 * The host sends ids only. Every id the detector can emit must resolve to real
 * words in both languages, or the tab would show a raw string like
 * `rule.git-reset-hard.safe` to the reader.
 */
import { describe, expect, it } from 'vitest'
import {
  outcomeLabel,
  ruleLabel,
  ruleSafe,
  ruleWhy,
  severityLabel,
  severityWhy,
  variantLabel,
} from '../src/client/catalog.ts'
import { en } from '../src/client/locales.ts'
import { RULE_IDS, type RuleId } from '../src/rules.ts'
import { scanSample } from './sample.ts'
import { makeTranslator } from './translate.ts'

/** Translator over English, mirroring the test helper used for Chinese. */
function english(): ReturnType<typeof makeTranslator> {
  const translate = (key: string, params?: Record<string, string | number | undefined>): string =>
    (en as unknown as Record<string, string>)[key]
      .replace(/\{(\w+)\}/g, (marker, name: string) => String(params?.[name] ?? marker))
  return translate as unknown as ReturnType<typeof makeTranslator>
}

const zhT = makeTranslator()
const enT = english()

/** Every variant the detector can attach to a finding. */
const VARIANTS = [
  'broad', 'narrow', 'disposable', 'tracked', 'ignored', 'lease', 'mirror', 'delete', 'force',
  'name', 'pattern', 'shell', 'copy', 'transfer', 'file-tool', 'drop', 'truncate', 'delete-all',
  'drop-database', 'sudo', 'runas', 'chmod', 'icacls', 'git', 'package-manager', 'environment',
  'system', 'volume', 'image', 'container', 'builder', 'pipe', 'disk',
] as const

/** Assert one piece of copy is real prose, not the key echoed back. */
function prose(value: string, key: string): void {
  expect(value.length).toBeGreaterThan(1)
  expect(value).not.toBe(key)
  expect(value).not.toContain(key)
}

describe('rule copy', () => {
  it('covers every rule in both languages', () => {
    for (const rule of RULE_IDS) {
      const key = `rule.${rule}.label`
      for (const [language, t] of [['zh', zhT], ['en', enT]] as const) {
        const label = ruleLabel(rule, t)
        prose(label, key)
        expect(ruleWhy(rule, t).length, `${language} ${rule} why`).toBeGreaterThan(10)
        expect(ruleSafe(rule, t).length, `${language} ${rule} safe`).toBeGreaterThan(10)
      }
    }
  })

  it('does not reuse one label for two rules', () => {
    const labels = RULE_IDS.map((rule) => ruleLabel(rule, zhT))
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('actually translates instead of copying the Chinese text', () => {
    const sameLabel = RULE_IDS.filter((rule) => ruleLabel(rule, enT) === ruleLabel(rule, zhT))
    // `git clean` is the command's own name, so it reads the same in both.
    expect(sameLabel).toEqual(['git-clean'])
    for (const rule of RULE_IDS) {
      expect(ruleWhy(rule, enT), rule).not.toBe(ruleWhy(rule, zhT))
      expect(ruleSafe(rule, enT), rule).not.toBe(ruleSafe(rule, zhT))
    }
  })

  it('resolves every rule id the sample emits', () => {
    for (const finding of scanSample().findings) {
      expect(ruleLabel(finding.rule as RuleId, zhT)).not.toContain('rule.')
    }
  })
})

describe('severity and outcome copy', () => {
  it('names each severity and explains it in both languages', () => {
    for (const severity of ['critical', 'warning', 'notice'] as const) {
      expect(severityLabel(severity, zhT)).not.toBe('')
      expect(severityWhy(severity, zhT)).not.toBe('')
      expect(severityLabel(severity, enT)).not.toBe('')
      expect(severityWhy(severity, enT)).not.toBe('')
    }
  })

  it('names each outcome in both languages', () => {
    for (const outcome of ['succeeded', 'failed', 'unknown'] as const) {
      expect(outcomeLabel(outcome, zhT)).not.toBe('')
      expect(outcomeLabel(outcome, enT)).not.toBe('')
    }
    expect(outcomeLabel('failed', zhT)).not.toBe(outcomeLabel('failed', enT))
  })
})

describe('variant chips', () => {
  it('resolves every known variant in both languages', () => {
    for (const variant of VARIANTS) {
      expect(variantLabel(variant, zhT), variant).toBeDefined()
      expect(variantLabel(variant, enT), variant).toBeDefined()
      expect(variantLabel(variant, zhT)).not.toBe('')
    }
  })

  it('hides a variant the browser does not know yet', () => {
    expect(variantLabel('something-new', zhT)).toBeUndefined()
    expect(variantLabel(undefined, zhT)).toBeUndefined()
  })

  it('covers every variant on the sample findings', () => {
    for (const finding of scanSample().findings) {
      if (finding.variant === undefined) continue
      expect(variantLabel(finding.variant, zhT), finding.variant).toBeDefined()
    }
  })
})
