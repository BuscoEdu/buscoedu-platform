'use client';

import { useEffect, useState } from 'react';
import { obtenerOfertasPorIds } from '@/src/lib/ofertas';
import { esErrorHiloReintento, type DecisionHilo, type MensajeFunnel, type VistaFunnel } from './funnelContrato';
import type { FunnelHilo } from './useFunnelHilo';

/**
 * BA-031 · Piezas del funnel dentro del hilo.
 * No abren Explorar, filtros ni el CRM. Mi lista y Aplicar
 * se pintan en carriles distintos y solo aceptar puede decir
 * que hubo solicitud.
 */

function hora(iso?: string) {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function BurbujaFunnel({ mensaje }: { mensaje: MensajeFunnel }) {
  const error = mensaje.tipo === 'error';
  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[92%] rounded-2xl rounded-bl-md px-3 py-2 text-sm shadow ${
          error ? 'bg-[#fff4c4] text-gray-900' : 'bg-white text-gray-900'
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{mensaje.texto}</p>
        {mensaje.en ? <p className="mt-1 text-right text-[10px] text-gray-500">{hora(mensaje.en)}</p> : null}
      </div>
    </div>
  );
}

function AvisoCarga() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-sm text-gray-500 shadow">
        <span className="inline-flex items-center gap-1">
          NaIA está revisando en este chat
          <span className="animate-pulse">…</span>
        </span>
      </div>
    </div>
  );
}

/** Línea de estado. Sin aceptación explícita dice que no hay solicitud. */
function EstadoSolicitud({ vista }: { vista: VistaFunnel }) {
  let texto = 'Sin solicitud para la universidad.';
  if (vista.ui.cargando) texto = 'Revisando… todavía sin solicitud.';
  else if (vista.leadCreado) texto = 'Solicitud registrada en este hilo.';
  else if (vista.ok && vista.ui.paso === 'mi_lista') texto = 'En Mi lista. Sin solicitud para la universidad.';
  else if (vista.ui.paso === 'rechazada' || vista.ui.paso === 'abandonada') {
    texto = 'Cerrada sin solicitud para la universidad.';
  }

  return (
    <p className="px-1 text-[11px] leading-relaxed text-gray-500" data-lead-creado={vista.leadCreado ? 'true' : 'false'}>
      {texto}
    </p>
  );
}

