'use client';

/**
 * E1 · Frontend — Hook de carga con estados separados.
 *
 * Qué hace: llama a una función del cliente y expone la fase (cargando / ok / error / sin_permiso),
 * los datos, si ya pasó ~10 s («lento») y `recargar`.
 * Para qué: que cada pantalla pinte el estado correcto sin mezclar vacío con error (brief UX §5).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Resultado } from '@/src/lib/admin-ia/tipos';

export type FaseCarga<T> =
  | { fase: 'cargando'; lento: boolean }
  | { fase: 'ok'; datos: T }
  | { fase: 'error'; http: number; codigo: string; mensaje: string }
  | { fase: 'sin_permiso' };

export function usarCarga<T>(cargar: () => Promise<Resultado<T>>) {
  const [estado, setEstado] = useState<FaseCarga<T>>({ fase: 'cargando', lento: false });
  const turno = useRef(0);
  const fn = useRef(cargar);
  fn.current = cargar;

  // Pide los datos; ignora respuestas viejas si el admin reintentó (turno).
  // `silencioso`: refresca tras un cambio sin volver a los esqueletos (no se pierde el foco ni el mensaje).
  const recargar = useCallback((opciones?: { silencioso?: boolean }) => {
    const mio = ++turno.current;
    if (opciones?.silencioso !== true) setEstado({ fase: 'cargando', lento: false });
    const aviso = window.setTimeout(() => {
      if (turno.current === mio) setEstado((e) => (e.fase === 'cargando' ? { fase: 'cargando', lento: true } : e));
    }, 10000);
    fn.current()
      .then((r) => {
        if (turno.current !== mio) return;
        if (r.tipo === 'ok') setEstado({ fase: 'ok', datos: r.datos });
        else if (r.tipo === 'sin_permiso') setEstado({ fase: 'sin_permiso' });
        else setEstado({ fase: 'error', http: r.http, codigo: r.codigo, mensaje: r.mensaje });
      })
      .catch(() => {
        if (turno.current === mio) setEstado({ fase: 'error', http: 0, codigo: 'sin_conexion', mensaje: 'Hubo un problema de conexión.' });
      })
      .finally(() => window.clearTimeout(aviso));
  }, []);

  // Primera carga al montar la pantalla.
  useEffect(() => {
    recargar();
  }, [recargar]);

  // Permite actualizar los datos en pantalla tras guardar (sin volver a cargar).
  const fijarDatos = useCallback((datos: T) => setEstado({ fase: 'ok', datos }), []);

  return { estado, recargar, fijarDatos };
}
