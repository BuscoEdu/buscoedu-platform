/**
 * W1: envuelve agenteExecutor solo en canal whatsapp.
 * No modifica AgenteExecutor.ts (archivo grande / riesgo de prod).
 */

import { agenteExecutor as motor } from "./AgenteExecutor";
import type { EntradaEjecucion, SalidaEjecucion } from "./tipos";
import { prepararTurnoHilo } from "@/src/lib/demowapp/preparar-turno-hilo";
import {
  SESION_HILO_VACIA,
  serializarSesionHilo
} from "@/src/lib/demowapp/sesion-hilo";

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
  return motor.ejecutar({
    ...entrada,
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
        : entrada.contexto_ofertas,
    mensaje_usuario: `${serializarSesionHilo(hilo)}\n\nMensaje del estudiante:\n${entrada.mensaje_usuario}`
  });
}

export const agenteExecutor = new Proxy(motor, {
  get(target, prop, receiver) {
    if (prop === "ejecutar") return ejecutarConHilo;
    return Reflect.get(target, prop, receiver);
  }
});
