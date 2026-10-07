import Link from "next/link";
import Sello from "@/components/brand/Sello";

/**
 * Sistema de lockups del cónsul creativo (sesión logo).
 * lockup:
 *  - h  header / PDF (sello + wordmark horizontal) — default
 *  - s  stacked (sello arriba)
 *  - w  solo wordmark (cuando hay escudos de IES al lado)
 *  - i  solo sello (favicon / avatar)
 */
export type BrandLockup = "h" | "s" | "w" | "i";

export default function BrandMark({
  lockup = "h",
  inverse = false,
  href = "/",
  size = 28,
  className = "",
}: {
  lockup?: BrandLockup;
  inverse?: boolean;
  href?: string | null;
  size?: number;
  className?: string;
}) {
  // Tinta vs papel según fondo (L-INV).
  const busco = inverse ? "text-white" : "text-buscoedu-ink";
  const edu = inverse ? "text-teal-200" : "text-buscoedu-action";

  const word = (
    <span className="font-sans text-xl font-bold tracking-tight">
      <span className={busco}>Busco</span>
      <span className={edu}>Edu</span>
    </span>
  );

  const inner =
    lockup === "i" ? (
      <Sello size={size} />
    ) : lockup === "w" ? (
      word
    ) : lockup === "s" ? (
      <span className="inline-flex flex-col items-center gap-1">
        <Sello size={size} />
        {word}
      </span>
    ) : (
      <span className="inline-flex items-center gap-2">
        <Sello size={size} />
        {word}
      </span>
    );

  if (!href) {
    return <span className={className}>{inner}</span>;
  }

  return (
    <Link
      href={href}
      className={`inline-flex items-center transition hover:opacity-90 ${className}`}
      aria-label="BuscoEdu — inicio"
    >
      {inner}
    </Link>
  );
}