function BotonHilo({
  children,
  onClick,
  disabled,
  tono = 'texto'
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
  tono?: 'texto' | 'lleno';
}) {
  const clase =
    tono === 'lleno'
      ? 'bg-[#128c7e] font-semibold text-white disabled:opacity-50'
      : 'font-medium text-[#075e54] disabled:opacity-50';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full border-t border-gray-100 px-3 py-2.5 text-center text-sm first:border-t-0 ${clase}`}
    >
      {children}
    </button>
  );
}

/**
 * Acciones sobre la oferta del hilo.
 * Aplicar abre el registro. Mi lista no pide datos ni consentimiento.
 */
export function AccionesOfertaEnHilo({ funnel }: { funnel: FunnelHilo }) {
  if (!funnel.ofertaId) return null;
  const cerrada = funnel.aplicar?.ui.paso === 'aceptada'
    || funnel.aplicar?.ui.paso === 'rechazada'
    || funnel.aplicar?.ui.paso === 'abandonada';
  const etiquetaAplicar = cerrada ? 'Aplicar otra vez' : 'Aplicar';
  const enLista = funnel.miLista?.ui.paso === 'mi_lista' && funnel.miLista.ok;
  const cargandoAplicar = funnel.aplicar?.ui.cargando === true;
  const cargandoLista = funnel.miLista?.ui.cargando === true;

  return (
    <div className="border-t border-gray-100" data-funnel-acciones="oferta">
      <BotonHilo onClick={funnel.iniciarAplicar} disabled={cargandoAplicar}>
        {etiquetaAplicar}
      </BotonHilo>
      <BotonHilo onClick={funnel.guardarEnLista} disabled={cargandoLista}>
        {enLista ? 'En Mi lista' : 'Guardar en Mi lista'}
      </BotonHilo>
    </div>
  );
}

function FormularioDatos({ funnel }: { funnel: FunnelHilo }) {
  const vista = funnel.aplicar;
  if (!vista) return null;
  const acciones = new Set(vista.ui.acciones);
  /* El formulario solo vive en el paso de datos. Abandonar en consentimiento va aparte. */
  if (!acciones.has('enviar_datos')) return null;
  const bloqueado = vista.ui.cargando;

  return (
    <form
      className="max-w-[92%] overflow-hidden rounded-2xl bg-white text-sm text-gray-900 shadow"
      onSubmit={(evento) => {
        evento.preventDefault();
        funnel.enviarDatos();
      }}
      data-funnel-paso="datos"
    >
      <p className="bg-[#128c7e] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
        Tus datos en este chat
      </p>
      <div className="space-y-2 px-3 py-3">
        <label className="block text-xs text-gray-600">
          Nombre completo
          <input
            value={funnel.borrador.nombre}
            onChange={(evento) => funnel.cambiarBorrador('nombre', evento.target.value)}
            disabled={bloqueado}
            autoComplete="name"
            placeholder="Tu nombre completo"
            className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#075e54] disabled:bg-gray-50"
          />
        </label>
        <label className="block text-xs text-gray-600">
          Celular
          <input
            value={funnel.borrador.celular}
            onChange={(evento) => funnel.cambiarBorrador('celular', evento.target.value)}
            disabled={bloqueado}
            inputMode="tel"
            autoComplete="tel"
            placeholder="3001234567"
            className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#075e54] disabled:bg-gray-50"
          />
        </label>
        <label className="block text-xs text-gray-600">
          Correo (opcional)
          <input
            value={funnel.borrador.correo}
            onChange={(evento) => funnel.cambiarBorrador('correo', evento.target.value)}
            disabled={bloqueado}
            type="email"
            autoComplete="email"
            placeholder="Si quieres, tu correo"
            className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#075e54] disabled:bg-gray-50"
          />
        </label>
      </div>
      <BotonHilo onClick={funnel.enviarDatos} disabled={bloqueado || !acciones.has('enviar_datos')} tono="lleno">
        Enviar mis datos
      </BotonHilo>
      {acciones.has('abandonar') ? (
        <BotonHilo onClick={() => funnel.decidir('abandonar')} disabled={bloqueado}>
          Abandonar
        </BotonHilo>
      ) : null}
    </form>
  );
}

/**
 * Universidades de la oferta, antes de aceptar.
 * Aceptar sigue deshabilitado hasta ver al menos un nombre: sin eso no se crea el lead.
 */
function UniversidadesAAutorizar({
  ofertaId,
  ofertaNombre,
  onLista
}: {
  ofertaId: string;
  ofertaNombre: string | null;
  onLista: (nombres: string[]) => void;
}) {
  const [nombres, setNombres] = useState<string[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setNombres(null);
    setFallo(false);
    /* Hasta que llegue el nombre, Aceptar sigue apagado. */
    onLista([]);
    void obtenerOfertasPorIds([ofertaId])
      .then((resultado) => {
        if (cancelado) return;
        if (!resultado.ok) {
          setFallo(true);
          setNombres([]);
          onLista([]);
          return;
        }
        const lista = [
          ...new Set(
            resultado.ofertas
              .map((oferta) => oferta.universidad?.nombre?.trim())
              .filter((nombre): nombre is string => Boolean(nombre))
          )
        ];
        setNombres(lista);
        setFallo(lista.length === 0);
        onLista(lista);
      })
      .catch(() => {
        if (cancelado) return;
        setFallo(true);
        setNombres([]);
        onLista([]);
      });
    return () => {
      cancelado = true;
    };
  }, [ofertaId, intento, onLista]);

  return (
    <div className="rounded-xl border border-[#128c7e]/30 bg-[#f3faf8] px-2 py-2" data-universidades-autorizar="true">
      <p className="text-xs font-semibold text-[#075e54]">Universidades a autorizar</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-600">
        Si aceptas, se crea un lead por cada universidad de esta lista. Si no aceptas, no se crea ninguno.
        {ofertaNombre ? ` Oferta: ${ofertaNombre}.` : ''}
      </p>
      {nombres === null ? <p className="mt-2 text-xs text-gray-500">Leyendo la universidad de la oferta…</p> : null}
      {nombres && nombres.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm font-medium text-gray-900">
          {nombres.map((nombre) => (
            <li key={nombre}>{nombre}</li>
          ))}
        </ul>
      ) : null}
      {fallo ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs leading-relaxed text-gray-700">
            No pude mostrar la universidad. No aceptes hasta ver el nombre: así no sale un lead a ciegas.
          </p>
          <button
            type="button"
            onClick={() => setIntento((actual) => actual + 1)}
            className="min-h-11 rounded-full border border-[#075e54] px-3 py-2 text-xs font-semibold text-[#075e54]"
          >
            Reintentar universidades
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** 400 hilo_requerido y 409 hilo_no_coincide: texto del servidor y reintento. Nunca queda en blanco. */
function AvisoErrorHilo({ vista, onReintentar }: { vista: VistaFunnel | null; onReintentar: () => void }) {
  if (!vista || vista.ok || vista.ui.cargando || !esErrorHiloReintento(vista.code)) return null;
  const texto =
    vista.error ||
    vista.mensajes.find((mensaje) => mensaje.tipo === 'error')?.texto ||
    'No pude usar este hilo. Reintenta. No quedó ninguna solicitud.';
  return (
    <div className="max-w-[92%] rounded-2xl bg-[#fff4c4] px-3 py-3 text-sm text-gray-900 shadow" data-hilo-error={vista.code} role="alert">
      <p className="font-semibold">No se aplicó en este hilo</p>
      <p className="mt-1 leading-relaxed">{texto}</p>
      <button
        type="button"
        onClick={onReintentar}
        className="mt-2 min-h-11 rounded-full bg-[#075e54] px-4 py-2 text-sm font-semibold text-white"
      >
        Reintentar
      </button>
    </div>
  );
}

function PanelConsentimiento({ funnel }: { funnel: FunnelHilo }) {
  const vista = funnel.aplicar;
  const [universidades, setUniversidades] = useState<string[] | null>(null);
  if (!vista || vista.ui.paso !== 'consentimiento') return null;
  const acciones = new Set(vista.ui.acciones);
  const bloqueado = vista.ui.cargando;
  const decidir = (decision: DecisionHilo) => funnel.decidir(decision);
  /* Aceptar solo con la lista de IES ya visible. Rechazar no crea lead. */
  const puedeAceptar = (universidades?.length || 0) > 0;

  return (
    <div className="max-w-[92%] overflow-hidden rounded-2xl bg-white text-sm text-gray-900 shadow" data-funnel-paso="consentimiento">
      <p className="bg-[#128c7e] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
        Permisos
      </p>
      <div className="space-y-2 px-3 py-3">
        <p className="text-xs leading-relaxed text-gray-600">
          Nada viene marcado. Si no aceptas, no queda solicitud para la universidad.
        </p>
        {funnel.ofertaId ? (
          <UniversidadesAAutorizar
            ofertaId={funnel.ofertaId}
            ofertaNombre={vista.sesionDemo?.ofertaNombre || null}
            onLista={setUniversidades}
          />
        ) : null}
        {!vista.consentimientos.length ? (
          <BotonHilo onClick={funnel.verPermisos} disabled={bloqueado}>
            Ver permisos
          </BotonHilo>
        ) : null}
        {vista.consentimientos.map((item) => (
          <label key={item.codigo} className="flex items-start gap-2 rounded-xl border border-gray-100 px-2 py-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[#128c7e]"
              checked={funnel.marcas[item.codigo] === true}
              disabled={bloqueado}
              onChange={(evento) => funnel.alternarMarca(item.codigo, evento.target.checked)}
            />
            <span>
              <span className="block font-medium leading-snug">{item.nombre}</span>
              {item.esObligatorio ? (
                <span className="mt-0.5 block text-[11px] text-gray-500">Necesaria para seguir</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      {acciones.has('aceptar') ? (
        <BotonHilo onClick={() => decidir('aceptar')} disabled={bloqueado || !puedeAceptar} tono="lleno">
          {puedeAceptar ? 'Aceptar' : 'Aceptar (falta la universidad)'}
        </BotonHilo>
      ) : null}
      {acciones.has('rechazar') ? (
        <BotonHilo onClick={() => decidir('rechazar')} disabled={bloqueado}>
          No autorizo
        </BotonHilo>
      ) : null}
      {acciones.has('abandonar') ? (
        <BotonHilo onClick={() => decidir('abandonar')} disabled={bloqueado}>
          Abandonar
        </BotonHilo>
      ) : null}
    </div>
  );
}

/**
 * Burbujas, formulario y consentimiento al final del hilo.
 * El carril de Mi lista no muestra datos ni permisos.
 */
export function CuerpoFunnelEnHilo({ funnel }: { funnel: FunnelHilo }) {
  if (!funnel.ofertaId) return null;
  const aplicar = funnel.aplicar;
  const lista = funnel.miLista;
  if (!aplicar && !lista) return null;

  return (
    <div className="space-y-2 pt-1" data-ancla-funnel={funnel.ancla}>
      {lista ? (
        <div className="space-y-2" data-funnel="mi-lista" data-paso={lista.ui.paso || ''} data-cargando={lista.ui.cargando ? 'true' : 'false'}>
          {lista.mensajes.map((mensaje) => (
            <BurbujaFunnel key={`lista-${mensaje.id}`} mensaje={mensaje} />
          ))}
          <AvisoErrorHilo vista={lista} onReintentar={funnel.reintentar} />
          {lista.ui.cargando ? <AvisoCarga /> : null}
          <EstadoSolicitud vista={lista} />
        </div>
      ) : null}

      {aplicar ? (
        <div
          className="space-y-2"
          data-funnel="aplicar"
          data-paso={aplicar.ui.paso || ''}
          data-cargando={aplicar.ui.cargando ? 'true' : 'false'}
          data-lead-creado={aplicar.leadCreado ? 'true' : 'false'}
          aria-busy={aplicar.ui.cargando}
        >
          {aplicar.mensajes.map((mensaje) => (
            <BurbujaFunnel key={`aplicar-${mensaje.id}`} mensaje={mensaje} />
          ))}
          <AvisoErrorHilo vista={aplicar} onReintentar={funnel.reintentar} />
          {aplicar.ui.cargando ? <AvisoCarga /> : null}
          <FormularioDatos funnel={funnel} />
          <PanelConsentimiento funnel={funnel} />
          <EstadoSolicitud vista={aplicar} />
        </div>
      ) : null}
    </div>
  );
}
