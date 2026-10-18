import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { encenderProveedor } from '@/lib/admin-ia/servicioProveedores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-036 P9 — Encender el proveedor (exige clave y un modelo con prueba vigente; transaccional vía N4).
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: A7: nada se enciende sin probar.
 */
export const POST = rutaAdminIa(encenderProveedor);
