'use client';

/**
 * E1 · BA-036 — Diálogo de impacto antes de apagar o revocar (C1, P4; README-e1-api §0.2).
 *
 * Qué hace: muestra «N agentes lo usan; M quedarían sin IA.», la lista de agentes afectados con
 * su rol y con qué modelo quedan (o «sin IA»), los borradores afectados y el botón que nombra la
 * acción («Apagar xAI»). Si la API responde `impacto_cambio`, muestra el impacto nuevo y pide
 * confirmar otra vez. A pantalla completa en 390 px (lo resuelve `Dialogo`).
 * Para qué: que nadie apague un proveedor sin ver antes a quién deja sin IA.
 */

import type { Impacto } from '@/src/lib/admin-ia/tipos';
import Dialogo from './Dialogo';
import { BOTON_PELIGRO, TEXTO_SECUNDARIO } from './estilos';
import { ErrorEnLinea, Esqueleto } from './Base';
import { IconoAlerta, IconoCheck } from './Iconos';

export default function DialogoImpacto({
  abierto,
  titulo,
  textoAccion,
  impacto,
  cargando,
  enviando,
  error,
  aviso,
  onConfirmar,
  onCerrar
}: {
  abierto: boolean;
  titulo: string;
  /** Debe nombrar la acción: «Apagar xAI», «Revocar clave de xAI». Nunca «Aceptar». */
  textoAccion: string;
  impacto: Impacto | null;
  cargando: boolean;
  enviando: boolean;
  error: string | null;
  /** Texto cuando el impacto cambió entre ver y confirmar (409 `impacto_cambio`). */
  aviso: string | null;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  return (
    <Dialogo
      abierto={abierto}
      titulo={titulo}
      onCerrar={onCerrar}
      accion={
        <button type="button" className={`${BOTON_PELIGRO} w-full sm:w-auto`} onClick={onConfirmar} disabled={cargando || enviando || !impacto} aria-busy={enviando}>
          {enviando ? 'Aplicando…' : textoAccion}
        </button>
      }
    >
      {/* Cargando el impacto: esqueleto con la forma de la lista. */}
      {cargando && <Esqueleto forma="tabla" />}

      {!cargando && impacto && (
        <div className="space-y-4">
          {aviso && <ErrorEnLinea mensaje={aviso} />}
          {/* Frase principal del brief, con ícono: ámbar si alguien queda sin IA. */}
          <p className={`flex items-start gap-2 text-lg font-bold ${impacto.agentes_sin_ia > 0 ? 'text-[#b45309]' : 'text-[#15803d]'}`} aria-live="polite">
            {impacto.agentes_sin_ia > 0 ? <IconoAlerta className="mt-1 h-5 w-5" /> : <IconoCheck className="mt-1 h-5 w-5" />}
            <span>{impacto.mensaje}</span>
          </p>

          {/* Lista de lo afectado: agente, versión, rol y con qué queda. */}
          {impacto.agentes.length > 0 && (
            <ul className="divide-y divide-[#ece8f7] rounded-xl border border-[#ece8f7]">
              {impacto.agentes.map((a) => (
                <li key={`${a.version_id}-${a.rol}`} className="px-3 py-2">
                  <p className="font-semibold">{a.agente_nombre} <span className={`font-normal ${TEXTO_SECUNDARIO}`}>· {a.numero_version} · lo usa como {a.rol}</span></p>
                  {a.queda_con ? (
                    <p className="flex items-center gap-1.5 text-[#15803d]"><IconoCheck className="h-4 w-4" />Sigue con {a.queda_con.nombre}</p>
                  ) : (
                    <p className="flex items-center gap-1.5 font-semibold text-[#b45309]"><IconoAlerta className="h-4 w-4" />Queda sin IA: el estudiante recibe el mensaje de paso a una persona</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {impacto.borradores_afectados > 0 && (
            <p className={TEXTO_SECUNDARIO}>También lo usan {impacto.borradores_afectados} borrador{impacto.borradores_afectados === 1 ? '' : 'es'} (no afecta a estudiantes).</p>
          )}
          <p className={TEXTO_SECUNDARIO}>El cambio aplica en menos de 60 s, sin redeploy. Puedes volver a encenderlo cuando quieras.</p>
        </div>
      )}

      <div className="mt-3"><ErrorEnLinea mensaje={error} /></div>
    </Dialogo>
  );
}
