interface BrandLogoProps {
  href?: string
  className?: string
  imageClassName?: string
  showName?: boolean
  nameClassName?: string
  priority?: boolean
}

export function BrandLogo({
  href = "#top",
  className = "",
  imageClassName = "",
  showName = false,
  nameClassName = "",
  priority = false,
}: BrandLogoProps) {
  const logo = (
    <>
      <img
        src="/favicon.svg"
        alt="One Tap"
        width={180}
        height={60}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className={imageClassName}
      />
      {showName && (
        <span className={nameClassName}>One Tap</span>
      )}
    </>
  )

  if (!href) {
    return logo
  }

  return (
    <a className={className} href={href} aria-label="One tap">
      {logo}
    </a>
  )
}
