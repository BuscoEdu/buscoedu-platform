'use client';

/**
 * E1 · BA-036 — Ficha del proveedor (P4; UX §3.3, §3.14).
 *
 * Qué hace: muestra estado, URL, interruptor del proveedor, la clave («Configurada ✓ · actualizada
 * el dd/mm por X» + Reemplazar / Revocar), cada modelo con su chip, parámetros, precio vigente
 * (etiqueta «precio estimado» si aplica), prueba y su propio interruptor, el formulario para cargar
 * un precio (M8) y la bitácora: quién, cuándo, qué cambió.
 * Para qué: operar un proveedor ya creado y auditar sus cambios sin ir a la base de datos.
 */

import { useState } from 'react';
import { clienteAdminIa } from '@/src/lib/admin-ia/cliente';
import { TEXTO_PRECIO_ESTIMADO, fechaHora, formatoUsd, leerNumeroEs } from '@/src/lib/admin-ia/logica';
import type { DetalleProveedorApi, ModeloApi, PruebaApi } from '@/src/lib/admin-ia/tipos';
import { AvisoAmbar, AvisoDatosEjemplo, Campo, ChipEstado, EncabezadoPantalla, ErrorEnLinea, FaseNoOk, TextoExito } from './Base';
import Bitacora, { textoAccion, valorTexto } from './Bitacora';
import { etiquetaCapacidad, etiquetaParametro, etiquetaProveedor } from '@/src/lib/admin-ia/etiquetas';
import { esModeloAbacus, esProveedorAbacus, lineasReferenciasAbacus, opcionesPrecioPorModelo, subtituloModelo } from '@/src/lib/admin-ia/referencias-abacus';
import type { ReferenciasAbacusApi } from '@/src/lib/admin-ia/tipos';
import EstadoClave from './EstadoClave';
import InterruptorConImpacto from './InterruptorConImpacto';
import { nombreCorto } from './PantallaProveedores';
import { BOTON_SECUNDARIO, CAMPO, FOCO, TARJETA, TEXTO_SECUNDARIO } from './estilos';
import { IconoError } from './Iconos';
import { usarCarga } from './usarCarga';

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 0 · Referencias de Abacus (2026-10-19).
 * Qué hace: pinta «Despliegue: NOMBRE_DE_VARIABLE» y «Token: NOMBRE_DE_VARIABLE» con los NOMBRES que
 * manda la API en `abacus` (P4, BE 15ab441); si un campo viene null, «Sin referencia configurada»
 * (texto neutro, no de error). Nunca muestra valores: la lógica está en referencias-abacus.ts.
 * Para qué: que el equipo vea qué variables de Vercel usa cada despliegue de Abacus, en vez de
 * «Sin modelo». Se usa en la cabecera del proveedor y en cada tarjeta de modelo Abacus.
 * ──────────────────────────────────────────────────────────────────────────── */

