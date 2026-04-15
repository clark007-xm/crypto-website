export interface ProductInfoOption {
  id: number
  label: string
  shortLabel: string
}

export const PRODUCT_INFO_OPTIONS: ProductInfoOption[] = [
  { id: 1, label: "iPhone", shortLabel: "IP" },
  { id: 2, label: "Tesla", shortLabel: "TS" },
]

const PRODUCT_INFO_MAP = new Map(
  PRODUCT_INFO_OPTIONS.map((option) => [option.id, option] as const)
)

export function getProductInfoOption(productInfoId: number | bigint | null | undefined) {
  const numericId = Number(productInfoId ?? 0)
  return PRODUCT_INFO_MAP.get(numericId) ?? null
}

export function getProductInfoLabel(productInfoId: number | bigint | null | undefined) {
  return getProductInfoOption(productInfoId)?.label ?? "One Tap Prize"
}

export function getProductInfoShortLabel(productInfoId: number | bigint | null | undefined) {
  return getProductInfoOption(productInfoId)?.shortLabel ?? "OT"
}
