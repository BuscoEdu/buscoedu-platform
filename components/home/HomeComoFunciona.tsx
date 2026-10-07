import HardCard from "@/components/restyle/HardCard";
import HeroIllustration from "@/components/restyle/HeroIllustration";
import SectionBand from "@/components/restyle/SectionBand";
import SectionWrap from "@/components/restyle/SectionWrap";

/**
 * Tres pasos del recorrido. El tercero dice en voz alta que la universidad
 * solo recibe datos si la persona autoriza el contacto.
 */

const PASOS = [
  {
    numero: "1",
    titulo: "Explora",
    texto: "Filtra por programa o área, nivel, país, ciudad, universidad, modalidad y beneficio. Sin registrarte."
  },
  {
    numero: "2",
    titulo: "Compara con NaIA",
    texto: "NaIA responde solo con programas del catálogo vigente."
  },
  {
    numero: "3",
    titulo: "Aplica con tu permiso",
    texto: "La universidad solo recibe tus datos si autorizas el contacto."
  }
];

export default function HomeComoFunciona() {
  return (
    <SectionBand>
      <SectionWrap className="text-center">
        <HeroIllustration onBand />
        <h2 className="mt-3.5 font-display text-[34px] leading-[1.02] text-[var(--color-primary)] sm:text-[48px]">
          Cómo funciona
        </h2>
        <p className="mt-3 text-base text-[var(--color-muted)]">Tres pasos, y tú decides cuándo te contactan.</p>
        <div className="mt-8 grid gap-6 text-left md:grid-cols-3">
          {PASOS.map((paso) => (
            <HardCard key={paso.numero} className="p-6">
              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-band)] px-2 font-mono text-sm text-[var(--color-text)]">
                {paso.numero}
              </span>
              <h3 className="mt-3 text-xl font-bold text-[var(--color-text)]">{paso.titulo}</h3>
              <p className="mt-1.5 text-base leading-relaxed text-[var(--color-muted)]">{paso.texto}</p>
            </HardCard>
          ))}
        </div>
      </SectionWrap>
    </SectionBand>
  );
}
