import type { Locale } from "@/lib/i18n/types"

export const TELEGRAM_URL = "https://t.me/onetappy_global_partner_channel"
export const DISCORD_URL = "https://discord.com/invite/9Thj5CeBNw"
export const X_URL = "https://x.com/onetappy"
export const MEDIUM_URL =
  "https://medium.com/@onetappy/why-im-building-onetappy-transparent-raffles-one-tap-entry-and-partner-first-economics-831e2334f034"

const DOCS_ROOT_URL = "https://onetappy.gitbook.io/docs"
const DOCS_VI_ROOT_URL = "https://onetappy.gitbook.io/docs/docs-vi"

export function getDocsUrl(locale: Locale): string {
  return locale === "vi" ? DOCS_VI_ROOT_URL : DOCS_ROOT_URL
}

export function getContractsDocsUrl(locale: Locale): string {
  return `${getDocsUrl(locale)}/onetappy-docs`
}
