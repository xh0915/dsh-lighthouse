/**
 * dsh-lighthouse — Host error codes, translated in the browser.
 *
 * The host answers in stable `LIGHTHOUSE_…|detail` codes instead of prose, so
 * the view can show the same failure in the user's language while still
 * surfacing the raw detail for anything unexpected.
 */
import type { Translate } from './locales.ts'

/** Translate a `lighthouse.scan` failure; unknown messages pass through. */
export function localizeScanError(message: string, t: Translate): string {
  const [code = ''] = message.split('|')
  switch (code) {
    case 'LIGHTHOUSE_NO_LOG': return t('error.noLog')
    case 'LIGHTHOUSE_ABORTED': return t('error.aborted')
    case 'LIGHTHOUSE_BAD_LOG': return t('error.badLog')
    case 'LIGHTHOUSE_UNREADABLE': return t('error.unreadable')
    default: return message
  }
}
