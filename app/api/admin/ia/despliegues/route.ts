import { rutaAdminIa } from '@/lib/admin-ia/ruta';
import { crearModelo, listarModelos } from '@/lib/admin-ia/servicioModelos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * E1 · BA-037 M1/M2 — Lista de modelos con prueba, precio y uso; crear modelo con parámetros, capacidades y precio.
 * Qué hace: solo super_admin (403 si no); delega en el servicio puro de lib/admin-ia.
 * Para qué: reemplazar el CRUD genérico (A5).
 */
export const GET = rutaAdminIa(listarModelos);
export const POST = rutaAdminIa(crearModelo);
