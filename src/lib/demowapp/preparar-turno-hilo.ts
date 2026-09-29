import type { SesionEstudiante } from "@/lib/agentes/vozNaia";
import { buscarOfertasCorredor, filtrosDesdeSesion } from "./buscar-ofertas-corredor";
import {
  fusionarSesionHilo,
  inferirPasoHilo,
  pideCatalogo,
  sanearSesionHilo,
  type SesionHilo
} from "./sesion-hilo";

export async function prepararTurnoHilo(input: {
  texto: string;
  sesionEstudiante: SesionEstudiante;
  sesionHiloPrevia: SesionHilo;
}): Promise<SesionHilo> {
  const previa = sanearSesionHilo(input.sesionHiloPrevia);
  const tieneAncla = Boolean(input.sesionEstudiante.intereses || input.sesionEstudiante.nivel);
  const debeBuscar = pideCatalogo(input.texto) || (tieneAncla && previa.ofertas_en_mesa.length === 0);

  let mesa = previa.ofertas_en_mesa;
  if (debeBuscar) {
    const catalogo = await buscarOfertasCorredor(
      filtrosDesdeSesion({
        intereses: input.sesionEstudiante.intereses,
        modalidad: input.sesionEstudiante.modalidad,
        ciudad: input.sesionEstudiante.ciudad,
        nivel: input.sesionEstudiante.nivel
      })
    );
    if (catalogo.ok) mesa = catalogo.ofertas;
  }

  const ies =
    mesa.length === 1
      ? mesa[0].universidad
      : previa.ies_en_foco && mesa.some((item) => item.universidad === previa.ies_en_foco)
        ? previa.ies_en_foco
        : mesa.length > 0
          ? mesa[0].universidad
          : null;

  return fusionarSesionHilo(previa, {
    ofertas_en_mesa: mesa,
    ies_en_foco: ies,
    paso: inferirPasoHilo({ previa, textoUsuario: input.texto, mesa })
  });
}
