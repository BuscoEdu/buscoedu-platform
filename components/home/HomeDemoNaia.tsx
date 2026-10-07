import type { CifrasCatalogo } from "@/src/lib/cifras-catalogo";
import HardCard from "@/components/restyle/HardCard";
import SectionWrap from "@/components/restyle/SectionWrap";
import { cifraPositiva, formatoEntero } from "@/components/restyle/formato";

/**
 * Demo fija de NaIA. No llama al modelo: es un ejemplo marcado como tal.
 * El número, si aparece, es el total del catálogo (el mismo de las cifras).
 * No se nombra una universidad ni se arma una ficha inventada.
 */
export default function HomeDemoNaia({ cifras }: { cifras: CifrasCatalogo | null }) {
  const programas = cifras && cifraPositiva(cifras.programas) ? cifras.programas : null;
  const respuesta = programas
    ? `Encontré ${formatoEntero(programas)} programas vigentes en el catálogo. En el chat, NaIA te muestra fichas para que compares precio y becas. No elige una universidad por ti.`
    : "NaIA responde solo con programas vigentes del catálogo y te muestra fichas para que compares precio y becas. No elige una universidad por ti.";

  return (
    <section className="bg-[var(--color-bg)]">
      <SectionWrap className="text-center">
        <h2 className="font-display text-[34px] leading-[1.02] text-[var(--color-primary)] sm:text-[48px]">
          Pregúntale a NaIA
        </h2>
        <p className="mt-3 text-base text-[var(--color-muted)]">Hilo de ejemplo fijo, no es una llamada en vivo.</p>
        <HardCard className="mt-7 grid items-center gap-6 p-6 text-left md:grid-cols-[1fr_1.3fr] md:p-8">
          <div>
            <span className="inline-flex rounded-full border border-[var(--color-primary)] bg-[var(--color-band)] px-2.5 py-1 font-mono text-xs uppercase tracking-wide text-[var(--color-text)]">
              NaIA
            </span>
            <h3 className="mt-3 text-xl font-bold text-[var(--color-text)]">Te orienta según tu etapa</h3>
            <p className="mt-2 text-base leading-relaxed text-[var(--color-muted)]">
              Explorar, comparar o aplicar. Neutral entre universidades.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-3.5" aria-label="Ejemplo de conversación con NaIA">
            <p className="ml-auto max-w-[82%] rounded-[14px] border border-[var(--color-text)] bg-white px-3.5 py-2.5 text-sm text-[var(--color-text)]">
              Quiero estudiar administración virtual en Bogotá, ¿qué hay?
            </p>
            <p className="mt-1.5 max-w-[82%] rounded-[14px] bg-[var(--color-primary)] px-3.5 py-2.5 text-sm text-white">
              {respuesta}
            </p>
          </div>
        </HardCard>
      </SectionWrap>
    </section>
  );
}