function ReferenciasAbacus({ refs, titulo }: { refs: ReferenciasAbacusApi | null | undefined; titulo: string }) {
  const lineas = lineasReferenciasAbacus(refs);
  return (
    <div className="text-sm">
      <p className={TEXTO_SECUNDARIO}>{titulo}</p>
      <dl className="mt-1 space-y-1">
        {lineas.map((l) => (
          <div key={l.campo} className="flex flex-wrap items-baseline gap-x-1">
            <dt className={`${TEXTO_SECUNDARIO}`}>{l.etiqueta}:</dt>
            <dd className="min-w-0 break-all">
              {l.nombre ? (
                <code className="rounded bg-[#f3f0fb] px-1.5 py-0.5 font-mono text-[13px] text-[#1a1830]">{l.nombre}</code>
              ) : (
                <span className={`italic ${l.estado === 'no_valida' ? 'text-[#b45309]' : TEXTO_SECUNDARIO}`}>{l.texto}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1 · Tarjeta de un modelo.
 * Qué hace: datos del modelo, «Probar conexión» (M4) con resultado en aria-live y su interruptor (M5–M7).
 * Para qué: probar y encender cada modelo por separado (encender el proveedor no enciende sus modelos, P9).
 * ──────────────────────────────────────────────────────────────────────────── */

function TarjetaModelo({ m, onCambio }: { m: ModeloApi; onCambio: () => void }) {
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<PruebaApi | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Probar conexión con el mensaje fijo (M4: 200 aunque falle).
  async function probar() {
    setProbando(true);
    setError(null);
    const r = await clienteAdminIa.probarModelo(m.id);
    setProbando(false);
    if (r.tipo === 'ok') {
      setPrueba(r.datos.prueba);
      onCambio();
    } else setError(r.tipo === 'error' ? r.mensaje : 'No tienes permiso para probar modelos.');
  }

  const vigente = !!m.ultima_prueba?.exitosa && !!m.ultima_prueba.vigente;
  return (
    <li className={`${TARJETA} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-[#1a1830]">{m.nombre}</p>
          {/* Subtítulo: el modelo legible; en Abacus sin `modelo` (la API lo manda en null), «Despliegue
              de Abacus AI» en vez de «Sin modelo». Los demás proveedores no cambian. */}
          <p className={`break-all text-sm ${TEXTO_SECUNDARIO}`}>{subtituloModelo(m)}</p>
        </div>
        <ChipEstado estado={m.estado_panel} />
      </div>
      {/* Solo Abacus: referencias de ESTE modelo (`modelos[i].abacus`), nombres de variables, nunca valores. */}
      {esModeloAbacus(m) && (
        <div className="mt-3">
          <ReferenciasAbacus refs={m.abacus} titulo="Referencias del despliegue (nombres de variables en Vercel, no valores):" />
        </div>
      )}
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className={`inline ${TEXTO_SECUNDARIO}`}>Parámetros: </dt><dd className="inline">{etiquetaParametro('temperature')} {String(m.parametros.temperature).replace('.', ',')} · {etiquetaParametro('max_tokens')} {m.parametros.max_tokens} · {etiquetaParametro('timeout_ms')} {m.parametros.timeout_ms} ms</dd></div>
        <div>
          <dt className={`inline ${TEXTO_SECUNDARIO}`}>Precio por 1.000 tokens: </dt>
          <dd className="inline">
            {m.precio_vigente ? (
              <>
                USD {m.precio_vigente.entrada_usd_1k.toString().replace('.', ',')} entrada · {m.precio_vigente.salida_usd_1k.toString().replace('.', ',')} salida
                {m.precio_vigente.es_estimado && <span className="ml-1 rounded-full border border-[#b45309] px-2 py-0.5 text-xs font-semibold text-[#b45309]">{TEXTO_PRECIO_ESTIMADO}</span>}
              </>
            ) : (
              <span className="font-semibold text-[#b45309]">Sin precio: carga el precio abajo</span>
            )}
          </dd>
        </div>
        <div><dt className={`inline ${TEXTO_SECUNDARIO}`}>Capacidades: </dt><dd className="inline">{etiquetaCapacidad('json')}: {m.capacidades.json ? 'sí' : 'no'} · {etiquetaCapacidad('herramientas')}: {m.capacidades.herramientas ? 'sí' : 'no'}</dd></div>
        <div><dt className={`inline ${TEXTO_SECUNDARIO}`}>Lo usan: </dt><dd className="inline">{m.usado_por.principal} principal · {m.usado_por.respaldo} respaldo</dd></div>
      </dl>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-t border-[#ece8f7] pt-3">
        <div className="space-y-1">
          <button type="button" className={BOTON_SECUNDARIO} onClick={probar} disabled={probando} aria-busy={probando}>{probando ? 'Probando…' : 'Probar conexión'}</button>
          {/* Resultado anunciado sin mover el foco. */}
          <div aria-live="polite" className="text-sm">
            {prueba ? (
              prueba.exitosa ? <TextoExito>Conexión exitosa · {prueba.latencia_ms} ms · respondió {prueba.modelo_respondio}</TextoExito> : (
                <span className="block font-semibold text-[#b91c1c]"><IconoError className="mr-1 inline h-4 w-4" />No se pudo conectar: {prueba.motivo} {prueba.que_hacer}</span>
              )
            ) : m.ultima_prueba ? (
              <span className={TEXTO_SECUNDARIO}>Última prueba: {m.ultima_prueba.exitosa ? 'exitosa' : 'falló'} · {m.ultima_prueba.latencia_ms} ms · {fechaHora(m.ultima_prueba.probado_en)}{m.ultima_prueba.exitosa && !m.ultima_prueba.vigente ? ' · ya no vigente' : ''}</span>
            ) : (
              <span className={TEXTO_SECUNDARIO}>Sin probar</span>
            )}
          </div>
          <ErrorEnLinea mensaje={error} />
        </div>
        <InterruptorConImpacto
          nombre={m.nombre}
          encendido={m.encendido}
          motivoNoEncender={vigente ? null : 'Primero prueba la conexión'}
          pedirImpacto={() => clienteAdminIa.impactoModelo(m.id)}
          apagar={(c) => clienteAdminIa.apagarModelo(m.id, c)}
          encender={() => clienteAdminIa.encenderModelo(m.id)}
          onCambio={onCambio}
        />
      </div>
    </li>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 2 · Cargar precio (M8 POST).
 * Qué hace: registra una versión nueva de precio para un modelo o para todo el proveedor ('*').
 * Para qué: resolver el aviso «Hay llamadas sin precio: carga el precio» y reemplazar el precio estimado.
 * ──────────────────────────────────────────────────────────────────────────── */

function CargarPrecio({ d, onCambio }: { d: DetalleProveedorApi; onCambio: () => void }) {
  const [modelo, setModelo] = useState('*');
  const [entrada, setEntrada] = useState('');
  const [salida, setSalida] = useState('');
  const [estimado, setEstimado] = useState(false);
  const [errores, setErrores] = useState<{ entrada?: string; salida?: string; general?: string }>({});
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Valida (≥ 0 y obligatorios) y registra la nueva versión de precio.
  async function guardar() {
    const e = leerNumeroEs(entrada);
    const s = leerNumeroEs(salida);
    const nuevos = {
      entrada: !(e >= 0) ? 'Los precios son obligatorios y no pueden ser negativos.' : undefined,
      salida: !(s >= 0) ? 'Los precios son obligatorios y no pueden ser negativos.' : undefined
    };
    setErrores(nuevos);
    setOk(null);
    if (nuevos.entrada || nuevos.salida) return;
    setEnviando(true);
    const r = await clienteAdminIa.registrarPrecio({ proveedor_codigo: d.codigo, modelo, entrada_usd_1k: e, salida_usd_1k: s, es_estimado: estimado });
    setEnviando(false);
    if (r.tipo === 'ok') {
      setOk('Precio guardado como versión nueva. El anterior queda en el historial.');
      setEntrada('');
      setSalida('');
      onCambio();
    } else setErrores({ general: r.tipo === 'error' ? r.mensaje : 'No tienes permiso para cargar precios.' });
  }

  return (
    <div className={`${TARJETA} space-y-3 p-4`} id="precios">
      <h3 className="text-lg font-bold text-[#3b2f8f]">Cargar precio</h3>
      <p className={`text-sm ${TEXTO_SECUNDARIO}`}>Cada cambio crea una versión nueva; no se sobrescribe. Sirve para calcular el gasto diario.</p>
      <div className="space-y-1">
        <label htmlFor="precio-modelo" className="block font-semibold">Modelo</label>
        <select id="precio-modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} className={CAMPO}>
          <option value="*">Todo el proveedor (todos sus modelos)</option>
          {/* Solo modelos con identificador; los de Abacus (sin `modelo`) se cobran con «Todo el proveedor». */}
          {opcionesPrecioPorModelo(d.modelos).map((o) => <option key={o.id} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Entrada (USD por 1.000 tokens)" modoEntrada="decimal" valor={entrada} onCambio={setEntrada} error={errores.entrada} ayuda="0 a 100" />
        <Campo etiqueta="Salida (USD por 1.000 tokens)" modoEntrada="decimal" valor={salida} onCambio={setSalida} error={errores.salida} ayuda="0 a 100" />
      </div>
      <label className="flex min-h-[44px] items-center gap-3">
        <input type="checkbox" checked={estimado} onChange={(e) => setEstimado(e.target.checked)} className={`${FOCO} h-5 w-5 accent-[#3b2f8f]`} />
        <span>Es un precio aproximado (se mostrará «{TEXTO_PRECIO_ESTIMADO}»)</span>
      </label>
      <button type="button" className={BOTON_SECUNDARIO} onClick={guardar} disabled={enviando} aria-busy={enviando}>{enviando ? 'Guardando…' : 'Guardar precio'}</button>
      <p aria-live="polite">{ok && <TextoExito>{ok}</TextoExito>}</p>
      <ErrorEnLinea mensaje={errores.general} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 3 · Pantalla.
 * ──────────────────────────────────────────────────────────────────────────── */

export default function PantallaDetalleProveedor({ id }: { id: string }) {
  const { estado, recargar } = usarCarga(() => clienteAdminIa.obtenerProveedor(id));
  const refrescar = () => recargar({ silencioso: true });

  if (estado.fase !== 'ok') {
    return (
      <section>
        <EncabezadoPantalla titulo="Proveedor" migas={[{ texto: 'IA multiproveedor', href: '/admin/ia/multiproveedor' }, { texto: 'Proveedor' }]} />
        <FaseNoOk estado={estado} forma="formulario" onReintentar={recargar} />
      </section>
    );
  }

  const d = estado.datos;
  const corto = nombreCorto(d.nombre);
  // «por X»: el autor del último evento de clave en la bitácora (la API no lo da en `clave`).
  const autorClave = d.bitacora.find((e) => ['clave_guardar', 'clave_reemplazar', 'guardar', 'reemplazar'].includes(e.accion))?.actor?.nombre ?? d.clave.actualizada_por ?? null;
  const motivoNoEncender = !d.clave.configurada ? 'Primero guarda la clave' : d.modelos.some((m) => m.ultima_prueba?.exitosa && m.ultima_prueba.vigente) ? null : 'Primero prueba la conexión';

  return (
    <section className="space-y-6 text-base sm:text-[15px]">
      <div>
        <EncabezadoPantalla titulo={d.nombre} migas={[{ texto: 'IA multiproveedor', href: '/admin/ia/multiproveedor' }, { texto: d.nombre }]} />
        <AvisoDatosEjemplo visible={clienteAdminIa.esEjemplo} />
        <div className={`${TARJETA} flex flex-wrap items-start justify-between gap-4 p-4`}>
          <div className="min-w-0 space-y-1">
            <ChipEstado estado={d.estado_panel} />
            <p className={`break-all text-sm ${TEXTO_SECUNDARIO}`}>Proveedor: {etiquetaProveedor(d.codigo)} · Dirección: {d.url_base ?? 'dirección fija de Abacus AI'}</p>
            {/* Solo Abacus: referencias a nivel proveedor (`abacus` de P4: las del primer modelo que tenga). */}
            {esProveedorAbacus(d) && <ReferenciasAbacus refs={d.abacus} titulo="Referencias de Abacus (nombres de variables en Vercel, no valores):" />}
            {d.salud.circuito_abierto_hasta && <AvisoAmbar>En pausa por errores seguidos hasta {fechaHora(d.salud.circuito_abierto_hasta)} (orientativo).</AvisoAmbar>}
          </div>
          <InterruptorConImpacto
            nombre={corto}
            encendido={d.encendido}
            motivoNoEncender={motivoNoEncender}
            pedirImpacto={() => clienteAdminIa.impactoProveedor(d.id)}
            apagar={(c) => clienteAdminIa.apagarProveedor(d.id, c)}
            encender={() => clienteAdminIa.encenderProveedor(d.id)}
            onCambio={refrescar}
          />
        </div>
      </div>

      {/* Clave: nunca el valor; solo estado + Reemplazar / Revocar. */}
      <section aria-labelledby="t-clave" className="space-y-2">
        <h3 id="t-clave" className="text-lg font-bold text-[#3b2f8f]">Clave</h3>
        <EstadoClave
          nombreProveedor={corto}
          meta={d.clave}
          actualizadaPor={autorClave}
          guardarEsCta={!d.clave.configurada}
          onGuardar={async (c) => {
            const r = await clienteAdminIa.guardarClave(d.id, c);
            if (r.tipo === 'ok') refrescar();
            return r;
          }}
          onRevocar={async (c) => {
            const r = await clienteAdminIa.revocarClave(d.id, c);
            if (r.tipo === 'ok') refrescar();
            return r;
          }}
        />
      </section>

      {/* Modelos con su propio interruptor. */}
      <section aria-labelledby="t-modelos" className="space-y-2">
        <h3 id="t-modelos" className="text-lg font-bold text-[#3b2f8f]">Modelos</h3>
        {d.modelos.length === 0 ? (
          <p className={TEXTO_SECUNDARIO}>Este proveedor aún no tiene modelos. Agrégalo desde el asistente (paso Modelos).</p>
        ) : (
          <ul className="space-y-3">{d.modelos.map((m) => <TarjetaModelo key={m.id} m={m} onCambio={refrescar} />)}</ul>
        )}
      </section>

      <CargarPrecio d={d} onCambio={refrescar} />

      {/* Bitácora: quién, cuándo, qué cambió. */}
      <section aria-labelledby="t-bitacora" className="space-y-2">
        <h3 id="t-bitacora" className="text-lg font-bold text-[#3b2f8f]">Bitácora de cambios</h3>
        <Bitacora
          filas={d.bitacora.map((e, i) => ({
            clave_fila: `${e.creado_en}-${i}`,
            cuando: e.creado_en,
            quien: e.actor?.nombre ?? 'Sistema',
            que: textoAccion(e.accion),
            antes: valorTexto(e.valor_anterior),
            despues: valorTexto(e.valor_nuevo)
          }))}
        />
      </section>
    </section>
  );
}
