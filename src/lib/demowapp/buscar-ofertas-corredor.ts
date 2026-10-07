import { etiquetaBeneficio } from "@/src/lib/etiquetas-beneficio";
import { obtenerOfertas, type FiltrosOferta } from "@/src/lib/ofertas";
import type { OfertaEnMesa } from "./sesion-hilo";

export async function buscarOfertasCorredor(filtros: FiltrosOferta = {}): Promise<{
  ok: boolean;
  ofertas: OfertaEnMesa[];
  total: number;
}> {
  const resultado = await obtenerOfertas(filtros, 0, 5);
  if (!resultado.ok) return { ok: false, ofertas: [], total: 0 };
  return {
    ok: true,
    total: resultado.total,
    ofertas: resultado.ofertas.map((item) => {
      // Lo que va a la mesa es la etiqueta. Sin código, no hay campo beneficio.
      const etiqueta = etiquetaBeneficio(item.tipo_beneficio);
      return {
        id: item.id,
        nombre: item.nombre,
        universidad: item.universidad?.nombre || "Universidad aliada",
        modalidad: item.programa?.modalidad,
        nivel: item.programa?.nivel_academico,
        vigenciaHasta: item.vigente_hasta,
        ...(etiqueta ? { beneficio: etiqueta } : {})
      };
    })
  };
}

export function filtrosDesdeSesion(input: {
  intereses?: string;
  modalidad?: string;
  ciudad?: string;
  nivel?: string;
}): FiltrosOferta {
  const filtros: FiltrosOferta = {};
  if (input.intereses) filtros.programa_o_area = input.intereses;
  if (input.modalidad && input.modalidad !== "virtual o presencial") filtros.modalidad = input.modalidad;
  if (input.ciudad) filtros.ciudad = input.ciudad;
  if (input.nivel) filtros.nivel_academico = input.nivel;
  return filtros;
}
