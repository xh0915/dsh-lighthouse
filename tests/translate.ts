/**
 * Test translator: resolves flat zh keys the way the shell's locale service does,
 * including `{name}` interpolation.
 */
import { zh, type Translate } from '../src/client/locales.ts'

export function makeTranslator(): Translate {
  const translate = (key: string, params?: Record<string, string | number | undefined>): string =>
    (zh as unknown as Record<string, string>)[key]
      .replace(/\{(\w+)\}/g, (marker, name: string) => String(params?.[name] ?? marker))
  return translate as unknown as Translate
}
