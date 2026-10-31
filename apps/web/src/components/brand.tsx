import Image from "next/image";
import Link from "next/link";
import { cx } from "./ui";

/**
 * The official BBCare identity. One place for every logo reference so the same assets are used
 * throughout the site: the transparent character for light backgrounds, the original tile for dark
 * ones, the horizontal lock-up in navigation. Images keep their aspect ratio (object-fit: contain).
 */
export const BRAND = {
  icon: "/brand/bbcare-logo-icon.png",
  transparent: "/brand/bbcare-logo-transparent.png",
  horizontal: "/brand/bbcare-logo-horizontal.png",
  horizontalDark: "/brand/bbcare-logo-horizontal-dark.png",
  dark: "/brand/bbcare-logo-dark.png",
  appIcon: "/brand/bbcare-app-icon.png",
  favicon: "/brand/bbcare-favicon.png",
} as const;

export function BrandIcon({ size = 40, className, priority = false, onDark = false }: { size?: number; className?: string; priority?: boolean; onDark?: boolean }) {
  return <Image src={onDark ? BRAND.dark : BRAND.icon} alt="" width={size} height={size} priority={priority} className={cx("object-contain", className)} />;
}

/** Horizontal lock-up (icon plus wordmark). The icon alone is used at narrow widths. */
export function BrandLogo({ href, label, className, compact = false, onDark = false }: { href: string; label: string; className?: string; compact?: boolean; onDark?: boolean }) {
  return (
    <Link href={href} aria-label={label} className={cx("inline-flex items-center", className)}>
      <Image src={onDark ? BRAND.horizontalDark : BRAND.horizontal} alt="BBCare" width={160} height={44} priority className={cx("h-10 w-auto object-contain", compact ? "hidden sm:block" : "")} />
      {compact ? <Image src={BRAND.icon} alt="BBCare" width={40} height={40} priority className="h-10 w-10 object-contain sm:hidden" /> : null}
    </Link>
  );
}

/** Small round avatar used in chat bubbles and welcome states. */
export function BrandAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-line", className)} style={{ width: size, height: size }}>
      <Image src={BRAND.icon} alt="" width={size - 6} height={size - 6} className="object-contain" />
    </span>
  );
}
