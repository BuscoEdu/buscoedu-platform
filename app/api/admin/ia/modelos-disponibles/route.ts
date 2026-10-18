import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { listarDisponibles } from '@/lib/admin-ia/servicioAgentes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-037 B-1 — Modelos elegibles para un agente (prueba vigente + encendido).
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: B1.
 */
export const GET = rutaAdminIa(listarDisponibles);
