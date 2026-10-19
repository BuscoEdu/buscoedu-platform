import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { crearManejadorEventos, type BdEventos } from '@/src/lib/eventos-servidor';

/**
 * POST /api/eventos — registra un evento de negocio del sitio público (NaIA, Explorar, Mi lista).
 *
 * Qué: recibe { evento, visitante_id, oferta_id?, programa_id?, universidad_id?, metadatos? },
 * lo valida (lista permitida, UUIDs, metadatos ≤ 2 KB, sin campos extra), aplica cupo por IP y
 * por visitante y guarda en `eventos_negocio` con el cliente service role.
 * Por qué: el insert directo desde el navegador con la clave anon fallaba por RLS (42501, HTTP
 * 401) y los eventos se perdían; así no hay que abrir RLS a anon. La clave service role solo
 * existe en el servidor (SUPABASE_SERVICE_ROLE_KEY, sin prefijo NEXT_PUBLIC_).
 * Contrato completo: docs/backend/README-eventos.md. Lógica y pruebas: src/lib/eventos-servidor.ts.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// El cliente real de Supabase cumple la forma mínima BdEventos (from → insert/upsert).
export const POST = crearManejadorEventos({
  obtenerDb: () => getServiceRoleClient() as unknown as BdEventos
});
