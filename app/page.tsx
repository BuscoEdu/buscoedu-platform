import type { Metadata } from "next";
import HomeComoFunciona from "@/components/home/HomeComoFunciona";
import HomeDemoNaia from "@/components/home/HomeDemoNaia";
import HomeFaq from "@/components/home/HomeFaq";
import HomeHero from "@/components/home/HomeHero";
import { getCifrasCatalogo, type CifrasCatalogo } from "@/src/lib/cifras-catalogo";
import { getLogosAliadas, type LogoAliada } from "@/src/lib/logos-aliadas";

/**
 * Home Ola 1. Server Component: llama a getCifrasCatalogo y getLogosAliadas
 * en el servidor, sin fetch. Si faltan datos, el hero sigue y las franjas no se pintan.
 */

export const metadata: Metadata = {
  title: "BuscoEdu | Encuentra tu carrera",
  description:
    "Explora el catálogo de universidades aliadas, compara con NaIA y aplica en minutos. Gratis para estudiantes. La universidad solo te contacta si tú lo autorizas."
};

export const dynamic = "force-dynamic";

async function leerPruebaSocial(): Promise<{ cifras: CifrasCatalogo | null; logos: LogoAliada[] }> {
  try {
    const [cifras, logos] = await Promise.all([getCifrasCatalogo(), getLogosAliadas()]);
    return {
      cifras: cifras ?? null,
      logos: Array.isArray(logos) ? logos : []
    };
  } catch (error) {
    console.error("Prueba social del Home no disponible:", error);
    return { cifras: null, logos: [] };
  }
}

export default async function HomePage() {
  const { cifras, logos } = await leerPruebaSocial();

  return (
    <>
      <HomeHero cifras={cifras} logos={logos} />
      <HomeComoFunciona />
      <HomeDemoNaia cifras={cifras} />
      <HomeFaq />
    </>
  );
}
