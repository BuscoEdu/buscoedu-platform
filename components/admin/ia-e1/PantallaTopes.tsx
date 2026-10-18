'use client';

/**
 * E1 · BA-038 — Tope de gasto diario POR CANAL (D1–D5; T1–T6; UX §3.12).
 *
 * Qué hace: lista los canales (en E1 el tope es por canal: `whatsapp` lo comparten Demo WApp y
 * WhatsApp real; por línea llega en E2) con su barra «USD 3,20 de 5,00 (64 %)», la marca del umbral
 * y el estado (ícono + texto). El canal elegido muestra el formulario (rechaza 0, vacío, «sin límite»
 * y > USD 1000 con el motivo), el consumo del día, la bitácora (anterior → nuevo) y las alertas con
 * «Marcar como vista».
 * Para qué: que el gasto en IA no se dispare sin aviso y que se sepa quién cambió el tope y cuándo.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clienteAdminIa } from '@/src/lib/admin-ia/cliente';
import {
  TEXTO_PRECIO_ESTIMADO,
  TEXTO_SIN_COSTO,
  TOPE_MAXIMO_USD,
  fechaHora,
  formatoUsd,
  porcentajeUsado,
  textoBarraTope,
  validarTope,
  validarUmbral
} from '@/src/lib/admin-ia/logica';
import type { AlertaApi, EstadoGastoApi } from '@/src/lib/admin-ia/tipos';
import { AccionesFijas, AvisoAmbar, AvisoDatosEjemplo, CajaPorQue, Campo, EncabezadoPantalla, ErrorEnLinea, EstadoVacio, FaseNoOk, TextoExito } from './Base';
import Bitacora from './Bitacora';
import { etiquetaCampoBitacora, etiquetaCanal, etiquetaProveedorModelo } from '@/src/lib/admin-ia/etiquetas';
import { BOTON_CTA, BOTON_SECUNDARIO, ENLACE, FOCO, RESERVA_BARRA_FIJA, TARJETA, TEXTO_SECUNDARIO } from './estilos';
import { IconoAlerta, IconoCheck, IconoError } from './Iconos';
import { usarCarga } from './usarCarga';

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1 · Chip y barra del tope.
 * Qué hace: estado del gasto con ícono + texto y barra con la marca del umbral.
 * Para qué: que el admin vea de un vistazo cuánto lleva y cuándo salta la alerta, sin depender del color.
 * ──────────────────────────────────────────────────────────────────────────── */

const ESTADO_GASTO = {
  normal: { texto: 'Dentro del tope', clase: 'border-[#15803d] text-[#15803d]', barra: 'bg-[#3b2f8f]', Icono: IconoCheck },
  alerta: { texto: 'Cerca del tope', clase: 'border-[#b45309] text-[#b45309]', barra: 'bg-[#b45309]', Icono: IconoAlerta },
  cortado: { texto: 'Tope alcanzado: IA en pausa en este canal', clase: 'border-[#b91c1c] text-[#b91c1c]', barra: 'bg-[#b91c1c]', Icono: IconoError }
} as const;

export function ChipGasto({ estado }: { estado: EstadoGastoApi['estado'] }) {
  const e = ESTADO_GASTO[estado] ?? ESTADO_GASTO.normal;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-sm font-semibold ${e.clase}`}>
      <e.Icono className="h-4 w-4" />
      {e.texto}
    </span>
  );
}

export function BarraTope({ c }: { c: EstadoGastoApi }) {
  const pct = porcentajeUsado(c.gasto_usd, c.tope_diario_usd);
  const ancho = Math.min(100, Math.max(0, pct));
  const umbral = Math.min(99, Math.max(1, c.umbral_alerta_pct));
  const e = ESTADO_GASTO[c.estado] ?? ESTADO_GASTO.normal;
  const texto = textoBarraTope(c.gasto_usd, c.tope_diario_usd);
  return (
    <div className="space-y-1">
      <p className="flex flex-wrap items-center gap-2 text-lg font-bold text-[#1a1830]">
        {texto}
        {c.precio_estimado && <span className="rounded-full border border-[#b45309] px-2 py-0.5 text-xs font-semibold text-[#b45309]">{TEXTO_PRECIO_ESTIMADO}</span>}
      </p>
      <div
        role="progressbar"
        aria-label={`Gasto de hoy en ${c.canal_nombre}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ancho}
        aria-valuetext={`${texto}. Alerta al ${umbral} %.`}
        className="relative h-4 w-full rounded-full bg-[#ece8f7]"
      >
        <div className={`h-4 rounded-full ${e.barra} motion-safe:transition-[width]`} style={{ width: `${ancho}%` }} />
        {/* Marca del umbral: línea + texto, no solo color. */}
        <div className="absolute -top-1 h-6 w-0.5 bg-[#1f1a4d]" style={{ left: `${umbral}%` }} aria-hidden="true" />
      </div>
      <div className="relative h-5 text-sm" aria-hidden="true">
        <span className={`absolute whitespace-nowrap ${TEXTO_SECUNDARIO}`} style={{ left: `${umbral}%`, transform: umbral > 70 ? 'translateX(-100%)' : 'translateX(-50%)' }}>Alerta {umbral} %</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 2 · Avisos del canal (precio estimado, sin costo, reinicio).
 * Para qué: que la cifra no se lea como exacta cuando no lo es (D5) y que se sepa cómo corregirlo.
 * ──────────────────────────────────────────────────────────────────────────── */

