'use client';

/**
 * E1 · BA-036 — Pantalla «Proveedores» (UX §3.8–§3.9; P2, P8–P10).
 *
 * Qué hace: lista los proveedores con chip de estado (Borrador / Configurado / Probado / Encendido /
 * Error, siempre ícono + texto), última prueba, cuántos agentes lo usan y un interruptor por fila
 * con aviso de impacto. En web es una tabla; por debajo de 768 px, una tarjeta por proveedor con el
 * chip arriba a la derecha y el interruptor con su etiqueta visible.
 * Para qué: ver de un vistazo qué está configurado, qué está en uso y apagar en un clic con
 * conciencia del impacto. Estados separados: cargando ≠ vacío ≠ error ≠ sin permiso.
 */

import Link from 'next/link';
import { clienteAdminIa } from '@/src/lib/admin-ia/cliente';
import { fechaHora } from '@/src/lib/admin-ia/logica';
import type { ProveedorApi } from '@/src/lib/admin-ia/tipos';
import { AvisoAmbar, AvisoDatosEjemplo, CajaPorQue, ChipEstado, EncabezadoPantalla, EstadoVacio, FaseNoOk, TextoExito } from './Base';
import InterruptorConImpacto from './InterruptorConImpacto';
import { BOTON_CTA, ENLACE, TARJETA, TEXTO_SECUNDARIO } from './estilos';
import { IconoError } from './Iconos';
import { usarCarga } from './usarCarga';

