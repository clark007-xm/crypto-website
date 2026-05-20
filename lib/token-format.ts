import { ZeroAddress, formatUnits, parseUnits } from "ethers"

export function getPaymentTokenSymbol(
  paymentToken?: string | null,
  symbol?: string | null
) {
  if (!paymentToken || paymentToken.toLowerCase() === ZeroAddress.toLowerCase()) {
    return "ETH"
  }
  return symbol?.trim() || "TOKEN"
}

export function toTokenNumber(value: bigint, decimals = 18) {
  return Number(formatUnits(value, decimals))
}

function groupIntegerPart(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

export function formatTokenValue(
  value: bigint,
  decimals = 18,
  fractionDigits = 4
) {
  const rawValue = formatUnits(value, decimals)
  const sign = rawValue.startsWith("-") ? "-" : ""
  const unsignedValue = sign ? rawValue.slice(1) : rawValue
  const [integerPart, decimalPart = ""] = unsignedValue.split(".")
  const groupedInteger = groupIntegerPart(integerPart || "0")

  if (fractionDigits <= 0) {
    return `${sign}${groupedInteger}`
  }

  const fixedDecimal = `${decimalPart}${"0".repeat(fractionDigits)}`.slice(
    0,
    fractionDigits
  )
  return `${sign}${groupedInteger}.${fixedDecimal}`
}

export function formatTokenAmount(
  value: bigint,
  decimals = 18,
  symbol = "TOKEN",
  fractionDigits = 4
) {
  return `${formatTokenValue(value, decimals, fractionDigits)} ${symbol}`
}

export function parseTokenAmount(value: string, decimals = 18) {
  return parseUnits(value, decimals)
}
