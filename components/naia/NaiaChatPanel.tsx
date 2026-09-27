"use client";

import { useState, useRef, useEffect } from 'react';
import NaiaMessage from './NaiaMessage';
import SuggestedActions from './SuggestedActions';
import { callNaia, type NaiaResponse } from '@/src/lib/naia-real';
import { repararCopyFiltrado } from '@/components/naia/copyNaia';

export interface NaiaChatMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  /** MEJORA 2: marca el mensaje de NaIA para mostrarlo con efecto máquina de escribir. */
  streaming?: boolean;
}

export interface NaiaChatStateSnapshot {
  messages: NaiaChatMessage[];
  conversationId?: string;
  scrollTop: number;
  lastQuestion?: string | null;
  suggestedActions?: string[];
}

interface NaiaChatPanelProps {
  initialMessage?: string;
  onFiltersDetected: (filtros: NaiaResponse['filtros']) => void;
  className?: string;
  initialState?: Partial<NaiaChatStateSnapshot>;
  onStateChange?: (state: NaiaChatStateSnapshot) => void;
  onExploreCurrentFilter?: () => void;
  showMobileExploreButton?: boolean;
}

// Etiqueta unificada para abrir la ventana de resultados en móvil.
const ACTION_EXPLORE_CURRENT = 'Explorar resultados';