/** Nombre corto para los botones («xAI (Grok)» → «xAI»). */
export function nombreCorto(nombre: string) {
  return nombre.replace(/\s*\(.*\)$/, '');
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1 · Celdas reutilizables (tabla y tarjeta).
 * Qué hace: última prueba, uso por agentes y la razón para no poder encender.
 * Para qué: que la tabla web y las tarjetas móviles digan exactamente lo mismo (paridad 390 px).
 * ──────────────────────────────────────────────────────────────────────────── */

function UltimaPrueba({ p }: { p: ProveedorApi }) {
  const u = p.ultima_prueba;
  if (!u) return <span className={TEXTO_SECUNDARIO}>Sin probar</span>;
  return (
    <span className="block">
      {u.exitosa ? (
        <TextoExito>Exitosa · {u.latencia_ms} ms</TextoExito>
      ) : (
        <span className="inline-flex items-center gap-1 font-semibold text-[#b91c1c]"><IconoError className="h-4 w-4" />Falló</span>
      )}
      {u.exitosa && !u.vigente && <span className="block text-sm font-semibold text-[#b45309]">Ya no vigente: prueba de nuevo</span>}
      <span className={`block text-sm ${TEXTO_SECUNDARIO}`}>{fechaHora(u.probado_en)}</span>
    </span>
  );
}

function UsoAgentes({ p }: { p: ProveedorApi }) {
  const total = p.usado_por.principal + p.usado_por.respaldo;
  return (
    <span>
      <strong>{total}</strong> {total === 1 ? 'agente' : 'agentes'}
      {total > 0 && <span className={`block text-sm ${TEXTO_SECUNDARIO}`}>{p.usado_por.principal} principal · {p.usado_por.respaldo} respaldo</span>}
    </span>
  );
}

/** A7/P9: por qué no se puede encender. null si sí se puede. */
function motivoNoEncender(p: ProveedorApi): string | null {
  if (!p.clave.configurada) return 'Primero guarda la clave';
  if (p.estado_panel !== 'probado' && p.estado_panel !== 'encendido') return 'Primero prueba la conexión';
  return null;
}

export default function PantallaProveedores() {
  const { estado, recargar } = usarCarga(() => clienteAdminIa.listarProveedores());
  const vacio = estado.fase === 'ok' && estado.datos.length === 0;

  return (
    <section className="text-base sm:text-[15px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <EncabezadoPantalla
          titulo="Proveedores de IA"
          descripcion="Conecta, prueba y enciende los proveedores que usan los agentes. Configurado no es lo mismo que en uso."
          migas={[{ texto: 'IA multiproveedor' }, { texto: 'Proveedores' }]}
        />
        {/* Único CTA coral de la pantalla (si la lista está vacía, el CTA pasa al estado vacío). */}
        {estado.fase === 'ok' && !vacio && <Link href="/admin/ia/multiproveedor/agregar" className={`${BOTON_CTA} mb-5`}>Agregar proveedor</Link>}
      </div>
      <AvisoDatosEjemplo visible={clienteAdminIa.esEjemplo} />
      <CajaPorQue
        id="proveedores"
        porQue="Cada proveedor pasa por Configurado → Probado → Encendido. Solo lo encendido y probado llega a un estudiante."
        paraQue="Para apagar en un clic si un proveedor falla, viendo antes a qué agentes afecta."
      />

      <FaseNoOk estado={estado} forma="tabla" onReintentar={recargar} />

      {vacio && (
        <EstadoVacio
          titulo="Aún no tienes proveedores"
          texto="Un proveedor es la empresa de IA que responde por NaIA (Abacus, OpenAI, xAI…). Agrega el primero con el asistente de 5 pasos."
          accion={{ texto: 'Agregar proveedor', href: '/admin/ia/multiproveedor/agregar' }}
        />
      )}

      {estado.fase === 'ok' && !vacio && (
        <>
          {/* Web (≥ 768 px): tabla. */}
          <div className={`${TARJETA} hidden overflow-hidden md:block`}>
            <table className="w-full text-left">
              <caption className="sr-only">Proveedores de IA con su estado, última prueba, uso y el interruptor para encender o apagar</caption>
              <thead className="bg-[#f7f4ee] text-sm text-[#3b2f8f]">
                <tr>
                  <th scope="col" className="px-4 py-3">Proveedor</th>
                  <th scope="col" className="px-4 py-3">Estado</th>
                  <th scope="col" className="px-4 py-3">Última prueba</th>
                  <th scope="col" className="px-4 py-3">Lo usan</th>
                  <th scope="col" className="px-4 py-3">Encendido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ece8f7]">
                {estado.datos.map((p) => (
                  <tr key={p.id} className="align-top">
                    <th scope="row" className="px-4 py-3 font-normal">
                      <Link href={`/admin/ia/multiproveedor/${p.id}`} className={`${ENLACE} inline-flex min-h-[44px] items-center`}>{p.nombre}</Link>
                      <span className={`block break-all text-sm ${TEXTO_SECUNDARIO}`}>{p.url_base ?? 'Endpoint fijo de Abacus'} · {p.modelos} {p.modelos === 1 ? 'modelo' : 'modelos'}</span>
                      {p.salud.circuito_abierto_hasta && <span className="mt-1 block"><AvisoAmbar>En pausa por errores seguidos hasta {fechaHora(p.salud.circuito_abierto_hasta)} (orientativo).</AvisoAmbar></span>}
                    </th>
                    <td className="px-4 py-3"><ChipEstado estado={p.estado_panel} /></td>
                    <td className="px-4 py-3"><UltimaPrueba p={p} /></td>
                    <td className="px-4 py-3"><UsoAgentes p={p} /></td>
                    <td className="max-w-[16rem] px-4 py-3">
                      <InterruptorConImpacto
                        nombre={nombreCorto(p.nombre)}
                        encendido={p.encendido}
                        motivoNoEncender={motivoNoEncender(p)}
                        pedirImpacto={() => clienteAdminIa.impactoProveedor(p.id)}
                        apagar={(c) => clienteAdminIa.apagarProveedor(p.id, c)}
                        encender={() => clienteAdminIa.encenderProveedor(p.id)}
                        onCambio={() => recargar({ silencioso: true })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil (< 768 px): una tarjeta por proveedor, chip arriba a la derecha. */}
          <ul className="space-y-3 md:hidden" aria-label="Proveedores de IA">
            {estado.datos.map((p) => (
              <li key={p.id} className={`${TARJETA} p-4`}>
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/ia/multiproveedor/${p.id}`} className={`${ENLACE} inline-flex min-h-[44px] items-center text-lg`}>{p.nombre}</Link>
                  <ChipEstado estado={p.estado_panel} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-3">
                  <div><dt className={`text-sm ${TEXTO_SECUNDARIO}`}>Última prueba</dt><dd><UltimaPrueba p={p} /></dd></div>
                  <div><dt className={`text-sm ${TEXTO_SECUNDARIO}`}>Lo usan</dt><dd><UsoAgentes p={p} /></dd></div>
                </dl>
                {p.salud.circuito_abierto_hasta && <div className="mt-2"><AvisoAmbar>En pausa por errores hasta {fechaHora(p.salud.circuito_abierto_hasta)}.</AvisoAmbar></div>}
                <div className="mt-3 border-t border-[#ece8f7] pt-2">
                  <InterruptorConImpacto
                    nombre={nombreCorto(p.nombre)}
                    encendido={p.encendido}
                    motivoNoEncender={motivoNoEncender(p)}
                    pedirImpacto={() => clienteAdminIa.impactoProveedor(p.id)}
                    apagar={(c) => clienteAdminIa.apagarProveedor(p.id, c)}
                    encender={() => clienteAdminIa.encenderProveedor(p.id)}
                    onCambio={() => recargar({ silencioso: true })}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
