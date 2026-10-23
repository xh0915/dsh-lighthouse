/**
 * Contract test for the browser half.
 *
 * A fake ClientContext stands in for the DSH web shell so the injected tab, the
 * dictionaries, the Remote mount and the action routing are pinned here instead
 * of being discovered at boot. The cast at `apply` is deliberate: this harness
 * implements only the members the entry touches.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { apply, inject } from '../src/client/index.tsx'
import { zh, type Translate } from '../src/client/locales.ts'
import { localizeScanError } from '../src/client/errors.ts'
import { DSH_LIGHTHOUSE_INVOCATIONS } from '../src/contract.ts'
import type { LighthouseActions } from '../src/client/view.tsx'
import { scanSample } from './sample.ts'

/** Slot payload the view is composed from. */
interface SlotPayload {
  actions: LighthouseActions
  t: Translate
}

/** Props the fake render accepts; the view reads `sessionId`, `actions` and `t`. */
interface RenderProps extends SlotPayload {
  sessionId?: string
}

/** Registration recorded from the harness. */
interface Registration {
  def: { name: string; id: string; order: number; label: () => string; inject: () => SlotPayload }
  render: (props: RenderProps) => ReactElement
}

/** Locale dictionaries recorded from the harness. */
type Dictionaries = Record<'zh' | 'en', Record<string, string>>

interface StyleElement { id: string; textContent: string }
interface Effect { name: string; fn: () => unknown }
interface RemoteContribution { package: string; descriptors: readonly unknown[] }

/** The bound translator the client locale service hands back: flat zh keys. */
function makeTranslator(): Translate {
  const translate = (key: string, params?: Record<string, string | number | undefined>): string =>
    (zh as unknown as Record<string, string>)[key]
      .replace(/\{(\w+)\}/g, (marker, name: string) => String(params?.[name] ?? marker))
  return translate as unknown as Translate
}

/** Build a harness plus the context object the entry is handed. */
function makeHarness() {
  const styles: StyleElement[] = []
  const effects: Effect[] = []
  const mounts: RemoteContribution[] = []
  const injected: Array<{ name: string; factory: () => void }> = []
  const reflectNames: string[] = []
  let dictionaries: Dictionaries | undefined
  let registered: Registration | undefined
  const remoteFace = {
    scan: async (sessionId: string) => ({ ok: true, value: { ...scanSample(), sessionId } }),
  }
  let reflectHit: unknown = remoteFace

  const ctx = {
    effect(fn: () => unknown, name: string) {
      effects.push({ name, fn })
    },
    locale: {
      register: (ns: string, dicts: Dictionaries) => {
        dictionaries = dicts
        return `undo:${ns}`
      },
      bind: () => makeTranslator(),
    },
    reflect: {
      get: (name: string) => {
        reflectNames.push(name)
        return reflectHit
      },
    },
    remote: {
      $mount: async (contribution: RemoteContribution) => {
        mounts.push(contribution)
        return () => undefined
      },
    },
    slots: {
      inject: (name: string, factory: () => void) => { injected.push({ name, factory }) },
      register: (def: Registration['def'], render: Registration['render']) => {
        registered = { def, render }
        return 'undo-slot'
      },
    },
  }

  const document = {
    getElementById: (id: string) => styles.find((element) => element.id === id) ?? null,
    createElement: () => ({ id: '', textContent: '' }) as StyleElement,
    head: { appendChild: (element: StyleElement) => styles.push(element) },
  }

  return {
    ctx,
    styles,
    effects,
    mounts,
    injected,
    reflectNames,
    document,
    dictionaries: () => dictionaries,
    registered: () => registered,
    setReflect: (value: unknown) => { reflectHit = value },
    runAll: async () => { for (const effect of effects) await effect.fn() },
  }
}

type Harness = ReturnType<typeof makeHarness>

