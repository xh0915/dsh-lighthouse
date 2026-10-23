/**
 * dsh-lighthouse — Client plugin entry (browser half).
 *
 * Mounts the lighthouse Remote namespace, registers the dictionaries, injects
 * one tab into the conversation view ring, and paints the styles the tab needs.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DSH_LIGHTHOUSE_REMOTE } from './remote.ts'
import { NS, en, zh } from './locales.ts'
import { LighthouseView, type LighthouseActions, type LighthouseViewSlotProps } from './view.tsx'
import type { LighthouseReport } from '../schema.ts'
import { adoptStyles } from './styles.ts'

/** Required services: the Remote gateway, locale, and slots. */
export const inject = ['slots', 'remote', 'locale']

type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { message: string } }

/** Compose the lighthouse tab. @param ctx - client root context. */
export function apply(ctx: ClientContext): void {
  adoptStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-lighthouse: dictionaries')

  let lighthouse: unknown
  const t = ctx.locale.bind(NS)

  ctx.effect(async () => {
    const dispose = await ctx.remote.$mount(DSH_LIGHTHOUSE_REMOTE)
    lighthouse = (ctx.reflect as unknown as { get(name: string): unknown }).get('remote.lighthouse')
    if (lighthouse === undefined) throw new Error('dsh-lighthouse: the lighthouse Remote namespace did not mount')
    return () => { lighthouse = undefined; void dispose }
  }, 'dsh-lighthouse: remote')

  const actions: LighthouseActions = {
    scan: (sessionId: string) => {
      const fn = lighthouse === undefined
        ? undefined
        : (lighthouse as Record<string, unknown>).scan
      if (typeof fn !== 'function') {
        return Promise.resolve<RemoteResult<LighthouseReport>>({ ok: false, error: { message: t('state.notMounted') } })
      }
      return (fn as LighthouseActions['scan'])(sessionId)
    },
  }

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'lighthouse',
    order: 32,
    label: () => t('view.label'),
    inject: () => ({ actions, t }),
  }, (props: LighthouseViewSlotProps) => <LighthouseView {...props} />))
}