function AvisosCanal({ c }: { c: EstadoGastoApi }) {
  return (
    <div className="space-y-2">
      {c.intentos_sin_costo > 0 && (
        <AvisoAmbar>
          {TEXTO_SIN_COSTO} ({c.intentos_sin_costo} {c.intentos_sin_costo === 1 ? 'llamada' : 'llamadas'} hoy).{' '}
          <Link href="/admin/ia/multiproveedor" className={ENLACE}>Cargar el precio</Link>
        </AvisoAmbar>
      )}
      {c.precio_estimado && <p className={`text-sm ${TEXTO_SECUNDARIO}`}>Parte del gasto se calculó con un {TEXTO_PRECIO_ESTIMADO}: la cifra es aproximada.</p>}
      <p className={`text-sm ${TEXTO_SECUNDARIO}`}>Se reinicia a las 00:00 (hora de Bogotá) · {fechaHora(c.reinicia_en)}.</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 3 · Detalle del canal elegido: formulario (T3), consumo (T4) y bitácora (T2).
 * ──────────────────────────────────────────────────────────────────────────── */

function DetalleCanal({ canal, onCambio }: { canal: string; onCambio: () => void }) {
  const det = usarCarga(() => clienteAdminIa.obtenerTope(canal));
  const con = usarCarga(() => clienteAdminIa.consumo(canal));
  const [tope, setTope] = useState('');
  const [umbral, setUmbral] = useState('');
  const [errores, setErrores] = useState<{ tope?: string; umbral?: string; general?: string }>({});
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Precarga el formulario con los valores vigentes al llegar el detalle.
  const vigente = det.estado.fase === 'ok' ? det.estado.datos : null;
  useEffect(() => {
    if (!vigente) return;
    setTope(formatoUsd(vigente.tope_diario_usd));
    setUmbral(String(vigente.umbral_alerta_pct));
  }, [vigente?.canal_codigo, vigente?.tope_diario_usd, vigente?.umbral_alerta_pct]);

  // Valida en el cliente (mismos mensajes que T3) y guarda; los errores del servidor van al campo (`campo`).
  async function guardar() {
    setOk(null);
    const vt = validarTope(tope);
    const vu = validarUmbral(umbral);
    const nuevos = { tope: 'motivo' in vt ? vt.motivo : undefined, umbral: 'motivo' in vu ? vu.motivo : undefined };
    setErrores(nuevos);
    if (nuevos.tope || nuevos.umbral || !('valor' in vt) || !('valor' in vu)) return;
    setEnviando(true);
    const r = await clienteAdminIa.guardarTope(canal, { tope_diario_usd: vt.valor, umbral_alerta_pct: vu.valor });
    setEnviando(false);
    if (r.tipo === 'ok') {
      setOk(`Guardado: ${textoBarraTope(r.datos.gasto_usd, r.datos.tope_diario_usd)}. Alerta al ${r.datos.umbral_alerta_pct} %.`);
      det.recargar({ silencioso: true });
      onCambio();
    } else if (r.tipo === 'error' && r.campo === 'tope_diario_usd') setErrores({ tope: r.mensaje });
    else if (r.tipo === 'error' && r.campo === 'umbral_alerta_pct') setErrores({ umbral: r.mensaje });
    else setErrores({ general: r.tipo === 'error' ? r.mensaje : 'No tienes permiso para cambiar el tope.' });
  }

  if (det.estado.fase !== 'ok') return <FaseNoOk estado={det.estado} forma="formulario" onReintentar={det.recargar} />;
  const d = det.estado.datos;

  return (
    <div className="space-y-5">
      <form className={`${TARJETA} space-y-4 p-4`} noValidate onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <h3 className="text-lg font-bold text-[#3b2f8f]">Cambiar tope de {d.canal_nombre}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Tope diario" prefijo="USD" modoEntrada="decimal" valor={tope} onCambio={(v) => { setTope(v); setErrores((x) => ({ ...x, tope: undefined })); }} error={errores.tope} ayuda={`Mayor que 0 y hasta USD ${formatoUsd(TOPE_MAXIMO_USD)} por día. No existe «sin límite».`} />
          <Campo etiqueta="Avisarme al llegar a" sufijo="%" modoEntrada="numeric" valor={umbral} onCambio={(v) => { setUmbral(v); setErrores((x) => ({ ...x, umbral: undefined })); }} error={errores.umbral} ayuda="Entre 1 y 99 %. Por defecto, 80 %." />
        </div>
        <p aria-live="polite">{ok && <TextoExito>{ok}</TextoExito>}</p>
        <ErrorEnLinea mensaje={errores.general} />
        {/* Única acción coral de la pantalla; en móvil queda fija abajo. Sin espaciador aquí:
            la pantalla reserva el alto de la barra al final (F1, RESERVA_BARRA_FIJA). */}
        <AccionesFijas espaciador={false}>
          <button type="submit" className={BOTON_CTA} disabled={enviando} aria-busy={enviando}>{enviando ? 'Guardando…' : 'Guardar tope'}</button>
        </AccionesFijas>
      </form>

      {/* Consumo del día (T4). */}
      <section aria-labelledby="t-consumo" className="space-y-2">
        <h3 id="t-consumo" className="text-lg font-bold text-[#3b2f8f]">Consumo de hoy</h3>
        {con.estado.fase !== 'ok' ? (
          <FaseNoOk estado={con.estado} forma="tarjetas" onReintentar={con.recargar} />
        ) : (
          <div className={`${TARJETA} p-4`}>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Llamadas', String(con.estado.datos.total.llamadas)],
                ['Gasto', `USD ${formatoUsd(con.estado.datos.total.gasto_usd)}`],
                ['Usaron respaldo', String(con.estado.datos.total.respaldo_usado)],
                ['Sin IA (pasó a persona)', String(con.estado.datos.total.sin_ia)]
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className={`text-sm ${TEXTO_SECUNDARIO}`}>{k}</dt>
                  <dd className="text-lg font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            {con.estado.datos.por_modelo.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-[#ece8f7] pt-3 text-sm">
                {con.estado.datos.por_modelo.map((m) => (
                  <li key={`${m.proveedor_codigo}-${m.modelo}`} className="flex flex-wrap justify-between gap-2">
                    <span className="break-all">{etiquetaProveedorModelo(m.proveedor_codigo, m.modelo)}</span>
                    <span>{m.llamadas} llamadas · USD {formatoUsd(m.gasto_usd)}{m.es_estimado ? ` · ${TEXTO_PRECIO_ESTIMADO}` : ''}{m.precio_version ? '' : ' · sin precio'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Bitácora del tope (T2). */}
      <section aria-labelledby="t-bitacora-tope" className="space-y-2">
        <h3 id="t-bitacora-tope" className="text-lg font-bold text-[#3b2f8f]">Cambios del tope</h3>
        <Bitacora
          filas={(d.bitacora ?? []).map((e, i) => ({
            clave_fila: `${e.creado_en}-${i}`,
            cuando: e.creado_en,
            quien: e.actor?.nombre ?? 'Sistema',
            que: e.campo === 'tope_diario_usd' ? 'Cambió el tope diario' : e.campo === 'umbral_alerta_pct' ? 'Cambió el umbral de alerta' : `Cambió ${etiquetaCampoBitacora(e.campo).toLowerCase()}`,
            antes: e.valor_anterior === null ? null : e.campo === 'tope_diario_usd' ? `USD ${formatoUsd(e.valor_anterior)}` : `${e.valor_anterior} %`,
            despues: e.valor_nuevo === null ? null : e.campo === 'tope_diario_usd' ? `USD ${formatoUsd(e.valor_nuevo)}` : `${e.valor_nuevo} %`
          }))}
        />
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 4 · Alertas abiertas (T5) con «Marcar como vista» (T6).
 * ──────────────────────────────────────────────────────────────────────────── */

const TEXTO_ALERTA: Record<AlertaApi['tipo'], string> = {
  umbral: 'Llegó al umbral de alerta',
  corte: 'Llegó al tope: la IA se pausó',
  sin_costo: TEXTO_SIN_COSTO
};

function Alertas({ alertas, nombreCanal, onCambio }: { alertas: AlertaApi[]; nombreCanal: (c: string) => string; onCambio: () => void }) {
  const [error, setError] = useState<string | null>(null);
  if (!alertas.length) return null;
  // Marca la alerta como vista (idempotente en la API).
  async function marcar(id: string) {
    setError(null);
    const r = await clienteAdminIa.marcarAlertaVista(id);
    if (r.tipo === 'ok') onCambio();
    else setError(r.tipo === 'error' ? r.mensaje : 'No tienes permiso para marcar alertas.');
  }
  return (
    <section aria-labelledby="t-alertas" className="space-y-2">
      <h3 id="t-alertas" className="text-lg font-bold text-[#3b2f8f]">Alertas abiertas ({alertas.length})</h3>
      <ul className="space-y-2">
        {alertas.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#b45309] bg-[#fffbeb] p-3">
            <span className="flex min-w-0 items-start gap-2 font-semibold text-[#b45309]">
              <IconoAlerta className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{nombreCanal(a.canal_codigo)}: {TEXTO_ALERTA[a.tipo] ?? a.tipo} · USD {formatoUsd(a.gasto_usd)} de {formatoUsd(a.tope_usd)} · {fechaHora(a.creado_en)}</span>
            </span>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => marcar(a.id)}>Marcar como vista</button>
          </li>
        ))}
      </ul>
      <ErrorEnLinea mensaje={error} />
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 5 · Pantalla.
 * ──────────────────────────────────────────────────────────────────────────── */

export default function PantallaTopes({ canalInicial }: { canalInicial?: string }) {
  const topes = usarCarga(() => clienteAdminIa.listarTopes());
  const alertas = usarCarga(() => clienteAdminIa.listarAlertas('abiertas'));
  const [canal, setCanal] = useState<string | null>(canalInicial ?? null);
  const lista = topes.estado.fase === 'ok' ? topes.estado.datos : [];
  const elegido = canal ?? lista[0]?.canal_codigo ?? null;
  const nombreCanal = (c: string) => lista.find((x) => x.canal_codigo === c)?.canal_nombre ?? etiquetaCanal(c);
  const refrescar = () => {
    topes.recargar({ silencioso: true });
    alertas.recargar({ silencioso: true });
  };

  // F1: RESERVA_BARRA_FIJA deja al final el alto de la barra «Guardar tope» (fija en móvil)
  // para que «Cambios del tope» quede completa por encima de ella al terminar el scroll.
  return (
    <section className={`space-y-5 text-base sm:text-[15px] ${RESERVA_BARRA_FIJA}`}>
      <EncabezadoPantalla
        titulo="Tope de gasto diario"
        descripcion="Cuánto puede gastar la IA por día en cada canal. Al llegar al tope, la IA se pausa en ese canal y la conversación pasa a una persona."
        migas={[{ texto: 'IA multiproveedor', href: '/admin/ia/multiproveedor' }, { texto: 'Tope de gasto' }]}
      />
      <AvisoDatosEjemplo visible={clienteAdminIa.esEjemplo} />
      <CajaPorQue
        id="topes"
        porQue="En esta etapa el tope es por canal: WhatsApp lo comparten Demo WApp y WhatsApp real. El tope por línea llega en la etapa 2."
        paraQue="Para que el gasto en IA no se dispare sin aviso: te avisamos al llegar al umbral y se corta al llegar al tope."
      />

      {topes.estado.fase !== 'ok' ? (
        <FaseNoOk estado={topes.estado} forma="tarjetas" onReintentar={topes.recargar} />
      ) : lista.length === 0 ? (
        <EstadoVacio titulo="Aún no hay canales con IA" texto="Cuando un canal use IA, aquí verás su gasto del día y podrás ponerle tope." />
      ) : (
        <>
          {alertas.estado.fase === 'ok' && <Alertas alertas={alertas.estado.datos} nombreCanal={nombreCanal} onCambio={refrescar} />}

          {/* Una tarjeta por canal: elegir uno abre su detalle. */}
          <ul className="grid gap-3 lg:grid-cols-2" aria-label="Canales">
            {lista.map((c) => {
              const activo = c.canal_codigo === elegido;
              return (
                <li key={c.canal_codigo} className={`${TARJETA} space-y-3 p-4 ${activo ? 'outline outline-2 outline-[#3b2f8f]' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-[#3b2f8f]">{c.canal_nombre}</h3>
                      <p className={`text-sm ${TEXTO_SECUNDARIO}`}>Canal: {etiquetaCanal(c.canal_codigo)} · tope por canal</p>
                    </div>
                    <ChipGasto estado={c.estado} />
                  </div>
                  <BarraTope c={c} />
                  <AvisosCanal c={c} />
                  <button type="button" className={`${FOCO} min-h-[44px] rounded font-semibold text-[#3b2f8f] underline underline-offset-2`} aria-pressed={activo} onClick={() => setCanal(c.canal_codigo)}>
                    {activo ? 'Editando este canal' : 'Cambiar tope de este canal'}
                  </button>
                </li>
              );
            })}
          </ul>

          {elegido && <DetalleCanal key={elegido} canal={elegido} onCambio={refrescar} />}
        </>
      )}
    </section>
  );
}
