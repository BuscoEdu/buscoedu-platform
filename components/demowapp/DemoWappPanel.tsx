'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AccionesOfertaEnHilo, CuerpoFunnelEnHilo } from './FunnelEnHilo';
import WhatsAppMark from './WhatsAppMark';
import { ofertaVisibleEnHilo, prepararBurbuja, trozosMarkdown } from './hiloTexto';
import { useFunnelHilo } from './useFunnelHilo';

interface ChatMessage {
  id: string;
  remitente_tipo: 'persona' | 'estudiante' | 'naia' | string;
  contenido: string;
  enviado_en?: string;
  creado_en?: string;
  metadatos?: {
    siguiente_accion_sugerida?: string | null;
  } | null;
}

interface Props {
  titulo: string;
  nombreContacto?: string;
  subtitulo?: string;
  mensajes: ChatMessage[];
  onEnviar: (texto: string, clientMessageId: string) => Promise<void>;
  disabled?: boolean;
  /**
   * MEJORA A.3: clase de altura del contenedor raíz. Por defecto ocupa 70vh
   * (uso embebido, por ejemplo Lead Center). Dentro de un modal con altura
   * definida se debe pasar 'h-full' para que ocupe el alto disponible sin
   * quedar "tapado" ni recortar el input.
   */
  alturaClase?: string;
  /**
   * BA-033: el hilo ocupa todo el viewport, sin tarjeta ni columnas.
   * El uso embebido de operación conserva la tarjeta de siempre.
   */
  soloHilo?: boolean;
  /** Cierre del canal estudiante. No abre el portal. */
  onCerrar?: () => void;
  /** BA-030: abre la hoja de operación por encima del hilo, no a su lado. */
  onAbrirOperacion?: () => void;
  /** Nombre de la oferta que se pinta como ficha dentro del hilo. */
  ofertaNombre?: string | null;
  /**
   * BA-031: id de la oferta del hilo. Con él se abre Aplicar o Mi lista
   * dentro del chat. Sin id no hay funnel. No se usa en el CRM embebido.
   */
  ofertaId?: string | null;
  /** Oportunidad del hilo abierto. Aplicar la manda en cada request para no cruzar contactos. */
  oportunidadId?: string | null;
  /** Aviso corto dentro del hilo (carga o error). No es un banner de portal. */
  avisoHilo?: string | null;
  /** Acción vacía dentro del hilo, por ejemplo elegir conversación. */
  accionVacia?: { etiqueta: string; onClick: () => void } | null;
}

