/**
 * BA-034 — Punto de entrada de la capa IA multi-proveedor (módulos puros).
 * La implementación con Supabase (Vault y registro de costo) vive en `supabase.ts`.
 */
export * from './tipos';
export * from './errores';
export * from './proveedores';
export * from './claves';
export * from './costo';
export * from './circuito';
export * from './motor';
export * from './cadena';
export * from './probar';
export * from './gasto';
export * from './precios';
export * from './preparar';
export { crearAdaptadorAbacus } from './adaptadorAbacus';
export type { ClienteAbacus } from './adaptadorAbacus';
export { crearAdaptadorAiSdk, fabricaModeloAiSdk, TIMEOUT_MS_POR_DEFECTO } from './adaptadorAiSdk';
export type { FabricaModelo } from './adaptadorAiSdk';
