import type { CifrasCatalogo } from "@/src/lib/cifras-catalogo";
import type { LogoAliada } from "@/src/lib/logos-aliadas";
import HablaConNaiaButton from "@/components/restyle/HablaConNaiaButton";
import HeroIllustration from "@/components/restyle/HeroIllustration";
import LogoStrip from "@/components/restyle/LogoStrip";
import PillButton from "@/components/restyle/PillButton";
import SectionWrap from "@/components/restyle/SectionWrap";
import HomeCifras from "@/components/home/HomeCifras";

/**
 * Hero del Home. Una promesa, una palabra en highlight (sobre crema, no sobre banda)
 * y dos CTA: Explorar programas y Habla con NaIA. Logos y cifras van debajo
 * y solo si hay dato real.
 */
export default function HomeHero({
  cifras,
  logos
}: {
  cifras: CifrasCatalogo | null;
  logos: LogoAliada[];
}) {
  return (
    <section className="bg-[var(--color-bg)]">
      <SectionWrap className="text-center">
        <HeroIllustration />
        <h1 className="mx-auto mt-4 max-w-[16ch] font-display text-[40px] leading-[1.02] text-[var(--color-primary)] min-[390px]:max-w-none sm:mt-5 sm:text-[56px] lg:text-[76px]">
          Encuentra tu <span className="text-[var(--color-highlight)]">carrera</span>.
          <br />
          Tú decides quién te contacta.
        </h1>
        <p className="mx-auto mt-5 max-w-[560px] text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
          Explora el catálogo de universidades aliadas, compara con NaIA y aplica fácil. Gratis para
          estudiantes.
        </p>
        <div className="mx-auto mt-8 flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
          <PillButton href="/explorar" className="w-full sm:w-auto">
            Explora programas
          </PillButton>
          <HablaConNaiaButton className="w-full sm:w-auto" />
        </div>
        <LogoStrip logos={logos} />
        <HomeCifras cifras={cifras} />
      </SectionWrap>
    </section>
  );
}
