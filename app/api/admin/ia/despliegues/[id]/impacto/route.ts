import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { impactoModelo } from '@/lib/admin-ia/servicioModelos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-037 M7 — Impacto de apagar el modelo.
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: C1.
 */
export const GET = rutaAdminIa(impactoModelo);
