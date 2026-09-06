'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import WhatsAppMark from './WhatsAppMark';

interface ChatMessage {
  id: string;
  remitente_tipo: 'persona' | 'estudiante' | 'naia' | string;
  contenido: string;
  enviado_en?: string;
  creado_en?: string;
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
   * (uso en la página independiente /demoWapp). Dentro de un modal con altura
   * definida se debe pasar 'h-full' para que ocupe el alto disponible sin
   * quedar "tapado" ni recortar el input.
   */
  alturaClase?: string;
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

  return (
    <p className="whitespace-pre-wrap">
      {visible}
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
  alturaClase = 'h-[70vh]'
}: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const mensajesRef = useRef<HTMLDivElement>(null);

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

  // Inicializa el conjunto de ids vistos con la carga inicial (sin animar nada).
  useEffect(() => {
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
    if (ultimoNaia) setStreamingMsgId(ultimoNaia);
  }, [mensajes]);

  useEffect(() => {
    const panel = mensajesRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [sortedMessages.length, sortedMessages.at(-1)?.id, naiaEscribiendo, streamingMsgId]);

  const submit = async () => {
    const text = input.trim();
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

  return (
    <section className={`flex ${alturaClase} flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#efeae2]`}>
      <header className="flex shrink-0 items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <WhatsAppMark className="h-7 w-7 shrink-0" />
        <div><p className="font-semibold">{titulo}</p>
        <p className="text-xs text-green-100">{nombreContacto ? `${nombreContacto} · ` : ''}{subtitulo || 'NaIA · BuscoEdu · Simulación interna'}</p></div>
      </header>

      <div ref={mensajesRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {sortedMessages.map((m) => {
          // Soporta `estudiante` en historiales previos y `persona` como valor
          // canónico para los nuevos mensajes.
          const mine = m.remitente_tipo === 'persona' || m.remitente_tipo === 'estudiante';
          const enStreaming = !mine && m.id === streamingMsgId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow ${
                  mine ? 'bg-[#dcf8c6] text-gray-900' : 'bg-white text-gray-900'
                }`}
              >
                <MensajeTexto
                  texto={m.contenido}
                  streaming={enStreaming}
                  onDone={() => setStreamingMsgId((actual) => (actual === m.id ? null : actual))}
                />
                <p className="mt-1 text-right text-[10px] text-gray-500">{hora(m.enviado_en || m.creado_en)}</p>
              </div>
            </div>
          );
        })}

        {/* MEJORA A.1: indicador "NaIA está escribiendo..." mientras espera la API */}
        {naiaEscribiendo && (
          <div className="flex justify-start">
            <div className="max-w-[82%] rounded-2xl bg-white px-3 py-2 text-sm text-gray-500 shadow">
              <span className="inline-flex items-center gap-1">
                NaIA está escribiendo
                <span className="animate-pulse">…</span>
              </span>
            </div>
          </div>
        )}

        {!sortedMessages.length && !naiaEscribiendo && (
          <p className="rounded-lg bg-white p-3 text-center text-sm text-gray-500">Aún no hay mensajes en esta conversación.</p>
        )}
      </div>

      <footer className="shrink-0 border-t border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            disabled={sending || disabled}
            placeholder="Escribe un mensaje como estudiante..."
            className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-green-500"
          />
          <button
            onClick={() => void submit()}
            disabled={sending || disabled || !input.trim()}
            className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </footer>
    </section>
  );
}
