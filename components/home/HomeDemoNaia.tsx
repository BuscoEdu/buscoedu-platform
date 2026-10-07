import HardCard from "@/components/restyle/HardCard";
import HablaConNaiaButton from "@/components/restyle/HablaConNaiaButton";
import SectionWrap from "@/components/restyle/SectionWrap";

/**
 * Demo fija de NaIA (H5). No llama al modelo y no cita cifras ni universidades:
 * el total del catálogo no es la respuesta a un filtro, y una ficha aquí
 * destacaría a una institución. Explica el recorrido: pregunta, tipo de
 * respuesta y el CTA para hablar con NaIA.
 */
export default function HomeDemoNaia() {
  return (
    <section className="bg-[var(--color-bg)]">
      <SectionWrap className="a2-fab-safe text-center md:pb-[60px]">
        <h2 className="font-display text-[34px] leading-[1.02] text-[var(--color-primary)] sm:text-[48px]">
          Pregúntale a NaIA
        </h2>
        <p className="mt-3 text-base text-[var(--color-muted)]">Hilo de ejemplo fijo, no es una llamada en vivo.</p>
        <HardCard className="mt-7 grid items-center gap-6 p-6 text-left md:grid-cols-[1fr_1.3fr] md:p-8">
          <div>
            <span className="inline-flex rounded-full border border-[var(--color-primary)] bg-[var(--color-band)] px-2.5 py-1 font-mono text-xs uppercase tracking-wide text-[var(--color-text)]">
              NaIA
            </span>
            <h3 className="mt-3 text-xl font-bold text-[var(--color-text)]">Así responde</h3>
            <p className="mt-2 text-base leading-relaxed text-[var(--color-muted)]">
              Le escribes qué quieres estudiar. NaIA contesta con fichas del catálogo vigente para que compares.
              No elige una universidad por ti.
            </p>
            <HablaConNaiaButton className="mt-5" />
          </div>
          <div className="max-md:pr-24 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-3.5 md:pr-0" aria-label="Ejemplo de conversación con NaIA">
            <p className="ml-auto max-w-[82%] rounded-[14px] border-2 border-[var(--color-text)] bg-[var(--color-primary)] px-3.5 py-2.5 text-sm text-white">
              Quiero estudiar administración virtual en Bogotá, ¿qué hay?
            </p>
            <p className="mt-1.5 max-w-[82%] rounded-[14px] border-2 border-[var(--color-text)] bg-[var(--color-band)] px-3.5 py-2.5 text-sm text-[var(--color-text)]">
              Te muestro fichas del catálogo vigente con modalidad, ciudad, becas y beneficios, y vigencia, solo
              cuando esos datos existen. Tú comparas. Yo no te digo cuál universidad es la mejor.
            </p>
          </div>
        </HardCard>
      </SectionWrap>
    </section>
  );
}
