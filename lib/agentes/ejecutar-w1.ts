/**
 * W1: prepara el hilo de WhatsApp y lo pasa al motor en sesion_hilo.
 * mensaje_usuario queda como lo escribió el estudiante. El bloque
 * (contrato + mesa) lo arma AgenteExecutor una sola vez, dentro del
 * prompt enriquecido del canal whatsapp.
 */

import { agenteExecutor as motor } from "./AgenteExecutor";
import type { EntradaEjecucion, SalidaEjecucion } from "./tipos";
import { prepararTurnoHilo } from "@/src/lib/demowapp/preparar-turno-hilo";
import { SESION_HILO_VACIA } from "@/src/lib/demowapp/sesion-hilo";

async function ejecutarConHilo(entrada: EntradaEjecucion): Promise<SalidaEjecucion> {
  if (entrada.codigo_canal !== "whatsapp") {
    return motor.ejecutar(entrada);
  }

  const hilo = await prepararTurnoHilo({
    texto: entrada.mensaje_usuario,
    sesionEstudiante: entrada.sesion_previa || {},
    sesionHiloPrevia: entrada.sesion_hilo || SESION_HILO_VACIA
  });

  const mesa = hilo.ofertas_en_mesa;
  const salida = await motor.ejecutar({
    ...entrada,
    mensaje_usuario: entrada.mensaje_usuario,
    sesion_hilo: hilo,
    contexto_ofertas:
      mesa.length > 0
        ? {
            total_resultados: mesa.length,
            ofertas_relevantes: mesa.map((item) => ({
              id: item.id,
              nombre: item.nombre,
              vigente_hasta: item.vigenciaHasta,
              tipo_beneficio: item.beneficio,
              programa: { modalidad: item.modalidad, nivel_academico: item.nivel },
              universidad: { nombre: item.universidad }
            }))
          }
        : entrada.contexto_ofertas
  });

  return { ...salida, sesion_hilo: hilo };
}

export const agenteExecutor = new Proxy(motor, {
  get(target, prop, receiver) {
    if (prop === "ejecutar") return ejecutarConHilo;
    return Reflect.get(target, prop, receiver);
  }
});
