import Image from "next/image"
import { getTenantBranding } from "@/config/tenant"

interface BrandLogoProps {
  variant?: "navbar" | "hero"
  surface?: "light" | "dark"
  className?: string
  priority?: boolean
  emphasized?: boolean
}

export default function BrandLogo({
  variant = "navbar",
  surface,
  className,
  priority = true,
  emphasized = false,
}: BrandLogoProps) {
  const branding = getTenantBranding()
  const resolvedSurface = surface || (variant === "navbar" ? "dark" : "light")
  const surfaceSrc = resolvedSurface === "dark" ? branding.logo.onDark : branding.logo.onLight
  const src = variant === "hero" ? branding.logo.hero || surfaceSrc : surfaceSrc
  const markSrc = branding.logo.mark
  const alt = `${branding.siteName} logo`
  const defaultClassName = variant === "hero"
    ? "h-auto w-full max-w-[320px]"
    : emphasized
      ? "h-20 w-auto drop-shadow-[0_2px_10px_rgba(255,255,255,0.3)]"
      : "h-14 w-auto"
  const maxHeight = variant === "hero" ? "112px" : emphasized ? "80px" : "56px"

  if (variant === "navbar" && markSrc) {
    return (
      <div className={className || "flex items-center gap-3"}>
        <Image
          src={markSrc}
          alt={`${branding.siteName} mark`}
          width={112}
          height={112}
          className="h-11 w-auto sm:hidden"
          style={{ width: "auto", height: "auto", maxHeight: "44px" }}
          priority={priority}
        />
        <Image
          src={src}
          alt={alt}
          width={440}
          height={120}
          className={emphasized ? "hidden h-16 w-auto sm:block sm:h-20 drop-shadow-[0_2px_10px_rgba(255,255,255,0.3)]" : "hidden h-12 w-auto sm:block sm:h-14"}
          style={{ width: "auto", height: "auto", maxHeight }}
          priority={priority}
        />
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={variant === "hero" ? 320 : 220}
      height={variant === "hero" ? 120 : 56}
      className={className || defaultClassName}
      style={{ width: "auto", height: "auto", maxHeight }}
      priority={priority}
    />
  )
}
