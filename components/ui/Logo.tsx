import BrandMark from "@/components/brand/BrandMark";

/**
 * Compatibilidad: el header y el resto siguen importando Logo.
 * Por dentro usa el lockup horizontal (L-H) del sistema de marca.
 */
export default function Logo({
  className = "",
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return <BrandMark lockup="h" size={size} className={className} />;
}
