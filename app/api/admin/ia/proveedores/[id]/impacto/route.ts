import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { impactoProveedor } from '@/lib/admin-ia/servicioProveedores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-036 P8 — Impacto de apagar el proveedor.
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: mostrar «N agentes lo usan; M quedarían sin IA» antes de confirmar.
 */
export const GET = rutaAdminIa(impactoProveedor);
