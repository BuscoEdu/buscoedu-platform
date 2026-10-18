/**
 * BA-032 · Webhook de WhatsApp Cloud API (Meta).
 *
 * GET  /api/whatsapp/webhook → verificación de suscripción (hub.challenge | 403).
 * POST /api/whatsapp/webhook → firma X-Hub-Signature-256 obligatoria (401 si falla),
 *                               respuesta 200 inmediata y procesamiento con after().
 *
 * Fail-closed: sin META_WA_VERIFY_TOKEN → 403; sin META_APP_SECRET → 401;
 * sin WA_PILOTO_NUMEROS y sin WA_REAL_HABILITADO='true' → no se responde a nadie;
 * WA_LEAD_CONVERSION_ENABLED distinto de 'true' → nunca se crea oportunidad.
 */

import { after, type NextRequest } from 'next/server';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { leerConfigWhatsApp } from '@/src/lib/whatsapp/config';
import { crearClienteGraph } from '@/src/lib/whatsapp/graph-client';
import { crearLimitadorMemoria, type LimitadorTasa } from '@/src/lib/whatsapp/rate-limit';
import { filtrarPermitidos, manejarPostWebhook, manejarVerificacionGet, procesarLote } from '@/src/lib/whatsapp/procesar-webhook';
import { crearAlmacenSupabase } from '@/src/lib/whatsapp/almacen-supabase';
import { crearCatalogoSupabase } from '@/src/lib/whatsapp/catalogo-supabase';
import { conversorBloqueado, crearConversorSupabase } from '@/src/lib/whatsapp/conversor-supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Bloque: límite por número en memoria (por instancia). Reemplazable por uno compartido.
let limitador: LimitadorTasa | null = null;
function obtenerLimitador(maxPorMinuto: number): LimitadorTasa {
  if (!limitador) limitador = crearLimitadorMemoria(maxPorMinuto, 60_000);
  return limitador;
}

// Bloque: log mínimo, sin números completos, sin textos y sin secretos.
function log(evento: string, datos?: Record<string, unknown>) {
  console.info(JSON.stringify({ origen: 'wa_webhook', evento, ...(datos || {}) }));
}

export async function GET(req: NextRequest) {
  const config = leerConfigWhatsApp();
  const r = manejarVerificacionGet(req.nextUrl.searchParams, config);
  if (r.status !== 200) log('verificacion_rechazada');
  return new Response(r.cuerpo, { status: r.status, headers: { 'Content-Type': r.contentType } });
}

export async function POST(req: NextRequest) {
  const config = leerConfigWhatsApp();
  const cuerpoCrudo = await req.text();
  const resultado = manejarPostWebhook(cuerpoCrudo, req.headers.get('x-hub-signature-256'), config);

  if (resultado.respuesta.status !== 200) {
    log('firma_invalida_o_sin_secreto');
  } else {
    if (resultado.statuses > 0) log('statuses_recibidos', { cantidad: resultado.statuses });
    // Piloto cerrado: fuera de la allowlist no se toca la base ni Graph API (solo log mínimo).
    const { permitidos, rechazados } = filtrarPermitidos(resultado.mensajes, config);
    if (rechazados.length > 0) {
      log('fuera_allowlist', { numeros: rechazados, pilotoInvalido: config.pilotoInvalido });
    }
    if (permitidos.length > 0) {
      // Se responde 200 ya; el trabajo sigue después de enviar la respuesta.
      after(async () => {
        try {
          const db = getServiceRoleClient();
          const deps = {
            config,
            almacen: crearAlmacenSupabase(db),
            catalogo: crearCatalogoSupabase(db),
            conversor: config.leadConversionHabilitada ? crearConversorSupabase(db, log) : conversorBloqueado,
            enviador: crearClienteGraph({
              token: config.token,
              phoneNumberId: config.phoneNumberId,
              versionGraph: config.versionGraph,
              timeoutMs: config.timeoutMs
            }),
            limitador: obtenerLimitador(config.limiteMensajesPorMinuto),
            log
          };
          const resultados = await procesarLote(permitidos, deps);
          log('lote_procesado', { resultados });
        } catch (error) {
          log('lote_error', { error: error instanceof Error ? error.message.slice(0, 200) : 'desconocido' });
        }
      });
    }
  }

  return new Response(resultado.respuesta.cuerpo, {
    status: resultado.respuesta.status,
    headers: { 'Content-Type': resultado.respuesta.contentType }
  });
}
