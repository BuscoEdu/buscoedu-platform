import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { guardarClave } from '@/lib/admin-ia/servicioProveedores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-036 P6 — Guardar o reemplazar la clave en Vault (nunca se devuelve ni se registra).
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: paso 2 «Clave» y «Reemplazar» (A3, A4).
 */
export const PUT = rutaAdminIa(guardarClave);
