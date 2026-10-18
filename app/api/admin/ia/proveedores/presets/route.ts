import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { listarPresets } from '@/lib/admin-ia/servicioProveedores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-036 P1 — Presets del asistente (Abacus, OpenAI, Anthropic, Google, xAI, OpenRouter, otro compatible).
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: que el paso 1 «Elegir» no pida datos técnicos.
 */
export const GET = rutaAdminIa(listarPresets);