function hora(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

/**
 * MEJORA A.2: burbuja de texto con efecto máquina de escribir.
 * Cuando `streaming` es true revela el contenido carácter a carácter (18 ms)
 * con un cursor parpadeante; al terminar avisa con `onDone` para limpiar el
 * estado de streaming en el panel.
 * BA-030: la negrita del mensaje se pinta en la burbuja, sin salir del hilo.
 */
function MensajeTexto({
  texto,
  streaming,
  onDone
}: {
  texto: string;
  streaming: boolean;
  onDone?: () => void;
}) {
  const [visible, setVisible] = useState(streaming ? '' : texto);

  useEffect(() => {
    if (!streaming) {
      setVisible(texto);
      return;
    }
    setVisible('');
    let indice = 0;
    const intervalo = setInterval(() => {
      indice += 1;
      setVisible(texto.slice(0, indice));
      if (indice >= texto.length) {
        clearInterval(intervalo);
        onDone?.();
      }
    }, 18);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, streaming]);

  const trozos = trozosMarkdown(visible);

  return (
    <p className="whitespace-pre-wrap">
      {trozos.map((trozo, indice) =>
        trozo.fuerte ? (
          <strong key={`${indice}-${trozo.texto}`}>{trozo.texto}</strong>
        ) : (
          <span key={`${indice}-${trozo.texto.slice(0, 12)}`}>{trozo.texto}</span>
        )
      )}
      {streaming && visible.length < texto.length && (
        <span className="animate-pulse text-gray-500">|</span>
      )}
    </p>
  );
}

export default function DemoWappPanel({
  titulo,
  nombreContacto,
  subtitulo,
  mensajes,
  onEnviar,
  disabled,
  alturaClase = 'h-[70vh]',
  soloHilo = false,
  onCerrar,
  onAbrirOperacion,
  ofertaNombre,
  ofertaId = null,
  oportunidadId = null,
  avisoHilo,
  accionVacia
}: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const mensajesRef = useRef<HTMLDivElement>(null);
  /* BA-031: el funnel vive en este hilo. Mi lista no comparte estado con Aplicar. */
  const funnel = useFunnelHilo(ofertaId, oportunidadId);

  // MEJORA A.1: mensajes optimistas del usuario (se muestran antes de que la
  // API responda) y el indicador de "NaIA está escribiendo...".
  const [mensajesLocales, setMensajesLocales] = useState<ChatMessage[]>([]);
  const [naiaEscribiendo, setNaiaEscribiendo] = useState(false);

  // MEJORA A.2: id del último mensaje de NaIA que debe animarse con typewriter.
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  // Ids ya vistos, para animar solo los mensajes de NaIA que llegan nuevos.
  const idsVistos = useRef<Set<string> | null>(null);

  // Merge inteligente: combina los mensajes reales (props) con los optimistas,
  // eliminando duplicados por id. Los optimistas usan el clientMessageId, que no
  // colisiona con los ids reales generados por la base de datos.
  const sortedMessages = useMemo(() => {
    const porId = new Map<string, ChatMessage>();
    [...(mensajes || []), ...mensajesLocales].forEach((m) => porId.set(m.id, m));
    return Array.from(porId.values()).sort(
      (a, b) => new Date(a.creado_en || a.enviado_en || 0).getTime() - new Date(b.creado_en || b.enviado_en || 0).getTime()
    );
  }, [mensajes, mensajesLocales]);

  /*
    La primera tanda, con el hilo ya cargado, es historial: no se anima.
    El panel de /demoWapp monta vacío y después recibe los mensajes; si se
    marcaran como nuevos, el typewriter taparía las opciones del hilo.
    Mientras `disabled` (está cargando), se olvida lo visto para no arrastrar
    la conversación anterior.
  */
  useEffect(() => {
    if (disabled) {
      idsVistos.current = null;
      setStreamingMsgId(null);
      return;
    }
    if (idsVistos.current === null) {
      idsVistos.current = new Set((mensajes || []).map((m) => m.id));
      return;
    }
    // Detecta mensajes de NaIA nuevos (no vistos) para activar el typewriter.
    let ultimoNaia: string | null = null;
    (mensajes || []).forEach((m) => {
      if (!idsVistos.current!.has(m.id)) {
        const esUsuario = m.remitente_tipo === 'persona' || m.remitente_tipo === 'estudiante';
        if (!esUsuario) ultimoNaia = m.id;
        idsVistos.current!.add(m.id);
      }
    });
    if (ultimoNaia) {
      const mensaje = (mensajes || []).find((item) => item.id === ultimoNaia);
      const cuerpo = mensaje
        ? prepararBurbuja(mensaje.contenido, mensaje.metadatos?.siguiente_accion_sugerida).cuerpo
        : '';
      /* Sin prosa no hay máquina de escribir: las opciones del hilo se muestran ya. */
      if (cuerpo) setStreamingMsgId(ultimoNaia);
    }
  }, [mensajes, disabled]);

  useEffect(() => {
    const panel = mensajesRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [sortedMessages.length, sortedMessages.at(-1)?.id, naiaEscribiendo, streamingMsgId, funnel.ancla]);

  const enviarTexto = async (textoCrudo: string) => {
    const text = textoCrudo.trim();
    if (!text || sending || disabled) return;
    setSending(true);
    setInput('');

    // MEJORA A.1: crea el mensaje optimista del usuario y lo muestra de inmediato.
    const clientMessageId = crypto.randomUUID();
    const msgOptimista: ChatMessage = {
      id: clientMessageId,
      remitente_tipo: 'persona',
      contenido: text,
      creado_en: new Date().toISOString()
    };
    setMensajesLocales((prev) => [...prev, msgOptimista]);
    setNaiaEscribiendo(true);

    try {
      await onEnviar(text, clientMessageId);
      // Al resolver, los mensajes reales ya llegaron por props: retiramos el
      // optimista para no duplicar la burbuja del usuario.
      setMensajesLocales((prev) => prev.filter((m) => m.id !== clientMessageId));
    } catch {
      // Si falla, revertimos el optimista y devolvemos el texto al input.
      setMensajesLocales((prev) => prev.filter((m) => m.id !== clientMessageId));
      setInput(text);
    } finally {
      setNaiaEscribiendo(false);
      setSending(false);
    }
  };

  const nombreOferta = ofertaVisibleEnHilo(ofertaNombre);
  const marco = soloHilo ? 'h-full min-h-0 w-full flex-1' : `${alturaClase} rounded-2xl border border-gray-200`;

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden bg-[#efeae2] ${marco}`}
      aria-label="Conversación con NaIA"
      style={
        soloHilo
          ? {
              backgroundImage: 'radial-gradient(rgba(17, 27, 33, 0.05) 0.7px, transparent 0.7px)',
              backgroundSize: '14px 14px'
            }
          : undefined
      }
    >
      {/*
        BA-033: barra del canal, a lo ancho del hilo.
        No es el header del portal ni un acceso a Explorar.
      */}
      <header
        className={`flex shrink-0 items-center gap-3 bg-[#075e54] px-3 py-3 text-white ${
          soloHilo ? 'pt-[max(0.75rem,env(safe-area-inset-top))]' : ''
        }`}
      >
        {onCerrar ? (
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar conversación"
            className="rounded-full px-2 py-2 text-lg leading-none text-white hover:bg-white/10"
          >
            ←
          </button>
        ) : (
          <WhatsAppMark className="h-7 w-7 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{titulo}</p>
          <p className="truncate text-xs text-green-100">
            {nombreContacto ? `${nombreContacto} · ` : ''}
            {subtitulo || 'NaIA · BuscoEdu'}
          </p>
        </div>
        {onAbrirOperacion ? (
          <button
            type="button"
            onClick={onAbrirOperacion}
            aria-label="Abrir operación"
            className="shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Operación
          </button>
        ) : null}
      </header>

      {/* BA-033: la columna del hilo es el único contenido del estudiante. */}
      <div ref={mensajesRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
        {avisoHilo ? (
          <p className="mx-auto max-w-sm rounded-lg bg-[#fff4c4] px-3 py-2 text-center text-xs leading-relaxed text-gray-700 shadow">
            {avisoHilo}
          </p>
        ) : null}

        {/* BA-030: la oferta va en una ficha del hilo, no en un panel lateral. */}
        {nombreOferta ? (
          <div className="flex justify-start">
            <article className="max-w-[82%] overflow-hidden rounded-2xl bg-white text-sm text-gray-900 shadow">
              <p className="bg-[#128c7e] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                Oferta en este chat
              </p>
              <div className="px-3 py-2">
                <p className="font-semibold leading-snug">{nombreOferta}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  Pregúntame por esta opción aquí mismo.
                  {ofertaId ? ' Aplicar y Mi lista siguen en este chat.' : ''}
                </p>
              </div>
              {/* BA-031: Aplicar y Mi lista salen de la ficha, sin salir del hilo. */}
              <AccionesOfertaEnHilo funnel={funnel} />
            </article>
          </div>
        ) : ofertaId ? (
          <div className="flex justify-start">
            <article className="max-w-[82%] overflow-hidden rounded-2xl bg-white text-sm text-gray-900 shadow">
              <p className="px-3 py-2 text-xs leading-relaxed text-gray-500">
                Puedes aplicar o guardar esta oferta sin salir del chat.
              </p>
              <AccionesOfertaEnHilo funnel={funnel} />
            </article>
          </div>
        ) : null}

        {sortedMessages.map((m) => {
          // Soporta `estudiante` en historiales previos y `persona` como valor
          // canónico para los nuevos mensajes.
          const mine = m.remitente_tipo === 'persona' || m.remitente_tipo === 'estudiante';
          const enStreaming = !mine && m.id === streamingMsgId;
          const burbuja = mine
            ? { cuerpo: m.contenido, opciones: [] as string[] }
            : prepararBurbuja(m.contenido, m.metadatos?.siguiente_accion_sugerida);
          const textoBurbuja = burbuja.cuerpo || (burbuja.opciones.length ? '' : 'Seguimos en este chat.');

          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {textoBurbuja ? (
                <div
                  className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow ${
                    mine ? 'rounded-br-md bg-[#dcf8c6] text-gray-900' : 'rounded-bl-md bg-white text-gray-900'
                  }`}
                >
                  <MensajeTexto
                    texto={textoBurbuja}
                    streaming={enStreaming}
                    onDone={() => setStreamingMsgId((actual) => (actual === m.id ? null : actual))}
                  />
                  <p className="mt-1 text-right text-[10px] text-gray-500">{hora(m.enviado_en || m.creado_en)}</p>
                </div>
              ) : null}

              {/*
                BA-030: opciones dentro del hilo, como respuestas rápidas.
                No navegan a Explorar ni abren filtros.
              */}
              {!mine && !enStreaming && burbuja.opciones.length > 0 ? (
                <div className="mt-1 w-full max-w-[82%] overflow-hidden rounded-xl bg-white shadow">
                  {burbuja.opciones.map((opcion) => (
                    <button
                      key={opcion}
                      type="button"
                      onClick={() => void enviarTexto(opcion)}
                      disabled={sending || disabled}
                      className="block w-full border-t border-gray-100 px-3 py-2.5 text-center text-sm font-medium text-[#075e54] first:border-t-0 disabled:opacity-50"
                    >
                      {opcion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        {/* BA-031: datos, permisos y confirmación van después de la conversación. */}
        <CuerpoFunnelEnHilo funnel={funnel} />

        {/* MEJORA A.1: indicador "NaIA está escribiendo..." mientras espera la API */}
        {naiaEscribiendo && (
          <div className="flex justify-start">
            <div className="max-w-[82%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-sm text-gray-500 shadow">
              <span className="inline-flex items-center gap-1">
                NaIA está escribiendo
                <span className="animate-pulse">…</span>
              </span>
            </div>
          </div>
        )}

        {!sortedMessages.length && !naiaEscribiendo && !nombreOferta ? (
          <p className="mx-auto max-w-sm rounded-lg bg-white px-3 py-2 text-center text-sm text-gray-500 shadow">
            Aún no hay mensajes en esta conversación.
          </p>
        ) : null}

        {/* Elegir conversación sigue siendo un control del hilo, no un listado lateral. */}
        {accionVacia && !sortedMessages.length && !naiaEscribiendo ? (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={accionVacia.onClick}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#075e54] shadow"
            >
              {accionVacia.etiqueta}
            </button>
          </div>
        ) : null}
      </div>

      {/*
        BA-033: el compositor va pegado al fondo del canal.
        BA-025 en el portal usa un muelle blanco; aquí el muelle es el de un chat,
        sin franja de resultados ni botón de Explorar.
      */}
      <footer
        className={`shrink-0 px-2 py-2 ${
          soloHilo
            ? 'bg-[#f0f2f5] pb-[max(0.5rem,env(safe-area-inset-bottom))]'
            : 'border-t border-gray-200 bg-white p-3'
        }`}
      >
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void enviarTexto(input);
              }
            }}
            disabled={sending || disabled}
            placeholder="Escribe un mensaje"
            aria-label="Mensaje para NaIA"
            className="min-h-11 flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm outline-none focus:border-[#075e54]"
          />
          <button
            type="button"
            onClick={() => void enviarTexto(input)}
            disabled={sending || disabled || !input.trim()}
            className="min-h-11 rounded-full bg-[#128c7e] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </footer>
    </section>
  );
}
