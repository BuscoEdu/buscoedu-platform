/**
 * W1 — Catálogo del corredor para el hilo WhatsApp.
 * El modelo no lista IES de memoria: el servidor llama obtenerOfertas
 * (ya filtrado a aliadas) y deja máximo 5 fichas en la mesa.
 */

import { obtenerOfertas, type FiltrosOferta } from "@/src/lib/ofertas";
import type { OfertaEnMesa } from "./sesion-hilo";

export async function buscarOfertasCorredor(filtros: FiltrosOferta = {}): Promise<{
  ok: boolean;
  ofertas: OfertaEnMesa[];
  total: number;
}> {
  const resultado = await obtenerOfertas(filtros, 0, 5);
  if (!resultado.ok) {
    return { ok: false, ofertas: [], total: 0 };
  }
  const ofertas: OfertaEnMesa[] = resultado.ofertas.map((item) => ({
    id: item.id,
    nombre: item.nombre,
    universidad: item.universidad?.nombre || "Universidad aliada",
    modalidad: item.programa?.modalidad,
    nivel: item.programa?.nivel_academico,
    vigenciaHasta: item.vigente_hasta,
    beneficio: item.tipo_beneficio
  }));
  return { ok: true, ofertas, total: resultado.total };
}

export function filtrosDesdeSesion(input: {
  intereses?: string;
  modalidad?: string;
  ciudad?: string;
  nivel?: string;
}): FiltrosOferta {
  const filtros: FiltrosOferta = {};
  if (input.intereses) filtros.programa_o_area = input.intereses;
  if (input.modalidad && input.modalidad !== "virtual o presencial") {
    filtros.modalidad = input.modalidad;
  }
  if (input.ciudad) filtros.ciudad = input.ciudad;
  if (input.nivel) filtros.nivel_academico = input.nivel;
  return filtros;
}
