/**
 * E1 · BA-036/037/038 — Puente entre las rutas Next y los servicios puros.
 *
 * Qué hace, en cada petición a /api/admin/ia (endpoints E1):
 *   1. `requireSuperAdminApi` → solo super_admin (A9); si no, 403 «No tienes permiso…».
 *   2. Lee params, query y cuerpo JSON (JSON roto → 400 `json_invalido`).
 *   3. Arma el contexto: datos con service_role, probador real, salud del circuito
 *      compartido (C4) y límite de pruebas.
 *   4. Corre el servicio y responde `{ status, body }` como NextResponse.
 * Para qué: que cada route.ts sea una línea y que permisos, errores y formato sean
 * idénticos en todos los endpoints. Nunca se registran claves ni valores de entorno.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { AbacusAdapter } from '@/lib/agentes/AbacusAdapter';
import { crearLectorClaves } from '@/lib/agentes/llm/claves';
import { circuitoCompartido } from '@/lib/agentes/llm/circuitoCompartido';
import { fuentesClaveSupabase, registroCostoSupabase } from '@/lib/agentes/llm/supabase';
import type { CtxAdmin, Peticion } from './contexto';
import { crearDatosSupabase } from './datosSupabase';
import { conSuperAdmin, fallo, type Autorizacion, type ResultadoApi } from './http';
import { crearLimitadorPruebas } from './limitador';
import { crearProbador } from './probador';

export type ServicioAdmin = (ctx: CtxAdmin, req: Peticion) => Promise<ResultadoApi>;
type ContextoRuta = { params: Promise<Record<string, string>> };

// Bloque 1: piezas compartidas por la instancia (límite de pruebas y cliente Abacus).
const permitirPrueba = crearLimitadorPruebas();
const clienteAbacus = new AbacusAdapter();

// Bloque 2: autorización super_admin (A9).
async function autorizar(): Promise<Autorizacion> {
  const guard = await requireSuperAdminApi();
  if (!guard.ok) return { ok: false };
  return { ok: true, actorId: (guard as Extract<typeof guard, { ok: true }>).ctx.usuarioInternoId };
}

// Bloque 3: cuerpo JSON (vacío = {}; roto = error).
async function leerCuerpo(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false }> {
  if (req.method === 'GET' || req.method === 'HEAD') return { ok: true, body: {} };
  const texto = await req.text();
  if (!texto.trim()) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(texto) };
  } catch {
    return { ok: false };
  }
}

/** Crea el handler Next de un endpoint E1. */
export function rutaAdminIa(servicio: ServicioAdmin) {
  return async (req: NextRequest, ruta?: ContextoRuta): Promise<NextResponse> => {
    const r = await conSuperAdmin(autorizar, async (actorId) => {
      const cuerpo = await leerCuerpo(req);
      if (!cuerpo.ok) return fallo(400, 'json_invalido', 'El cuerpo de la petición no es JSON válido.');
      const params = ruta?.params ? await ruta.params : {};
      // Lector de claves sin caché para las pruebas: tras guardar una clave, la
      // prueba usa la nueva al instante.
      const probador = crearProbador({ lector: crearLectorClaves(fuentesClaveSupabase, { ttlMs: 0 }), clienteAbacus, registroCosto: registroCostoSupabase });
      const ctx: CtxAdmin = {
        datos: crearDatosSupabase(getServiceRoleClient()),
        actorId,
        probador,
        circuitoAbiertoHasta: (id) => circuitoCompartido.abiertoHasta(id),
        permitirPrueba
      };
      return servicio(ctx, { params, query: req.nextUrl.searchParams, body: (cuerpo as { body: unknown }).body });
    });
    return NextResponse.json(r.body, { status: r.status });
  };
}
