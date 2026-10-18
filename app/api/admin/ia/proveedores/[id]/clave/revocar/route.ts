import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { revocarClave } from '@/lib/admin-ia/servicioProveedores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-036 P7 — Revocar la clave con aviso de impacto y confirmación.
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: que revocar nunca deje agentes sin IA por sorpresa (C1).
 */
export const POST = rutaAdminIa(revocarClave);
