'use client';

/**
 * E1 · Frontend — Piezas comunes del módulo «IA multiproveedor».
 *
 * Qué hace: encabezado de pantalla, aviso de datos de ejemplo, los 5 estados separados
 * (cargando, vacío, error, sin permiso, deshabilitado con motivo), chip de estado, caja
 * ¿Por qué? / ¿Para qué?, campo con error unido por aria-describedby, interruptor y
 * barra de acciones fija abajo en móvil.
 * Para qué: que todas las pantallas cumplan el brief UX §5 de la misma forma y QA pueda
 * revisarlo en un solo lugar.
 */

import { useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import type { EstadoPanel } from '@/src/lib/admin-ia/tipos';
import { ETIQUETA_ESTADO } from '@/src/lib/admin-ia/logica';
import { BOTON_CTA, BOTON_SECUNDARIO, CAMPO, CAMPO_ERROR, FOCO, TARJETA, TEXTO_SECUNDARIO, TITULO } from './estilos';
import { IconoAlerta, IconoCandado, IconoCheck, IconoConfigurado, IconoEncendido, IconoError, IconoInfo, IconoVacio } from './Iconos';

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1 · Encabezado y aviso de datos de ejemplo.
 * Qué hace: título índigo, descripción y migas; aviso visible cuando el cliente es de ejemplo.
 * Para qué: que nadie confunda los datos de ejemplo con datos reales (rol de QA y Jhon).
 * ──────────────────────────────────────────────────────────────────────────── */

export function EncabezadoPantalla({ titulo, descripcion, migas }: { titulo: string; descripcion?: string; migas?: Array<{ texto: string; href?: string }> }) {
  return (
    <header className="mb-5 space-y-1">
      {migas && migas.length > 0 && (
        <nav aria-label="Ruta" className={`text-sm ${TEXTO_SECUNDARIO}`}>
          <ol className="flex flex-wrap items-center gap-1">
            {migas.map((m, i) => (
              <li key={m.texto} className="flex items-center gap-1">
                {m.href ? <Link href={m.href} className={`${FOCO} rounded underline underline-offset-2`}>{m.texto}</Link> : <span aria-current="page">{m.texto}</span>}
                {i < migas.length - 1 && <span aria-hidden="true">›</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <h2 className={TITULO}>{titulo}</h2>
      {descripcion && <p className={`max-w-2xl ${TEXTO_SECUNDARIO}`}>{descripcion}</p>}
    </header>
  );
}

export function AvisoDatosEjemplo({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <p role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-[#b45309] bg-[#fffbeb] px-3 py-2 text-sm text-[#7c2d12]">
      <IconoAlerta className="mt-0.5 h-4 w-4 text-[#b45309]" />
      <span><strong>Datos de ejemplo.</strong> Vista local con el adaptador de ejemplo (solo capturas y pruebas; nunca en producción). Nada de lo que ves ni guardes aquí es real.</span>
    </p>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 2 · Estados separados (vacío ≠ error ≠ cargando ≠ sin permiso).
 * Qué hace: cada estado tiene su propio componente y su propio texto.
 * Para qué: un error de carga nunca se muestra como «Aún no tienes…» (brief UX §5).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Cargando: esqueletos con la forma final; tras ~10 s, «Sigue cargando…» + Reintentar. */
export function Esqueleto({ forma, lento, onReintentar }: { forma: 'tabla' | 'tarjetas' | 'formulario'; lento?: boolean; onReintentar?: () => void }) {
  const filas = forma === 'formulario' ? 4 : 3;
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: filas }).map((_, i) => (
          <div key={i} className={`${TARJETA} p-4`}>
            <div className="flex items-center justify-between gap-4">
              <div className="h-4 w-1/3 rounded bg-[#ece8f7] motion-safe:animate-pulse" />
              <div className="h-6 w-24 rounded-full bg-[#ece8f7] motion-safe:animate-pulse" />
            </div>
            <div className="mt-3 h-3 w-2/3 rounded bg-[#ece8f7] motion-safe:animate-pulse" />
            {forma !== 'tabla' && <div className="mt-3 h-10 w-full rounded-lg bg-[#f7f4ee] motion-safe:animate-pulse" />}
          </div>
        ))}
      </div>
      {lento && (
        <div className={`${TARJETA} mt-3 flex flex-wrap items-center gap-3 p-4`}>
          <p>Sigue cargando… La conexión está lenta.</p>
          {onReintentar && <button type="button" className={BOTON_SECUNDARIO} onClick={() => onReintentar()}>Reintentar</button>}
        </div>
      )}
    </div>
  );
}

/** Vacío: ilustración ligera + qué es + botón principal. Nunca usa el color de error. */
export function EstadoVacio({ titulo, texto, accion }: { titulo: string; texto: string; accion?: { texto: string; href: string } }) {
  return (
    <section className={`${TARJETA} flex flex-col items-center px-6 py-10 text-center`}>
      <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#ece8f7] text-[#3b2f8f]"><IconoVacio className="h-8 w-8" /></span>
      <h3 className="text-lg font-bold text-[#3b2f8f]">{titulo}</h3>
      <p className={`mt-1 max-w-md ${TEXTO_SECUNDARIO}`}>{texto}</p>
      {accion && <Link href={accion.href} className={`${BOTON_CTA} mt-5`}>{accion.texto}</Link>}
    </section>
  );
}

/** Error: ícono rojo + qué pasó + por qué (mensaje y código de la API) + qué hacer + Reintentar. */
export function EstadoError({ que_paso = 'No pudimos cargar esta información.', mensaje, codigo, http, onReintentar }: { que_paso?: string; mensaje: string; codigo: string; http: number; onReintentar: () => void }) {
  return (
    <section role="alert" className={`${TARJETA} border-l-4 border-l-[#b91c1c] px-5 py-6`}>
      <div className="flex items-start gap-3">
        <IconoError className="mt-0.5 h-6 w-6 text-[#b91c1c]" />
        <div className="min-w-0 space-y-1">
          <h3 className="text-lg font-bold text-[#b91c1c]">{que_paso}</h3>
          <p><span className="font-semibold">Por qué: </span>{mensaje} <span className={`text-sm ${TEXTO_SECUNDARIO}`}>(código {codigo}{http ? ` · HTTP ${http}` : ''})</span></p>
          <p><span className="font-semibold">Qué hacer: </span>Revisa tu conexión y toca Reintentar. Si sigue igual, avisa al equipo técnico con el código.</p>
          <button type="button" className={`${BOTON_SECUNDARIO} mt-3`} onClick={() => onReintentar()}>Reintentar</button>
        </div>
      </div>
    </section>
  );
}

/** Pinta la fase de carga que no es «ok» (cargando, error, sin permiso). Devuelve null si es «ok». */
export function FaseNoOk({ estado, forma, onReintentar }: { estado: { fase: string; lento?: boolean; http?: number; codigo?: string; mensaje?: string }; forma: 'tabla' | 'tarjetas' | 'formulario'; onReintentar: () => void }) {
  if (estado.fase === 'cargando') return <Esqueleto forma={forma} lento={estado.lento} onReintentar={onReintentar} />;
  if (estado.fase === 'sin_permiso') return <EstadoSinPermiso />;
  if (estado.fase === 'error') return <EstadoError mensaje={estado.mensaje ?? ''} codigo={estado.codigo ?? ''} http={estado.http ?? 0} onReintentar={onReintentar} />;
  return null;
}

/** Error en línea (de una acción, no de carga): ícono + mensaje de la API. `bloquea` → aria assertive. */
export function ErrorEnLinea({ mensaje, bloquea = true }: { mensaje: string | null | undefined; bloquea?: boolean }) {
  if (!mensaje) return null;
  return (
    <p role={bloquea ? 'alert' : 'status'} className="flex items-start gap-1.5 font-semibold text-[#b91c1c]">
      <IconoError className="mt-0.5 h-5 w-5" />
      <span>{mensaje}</span>
    </p>
  );
}

/** Aviso ámbar no bloqueante (sin respaldo, probar de nuevo, proveedor apagado, sin precio). */
export function AvisoAmbar({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-[#b45309] bg-[#fffbeb] px-3 py-2 font-semibold text-[#b45309]">
      <IconoAlerta className="mt-0.5 h-5 w-5" />
      <span>{children}</span>
    </p>
  );
}

/** Sin permiso: mensaje claro, sin datos ni conteos. */
export function EstadoSinPermiso() {
  return (
    <section className={`${TARJETA} flex items-start gap-3 px-5 py-6`}>
      <IconoCandado className="mt-0.5 h-6 w-6 text-[#3b2f8f]" />
      <div>
        <h3 className="text-lg font-bold text-[#3b2f8f]">No tienes permiso para ver esta sección</h3>
        <p className={TEXTO_SECUNDARIO}>La configuración de proveedores de IA es solo para super administradores. Si la necesitas, pídele acceso a Jhon.</p>
      </div>
    </section>
  );
}

/** Deshabilitado con motivo: el texto va al lado o debajo, nunca solo en un tooltip. */
export function MotivoDeshabilitado({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#b45309]">
      <IconoAlerta className="h-4 w-4" />
      <span>{children}</span>
    </p>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 3 · Chip de estado del proveedor (P5).
 * Qué hace: ícono + texto con el color semántico sobre un fondo claro del mismo tono.
 * Para qué: Borrador / Configurado / Probado / Encendido / Error legibles sin depender del color.
 * ──────────────────────────────────────────────────────────────────────────── */

const ESTILO_CHIP: Record<EstadoPanel, { clase: string; Icono: (p: { className?: string }) => ReactNode }> = {
  borrador: { clase: 'bg-[#f7f4ee] text-[#6b63a8] border-[#8a84b8]', Icono: IconoInfo },
  configurado: { clase: 'bg-[#ece8f7] text-[#3b2f8f] border-[#3b2f8f]/40', Icono: IconoConfigurado },
  probado: { clase: 'bg-[#f0fdf4] text-[#15803d] border-[#15803d]/40', Icono: IconoCheck },
  encendido: { clase: 'bg-[#f0fdf4] text-[#15803d] border-[#15803d]', Icono: IconoEncendido },
  error: { clase: 'bg-[#fef2f2] text-[#b91c1c] border-[#b91c1c]/50', Icono: IconoError }
};

export function ChipEstado({ estado }: { estado: EstadoPanel }) {
  const { clase, Icono } = ESTILO_CHIP[estado];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-sm font-semibold ${clase}`}>
      <Icono className="h-4 w-4" />
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 4 · Caja «¿Por qué? / ¿Para qué?».
 * Qué hace: fondo #ece8f7, ícono ⓘ, 2 líneas, plegable; abierta la primera vez y recuerda si la cerraste.
 * Para qué: explicar el porqué de cada paso (P1, A1, D8).
 * ──────────────────────────────────────────────────────────────────────────── */

export function CajaPorQue({ id, porQue, paraQue }: { id: string; porQue: string; paraQue: string }) {
  const clave = `buscoedu:e1:ayuda-cerrada:${id}`;
  const [abierta, setAbierta] = useState(true);
  const idCuerpo = useId();

  // Lee si el admin ya la cerró antes (solo en el navegador).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(clave) === '1') setAbierta(false);
    } catch {
      /* sin almacenamiento: queda abierta */
    }
  }, [clave]);

  // Alterna y recuerda la preferencia.
  function alternar() {
    const nueva = !abierta;
    setAbierta(nueva);
    try {
      window.localStorage.setItem(clave, nueva ? '0' : '1');
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
  }

  return (
    <aside className="mb-5 rounded-xl bg-[#ece8f7] px-4 py-3 text-[#1a1830]" aria-label="¿Por qué? / ¿Para qué?">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-[#3b2f8f]"><IconoInfo className="h-5 w-5" />¿Por qué? / ¿Para qué?</p>
        <button type="button" onClick={alternar} aria-expanded={abierta} aria-controls={idCuerpo} className={`${FOCO} min-h-[44px] rounded px-2 text-sm font-semibold text-[#3b2f8f] underline underline-offset-2`}>
          {abierta ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {abierta && (
        <div id={idCuerpo} className="mt-1 space-y-0.5 text-[15px] leading-snug">
          <p><strong>¿Por qué?</strong> {porQue}</p>
          <p><strong>¿Para qué?</strong> {paraQue}</p>
        </div>
      )}
    </aside>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 5 · Campo de formulario con ayuda y error.
 * Qué hace: etiqueta visible, rango debajo y error junto al campo con aria-describedby + aria-invalid.
 * Para qué: A5 y D3/D4 (el error vive junto al dato, no en un aviso que desaparece).
 * ──────────────────────────────────────────────────────────────────────────── */

export function Campo({
  etiqueta,
  valor,
  onCambio,
  ayuda,
  error,
  tipo = 'text',
  modoEntrada,
  autoComplete = 'off',
  lista,
  prefijo,
  sufijo,
  soloLectura
}: {
  etiqueta: string;
  valor: string;
  onCambio?: (v: string) => void;
  ayuda?: string;
  error?: string;
  tipo?: 'text' | 'password' | 'url';
  modoEntrada?: 'decimal' | 'numeric' | 'text' | 'url';
  autoComplete?: string;
  lista?: string;
  prefijo?: string;
  sufijo?: string;
  soloLectura?: boolean;
}) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describe = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-semibold text-[#1a1830]">{etiqueta}</label>
      <div className="flex items-center gap-2">
        {prefijo && <span className={`text-base ${TEXTO_SECUNDARIO}`} aria-hidden="true">{prefijo}</span>}
        <input
          id={id}
          type={tipo}
          inputMode={modoEntrada}
          autoComplete={autoComplete}
          spellCheck={false}
          list={lista}
          readOnly={soloLectura}
          value={valor}
          onChange={(e) => onCambio?.(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe}
          className={`${error ? CAMPO_ERROR : CAMPO} ${soloLectura ? 'bg-[#f7f4ee] text-[#6b63a8]' : ''}`}
        />
        {sufijo && <span className={`text-base ${TEXTO_SECUNDARIO}`} aria-hidden="true">{sufijo}</span>}
      </div>
      {ayuda && <p id={idAyuda} className={`text-sm ${TEXTO_SECUNDARIO}`}>{ayuda}</p>}
      {error && (
        <p id={idError} className="flex items-start gap-1.5 text-sm font-semibold text-[#b91c1c]">
          <IconoError className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 6 · Interruptor (role="switch").
 * Qué hace: botón accesible de 44 px con etiqueta visible; encendido = índigo, apagado = borde #8a84b8.
 * Para qué: el interruptor por fila de la tabla Proveedores (§3.8) y su versión en tarjetas.
 * ──────────────────────────────────────────────────────────────────────────── */

export function Interruptor({
  encendido,
  etiqueta,
  onCambio,
  deshabilitado,
  idMotivo,
  textoVisible = true
}: {
  encendido: boolean;
  etiqueta: string;
  onCambio: (e: MouseEvent<HTMLButtonElement>) => void;
  deshabilitado?: boolean;
  idMotivo?: string;
  textoVisible?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={encendido}
      aria-label={etiqueta}
      aria-describedby={idMotivo}
      aria-disabled={deshabilitado || undefined}
      onClick={(e) => {
        if (!deshabilitado) onCambio(e);
      }}
      className={`${FOCO} inline-flex min-h-[44px] items-center gap-2 rounded-full pr-1 ${deshabilitado ? 'cursor-not-allowed opacity-80' : ''}`}
    >
      <span className={`relative inline-flex h-7 w-12 items-center rounded-full border-2 motion-safe:transition-colors ${encendido ? 'border-[#3b2f8f] bg-[#3b2f8f]' : 'border-[#8a84b8] bg-white'} ${deshabilitado ? 'border-dashed' : ''}`}>
        <span className={`inline-block h-5 w-5 rounded-full motion-safe:transition-transform ${encendido ? 'translate-x-5 bg-white' : 'translate-x-0.5 bg-[#8a84b8]'}`} />
      </span>
      {textoVisible && <span className="text-sm font-semibold text-[#1a1830]">{encendido ? 'Encendido' : 'Apagado'}</span>}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 7 · Acciones principales.
 * Qué hace: en móvil quedan fijas abajo respetando env(safe-area-inset-bottom); en web van al final del formulario.
 * Para qué: que el CTA esté siempre a mano en 390 px sin tapar el último campo (el espaciador reserva el alto).
 * ──────────────────────────────────────────────────────────────────────────── */

export function AccionesFijas({ children, nota }: { children: ReactNode; nota?: ReactNode }) {
  return (
    <>
      {/* Espaciador solo en móvil: reserva el alto de la barra fija para no tapar el último campo. */}
      <div className="h-28 sm:hidden" aria-hidden="true" />
      {/* z-50: por encima del botón flotante «NaIA» del layout raíz (z-40), que en móvil tapaba la acción principal. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#ece8f7] bg-white/95 px-4 pt-3 shadow-[0_-4px_16px_rgba(26,24,48,0.08)] backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:z-auto sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
        {nota && <div className="mb-2 text-sm">{nota}</div>}
        <div className="flex items-center justify-between gap-3">{children}</div>
      </div>
    </>
  );
}

/** Resultado ✓ en verde con ícono (reutilizable). */
export function TextoExito({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 font-semibold text-[#15803d]"><IconoCheck className="h-5 w-5" />{children}</span>;
}
