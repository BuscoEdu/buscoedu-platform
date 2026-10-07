import type { CifrasCatalogo } from "@/src/lib/cifras-catalogo";
import HardCard from "@/components/restyle/HardCard";
import { cifraPositiva, formatoEntero } from "@/components/restyle/formato";

/**
 * Cifras del catálogo. Si el dato no llega o es 0, esta franja no existe:
 * no se reserva hueco ni se muestra un cero.
 */
export default function HomeCifras({ cifras }: { cifras: CifrasCatalogo | null }) {
  if (!cifras) return null;

  const tarjetas = [
    cifraPositiva(cifras.programas)
      ? { valor: cifras.programas, etiqueta: "programas vigentes" }
      : null,
    cifraPositiva(cifras.ciudades) ? { valor: cifras.ciudades, etiqueta: "ciudades" } : null
  ].filter((tarjeta): tarjeta is { valor: number; etiqueta: string } => tarjeta !== null);

  if (tarjetas.length === 0) return null;

  return (
    <div
      className={`a2-fab-safe mx-auto mt-8 grid w-full max-w-[520px] gap-4 max-md:pr-24 md:pb-0 ${
        tarjetas.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"
      }`}
      role="group"
      aria-label="Cifras del catálogo vigente"
    >
      {tarjetas.map((tarjeta) => {
        const visible = formatoEntero(tarjeta.valor);
        return (
          <HardCard
            key={tarjeta.etiqueta}
            className="px-4 py-5 text-center"
            aria-label={`${visible} ${tarjeta.etiqueta}`}
          >
            <p className="font-display text-[48px] leading-none text-[var(--color-primary)]">{visible}</p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">{tarjeta.etiqueta}</p>
          </HardCard>
        );
      })}
    </div>
  );
}