describe('client entry', () => {
  let harness: Harness
  let globalDocument: unknown

  beforeEach(() => {
    globalDocument = (globalThis as { document?: unknown }).document
    harness = makeHarness()
    ;(globalThis as { document?: unknown }).document = harness.document
    apply(harness.ctx as unknown as Parameters<typeof apply>[0])
  })

  afterEach(() => {
    ;(globalThis as { document?: unknown }).document = globalDocument
  })

  it('declares exactly the services it injects', () => {
    expect(inject).toEqual(['slots', 'remote', 'locale'])
  })

  it('paints its own stylesheet once', () => {
    expect(harness.styles).toHaveLength(1)
    expect(harness.styles[0]?.id).toBe('dsh-lighthouse-styles')
    const css = harness.styles[0]?.textContent ?? ''
    expect(css).toContain('.l-root')
    expect(css).toContain('.l-hero')
    expect(css).toContain('.l-cards')
    expect(css).toContain('body[data-ds-dark-theme]')
    apply(harness.ctx as unknown as Parameters<typeof apply>[0])
    expect(harness.styles).toHaveLength(1)
  })

  it('registers both dictionaries with identical keys', async () => {
    await harness.runAll()
    const dicts = harness.dictionaries()
    expect(Object.keys(dicts ?? {}).sort()).toEqual(['en', 'zh'])
    const keys = Object.keys(dicts?.zh ?? {}).sort()
    expect(Object.keys(dicts?.en ?? {}).sort()).toEqual(keys)
    expect(keys.length).toBeGreaterThan(150)
  })

  it('injects exactly one lighthouse tab into the conversation view ring', () => {
    expect(harness.injected.map((entry) => entry.name)).toEqual(['conversation.view'])
    expect(harness.registered()).toBeUndefined()
    harness.injected[0]?.factory()
    expect(harness.registered()?.def).toMatchObject({ name: 'conversation.view', id: 'lighthouse', order: 32 })
    expect(harness.registered()?.def.label()).toBe(zh['view.label'])
  })

  it('mounts the remote through the descriptors shared with the host', async () => {
    await harness.runAll()
    expect(harness.mounts).toHaveLength(1)
    expect(harness.mounts[0]?.package).toBe('dsh-lighthouse')
    expect(harness.mounts[0]?.descriptors).toBe(DSH_LIGHTHOUSE_INVOCATIONS)
    expect(harness.reflectNames).toContain('remote.lighthouse')
  })

  it('refuses to mount when the host contributed no lighthouse namespace', async () => {
    harness.setReflect(undefined)
    await expect(harness.effects[1]?.fn()).rejects.toThrow(/did not mount/)
  })

  it('routes the scan action onto the mounted remote', async () => {
    await harness.runAll()
    harness.injected[0]?.factory()
    const actions = harness.registered()!.def.inject().actions
    await expect(actions.scan('session-01hlighthouse')).resolves.toMatchObject({
      ok: true,
      value: { sessionId: 'session-01hlighthouse', counts: { findings: 7 } },
    })
  })

  it('reports honestly while the remote namespace is not mounted yet', async () => {
    harness.injected[0]?.factory()
    const actions = harness.registered()!.def.inject().actions
    await expect(actions.scan('session-01hlighthouse')).resolves.toMatchObject({
      ok: false,
      error: { message: zh['state.notMounted'] },
    })
  })

  it('renders the tab in its loading phase', async () => {
    await harness.runAll()
    harness.injected[0]?.factory()
    const { def, render } = harness.registered()!
    const markup = renderToStaticMarkup(render({ sessionId: 'session-01hlighthouse', ...def.inject() }))
    expect(markup).toContain('l-root')
    expect(markup).toContain(zh['state.loading'])
  })

  it('translates the four host error codes and passes anything else through', () => {
    expect(localizeScanError('LIGHTHOUSE_NO_LOG|missing', makeTranslator())).toBe(zh['error.noLog'])
    expect(localizeScanError('LIGHTHOUSE_ABORTED|', makeTranslator())).toBe(zh['error.aborted'])
    expect(localizeScanError('LIGHTHOUSE_BAD_LOG|bad', makeTranslator())).toBe(zh['error.badLog'])
    expect(localizeScanError('LIGHTHOUSE_UNREADABLE|denied', makeTranslator())).toBe(zh['error.unreadable'])
    expect(localizeScanError('something else broke', makeTranslator())).toBe('something else broke')
  })
})
