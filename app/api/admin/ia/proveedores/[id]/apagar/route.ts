import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { apagarProveedor } from '@/lib/admin-ia/servicioProveedores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-036 P10 — Apagar el proveedor con impacto + confirmación (transaccional vía N4).
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: C1.
 */
export const POST = rutaAdminIa(apagarProveedor);