function sanitizeTone(text: string): string {
  if (!text) return '';
  return text
    .replace(/\b(¡)?excelente elección!?/gi, '')
    .replace(/\b(qué bueno que te guste esta carrera\.?)/gi, '')
    .replace(/\b(genial|perfecto)\.?\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function inferActionsFromQuestion(questionOrMessage: string, apiActions?: string[]): string[] {
  const fromApi = (apiActions || []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  if (fromApi.length >= 2) return [fromApi[0], fromApi[1], ACTION_EXPLORE_CURRENT];

  const text = questionOrMessage.toLowerCase();

  if (text.includes('pregrado') && text.includes('posgrado')) {
    return ['Me interesa pregrado', 'Me interesa posgrado', ACTION_EXPLORE_CURRENT];
  }
  if (text.includes('modalidad')) {
    return ['Prefiero modalidad virtual', 'Prefiero modalidad presencial', ACTION_EXPLORE_CURRENT];
  }
  if (text.includes('ciudad') || text.includes('ubicación') || text.includes('pais')) {
    return ['Quiero estudiar en Bogotá', 'Estoy abierto a cualquier ciudad', ACTION_EXPLORE_CURRENT];
  }
  if (text.includes('beneficio') || text.includes('beca') || text.includes('descuento')) {
    return ['Quiero opciones con beca', 'Quiero opciones con descuento', ACTION_EXPLORE_CURRENT];
  }

  return ['Quiero filtrar por modalidad', 'Quiero ajustar por ciudad', ACTION_EXPLORE_CURRENT];
}

export default function NaiaChatPanel({
  initialMessage,
  onFiltersDetected,
  className = '',
  initialState,
  onStateChange,
  onExploreCurrentFilter,
  showMobileExploreButton = false
}: NaiaChatPanelProps) {
  const [messages, setMessages] = useState<NaiaChatMessage[]>(initialState?.messages || []);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(initialState?.conversationId);
  const [showSuggestedActions, setShowSuggestedActions] = useState(
    Boolean(initialState?.suggestedActions?.length)
  );
  const [suggestedActions, setSuggestedActions] = useState<string[]>(initialState?.suggestedActions || []);
  const [lastQuestion, setLastQuestion] = useState<string | null>(initialState?.lastQuestion || null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const restoredScrollRef = useRef(false);
  const hasBootstrappedFromInitialMessage = useRef(false);

  const emitState = () => {
    if (!onStateChange) return;
    onStateChange({
      messages,
      conversationId,
      scrollTop: scrollContainerRef.current?.scrollTop || 0,
      lastQuestion,
      suggestedActions: showSuggestedActions ? suggestedActions : []
    });
  };

  // Restaurar scroll previo una sola vez.
  useEffect(() => {
    if (restoredScrollRef.current) return;
    if (!scrollContainerRef.current) return;

    const target = Number(initialState?.scrollTop || 0);
    if (target > 0) {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = target;
        }
      });
    }
    restoredScrollRef.current = true;
  }, [initialState?.scrollTop]);

  // Procesar mensaje inicial solo si no había historial.
  useEffect(() => {
    if (hasBootstrappedFromInitialMessage.current) return;
    if (!initialMessage || messages.length > 0) return;

    hasBootstrappedFromInitialMessage.current = true;
    void enviarAMotor(initialMessage, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage, messages.length]);

  // Auto-scroll al último mensaje durante conversación viva.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    emitState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, conversationId, showSuggestedActions, suggestedActions, lastQuestion]);

  /**
   * Envía un mensaje a NaIA (motor real) y agrega la respuesta al chat.
   */
  const enviarAMotor = async (mensaje: string, esInicial = false) => {
    setShowSuggestedActions(false);

    const userMsg: NaiaChatMessage = {
      id: `user-${Date.now()}`,
      content: mensaje,
      isUser: true,
      timestamp: new Date()
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const respuesta = await callNaia(mensaje, conversationId);

      if (respuesta.conversationId) {
        setConversationId(respuesta.conversationId);
      }

      const respuestaLimpia = repararCopyFiltrado(sanitizeTone(respuesta.mensaje)) || 'Actualicé la búsqueda con tu mensaje.';
      const preguntaLimpia = respuesta.pregunta_seguimiento
        ? repararCopyFiltrado(sanitizeTone(respuesta.pregunta_seguimiento))
        : null;
      const textoBase = esInicial ? `Hola, soy NaIA. ${respuestaLimpia}` : respuestaLimpia;

      const contenidoNaia = textoBase + (preguntaLimpia ? `\n\n${preguntaLimpia}` : '');
      const naiaMsgId = `naia-${Date.now()}`;
      const naiaMsg: NaiaChatMessage = {
        id: naiaMsgId,
        content: contenidoNaia,
        isUser: false,
        timestamp: new Date(),
        // MEJORA 2: se activa el efecto de tipeo al recibir la respuesta.
        streaming: true
      };
      setMessages((prev) => [...prev, naiaMsg]);

      // Retiramos la marca de streaming cuando termina la animación
      // (18 ms por carácter + un pequeño margen) para no re-animar al re-renderizar.
      const duracionTipeo = contenidoNaia.length * 18 + 200;
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) => (m.id === naiaMsgId ? { ...m, streaming: false } : m))
        );
      }, duracionTipeo);

      const tieneFiltrosDetectados = respuesta.filtros && Object.keys(respuesta.filtros).length > 0;
      if (tieneFiltrosDetectados) {
        onFiltersDetected(respuesta.filtros);
      }

      const anchorText = preguntaLimpia || respuestaLimpia;
      const actions = inferActionsFromQuestion(anchorText, respuesta.opciones_sugeridas);
      setSuggestedActions(actions);
      setLastQuestion(anchorText);
      setShowSuggestedActions(true);
    } catch {
      const errorMsg: NaiaChatMessage = {
        id: `naia-error-${Date.now()}`,
        content: 'Tuve un inconveniente para responder en este momento. ¿Puedes intentarlo de nuevo?',
        isUser: false,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = () => {
    const trimmedMessage = inputValue.trim();
    if (!trimmedMessage || isLoading) return;
    setInputValue('');
    void enviarAMotor(trimmedMessage);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestedActionSelect = (actionText: string) => {
    if (isLoading) return;

    if (actionText === ACTION_EXPLORE_CURRENT) {
      setShowSuggestedActions(false);
      onExploreCurrentFilter?.();
      return;
    }

    void enviarAMotor(actionText);
  };

  return (
    /*
      BA-025: misma superficie gris y el mismo marco que la ventana de
      NaiaSearchExperience. El hilo no hereda el fondo claro del sitio.
    */
    <div className={`naia-chat-window relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border-2 border-buscoedu-chat-edge ${className}`}>
      {/* Filete de marca, igual que en la experiencia de búsqueda. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-1 rounded-t-2xl bg-buscoedu-teal" aria-hidden="true" />
      <div className="border-b-2 border-buscoedu-chat-edge bg-white p-4">
        <h2 className="text-lg font-bold text-buscoedu-blue">Chat con NaIA</h2>
        <p className="text-sm text-buscoedu-muted">Tu asesora virtual educativa</p>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto bg-buscoedu-chat p-4"
        onScroll={emitState}
      >
        {messages.length === 0 && !isLoading && (
          <div className="py-8 text-center">
            {/* Mismo criterio de lectura que el saludo de NaiaSearchExperience. */}
            <p className="text-sm text-buscoedu-text">Hola, soy NaIA. ¿En qué puedo ayudarte hoy?</p>
          </div>
        )}

        {messages.map((message) => (
          <NaiaMessage
            key={message.id}
            content={message.content}
            isUser={message.isUser}
            timestamp={message.timestamp}
            streaming={message.streaming}
          />
        ))}

        {isLoading && (
          <div className="mb-4 flex flex-col items-start">
            <div className="naia-chat-bubble rounded-lg px-4 py-3">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-buscoedu-teal" style={{ animationDelay: '0ms' }}></div>
                  <div className="h-2 w-2 animate-bounce rounded-full bg-buscoedu-teal" style={{ animationDelay: '150ms' }}></div>
                  <div className="h-2 w-2 animate-bounce rounded-full bg-buscoedu-teal" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-xs text-buscoedu-muted">NaIA está pensando...</span>
              </div>
            </div>
          </div>
        )}

        {showSuggestedActions && !isLoading && (
          <SuggestedActions
            isLoading={isLoading}
            actions={suggestedActions}
            onSelectAction={handleSuggestedActionSelect}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Muelle blanco: el campo se separa de la superficie gris del hilo. */}
      <div className="border-t-2 border-buscoedu-chat-edge bg-white p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Escribe tu pregunta o criterio de búsqueda..."
            disabled={isLoading}
            className="flex-1 rounded-lg border border-buscoedu-border px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-buscoedu-blue disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="rounded-lg bg-buscoedu-teal px-4 py-2 font-semibold text-white transition-colors hover:bg-buscoedu-teal/90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Enviar mensaje"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>

        {showMobileExploreButton && (
          <button
            type="button"
            onClick={() => onExploreCurrentFilter?.()}
            className="mt-3 w-full rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white"
          >
            Ver resultados
          </button>
        )}
      </div>
    </div>
  );
}
