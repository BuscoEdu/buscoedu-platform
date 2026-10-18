'use client';

/**
 * E1 · Frontend — Bitácora visible: quién, cuándo, qué cambió (UX §3.14; A4, D1; P4, T2).
 *
 * Qué hace: tabla en web y lista de tarjetas en móvil, con la acción en palabras sencillas y
 * «antes → después» cuando aplica. Nunca muestra una clave (la API tampoco la manda).
 * Para qué: saber quién apagó, cambió o revocó algo y cuándo, sin entrar a la base de datos.
 */

import { fechaHora } from '@/src/lib/admin-ia/logica';
import { TARJETA, TEXTO_SECUNDARIO } from './estilos';

export interface FilaBitacora {
  clave_fila: string;
  cuando: string;
  quien: string;
  que: string;
  antes?: string | null;
  despues?: string | null;
}

/** Acción del contrato → texto en español. */
const ACCION: Record<string, string> = {
  crear: 'Creó',
  editar: 'Editó la configuración',
  encender: 'Encendió',
  apagar: 'Apagó',
  archivar: 'Archivó',
  // P4 antepone `clave_` a los eventos de la bitácora de claves.
  clave_guardar: 'Guardó la clave (el valor nunca se registra)',
  clave_reemplazar: 'Reemplazó la clave (el valor nunca se registra)',
  clave_revocar: 'Revocó la clave',
  guardar: 'Guardó la clave (el valor nunca se registra)',
  reemplazar: 'Reemplazó la clave (el valor nunca se registra)',
  revocar: 'Revocó la clave',
  probar: 'Probó la conexión',
  asignar_modelo: 'Asignó modelo a una versión',
  restaurar: 'Volvió a una versión anterior'
};

export function textoAccion(accion: string): string {
  return ACCION[accion] ?? accion;
}

/** Valor de la bitácora a texto corto (texto, número u objeto pequeño). */
export function valorTexto(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${String(x)}`).join(', ');
}

export default function Bitacora({ filas, vacio = 'Todavía no hay cambios registrados.' }: { filas: FilaBitacora[]; vacio?: string }) {
  if (!filas.length) return <p className={TEXTO_SECUNDARIO}>{vacio}</p>;
  return (
    <>
      {/* Web: tabla. */}
      <div className={`${TARJETA} hidden overflow-hidden md:block`}>
        <table className="w-full text-left">
          <caption className="sr-only">Bitácora de cambios: quién, cuándo y qué cambió</caption>
          <thead className="bg-[#f7f4ee] text-sm text-[#3b2f8f]">
            <tr>
              <th scope="col" className="px-4 py-2">Cuándo</th>
              <th scope="col" className="px-4 py-2">Quién</th>
              <th scope="col" className="px-4 py-2">Qué cambió</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ece8f7]">
            {filas.map((f) => (
              <tr key={f.clave_fila} className="align-top">
                <td className={`whitespace-nowrap px-4 py-2 ${TEXTO_SECUNDARIO}`}>{fechaHora(f.cuando)}</td>
                <td className="px-4 py-2 font-semibold">{f.quien}</td>
                <td className="px-4 py-2">
                  {f.que}
                  {(f.antes || f.despues) && <span className={`block text-sm ${TEXTO_SECUNDARIO}`}>{f.antes ?? '—'} → {f.despues ?? '—'}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Móvil: tarjetas. */}
      <ul className="space-y-2 md:hidden" aria-label="Bitácora de cambios">
        {filas.map((f) => (
          <li key={f.clave_fila} className={`${TARJETA} p-3`}>
            <p className="font-semibold">{f.que}</p>
            {(f.antes || f.despues) && <p className={`text-sm ${TEXTO_SECUNDARIO}`}>{f.antes ?? '—'} → {f.despues ?? '—'}</p>}
            <p className={`text-sm ${TEXTO_SECUNDARIO}`}>{f.quien} · {fechaHora(f.cuando)}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
