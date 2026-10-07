/**
 * W1: envuelve agenteExecutor solo en canal whatsapp.
 * No modifica AgenteExecutor.ts (archivo grande / riesgo de prod).
 */

import { etiquetaBeneficio } from "@/src/lib/etiquetas-beneficio";
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

  // Sin código no hay texto de beneficio: null se omite del hilo y del prompt.
  const mesa = hilo.ofertas_en_mesa.map((item) => {
    const etiqueta = etiquetaBeneficio(item.beneficio);
    const copia = { ...item };
    if (etiqueta) copia.beneficio = etiqueta;
    else delete copia.beneficio;
    return copia;
  });
  const hiloVisible = { ...hilo, ofertas_en_mesa: mesa };
  return motor.ejecutar({
    ...entrada,
    sesion_hilo: hiloVisible,
    contexto_ofertas:
      mesa.length > 0
        ? {
            total_resultados: mesa.length,
            ofertas_relevantes: mesa.map((item) => {
              const etiqueta = etiquetaBeneficio(item.beneficio);
              return {
                id: item.id,
                nombre: item.nombre,
                vigente_hasta: item.vigenciaHasta,
                ...(etiqueta ? { tipo_beneficio: etiqueta } : {}),
                programa: { modalidad: item.modalidad, nivel_academico: item.nivel },
                universidad: { nombre: item.universidad }
              };
            })
          }
        : entrada.contexto_ofertas,
    mensaje_usuario: `${serializarSesionHilo(hiloVisible)}\n\nMensaje del estudiante:\n${entrada.mensaje_usuario}`
  });
}

export const agenteExecutor = new Proxy(motor, {
  get(target, prop, receiver) {
    if (prop === "ejecutar") return ejecutarConHilo;
    return Reflect.get(target, prop, receiver);
  }
});
