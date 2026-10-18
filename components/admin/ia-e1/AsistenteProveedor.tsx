'use client';

/**
 * E1 · BA-036 — Asistente «Agregar proveedor» (criterios A1–A8; brief UX §3.1–§3.7).
 *
 * Qué hace: guía en 5 pasos Elegir → Clave → Modelos → Probar → Encender, con barra fija,
 * caja ¿Por qué? / ¿Para qué? por paso, validación junto al campo, prueba de conexión con
 * resultado ✓/✗ en `aria-live`, botón Encender bloqueado con la razón escrita y borrador
 * persistente («Guardado hace N s») que vuelve al último paso al recargar.
 * Para qué: que un super_admin agregue un proveedor de IA sin código y sin redeploy, sin poder
 * encender nada que no haya pasado una prueba (regla fija E1 §2).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  PASOS,
  borrarBorrador,
  borradorNuevo,
  estadoBotonEncender,
  firmaPrueba,
  guardarBorrador,
  leerBorrador,
  motivoPasoIncompleto,
  pasoCompleto,
  presetDe,
  pruebaVigente,
  puedeIrAPaso,
  textoGuardadoHace,
  urlEfectiva,
  borradorParaApi,
  firmaModelo,
  type AlmacenBorrador,
  type BorradorAsistente,
  type PasoAsistente
} from '@/src/lib/admin-ia/asistente';
import { MODELO_POR_DEFECTO, RANGOS_MODELO, campoDesdeApi, leerNumeroEs, validarParametrosModelo, type CampoModelo } from '@/src/lib/admin-ia/logica';
import { clienteAdminIa } from '@/src/lib/admin-ia/cliente';
import { validarUrlBase } from '@/lib/agentes/llm/proveedores';
import type { Advertencia, CrearModeloBody, ErroresCampo, PresetApi, TipoErrorLLM } from '@/src/lib/admin-ia/tipos';
import { AccionesFijas, AvisoAmbar, AvisoDatosEjemplo, CajaPorQue, Campo, EncabezadoPantalla, ErrorEnLinea, Esqueleto, FaseNoOk, MotivoDeshabilitado, TextoExito } from './Base';
import { usarCarga } from './usarCarga';
import BarraPasos from './BarraPasos';
import EstadoClave from './EstadoClave';
import { BOTON_CTA, BOTON_DESHABILITADO, BOTON_SECUNDARIO, ENLACE, FOCO, TARJETA, TEXTO_SECUNDARIO } from './estilos';
import { IconoError } from './Iconos';

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1 · Apoyos del asistente.
 * Qué hace: acceso seguro a localStorage, modelo sugerido por proveedor y «qué hacer» por error.
 * Para qué: valores por defecto razonables (A5) y un siguiente paso concreto cuando la prueba falla (A6).
 * ──────────────────────────────────────────────────────────────────────────── */

/** localStorage envuelto: si el navegador lo bloquea, el asistente sigue sin borrador. */
function almacenNavegador(): AlmacenBorrador {
  return {
    getItem: (k) => { try { return window.localStorage.getItem(k); } catch { return null; } },
    setItem: (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
    removeItem: (k) => { try { window.localStorage.removeItem(k); } catch { /* sin almacenamiento */ } }
  };
}

/** Modelo sugerido al elegir proveedor. SUPUESTO: la lista real de modelos vendrá de la API. */
const MODELO_SUGERIDO: Record<string, string[]> = {
  abacus_ai: ['naia-deployment'],
  openai: ['gpt-4.1-mini', 'gpt-4.1'],
  xai: ['grok-4', 'grok-4-fast'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-5'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  openrouter: ['openai/gpt-4.1-mini', 'x-ai/grok-4-fast'],
  otro_compatible: []
};

/**
 * Paso que arregla cada motivo de fallo (el texto «qué hacer» lo manda la API en M4 `que_hacer`).
 * Para qué: un botón directo al paso correcto (clave inválida → «Reemplaza la clave»).
 */
const ARREGLA_EN: Partial<Record<TipoErrorLLM, { boton: string; irA: PasoAsistente }>> = {
  autenticacion: { boton: 'Reemplaza la clave', irA: 'clave' },
  sin_clave: { boton: 'Guarda la clave', irA: 'clave' },
  timeout: { boton: 'Revisar el tiempo máximo', irA: 'modelos' },
  respuesta_invalida: { boton: 'Revisar el modelo', irA: 'modelos' },
  contexto_excedido: { boton: 'Revisar el máximo de tokens', irA: 'modelos' },
  proveedor_no_permitido: { boton: 'Volver a Elegir', irA: 'elegir' }
};

/** Convierte el formulario de Modelos al body de M2/M3 (números, precios y capacidades). */
function cuerpoModelo(b: BorradorAsistente, extra: { json: boolean; herramientas: boolean; estimado: boolean }): Omit<CrearModeloBody, 'proveedor_id'> {
  const n = (c: CampoModelo) => leerNumeroEs(b.modelos[c]);
  const esAbacus = presetDe(b)?.tipo_adaptador === 'abacus';
  return {
    nombre: b.modelos.nombre.trim(),
    modelo: b.modelos.modelo.trim() || undefined,
    parametros: { temperature: n('temperatura'), max_tokens: n('max_tokens'), timeout_ms: n('timeout_ms') },
    precios: { entrada_usd_1k: n('costo_usd_1k_entrada'), salida_usd_1k: n('costo_usd_1k_salida'), es_estimado: extra.estimado },
    capacidades: { json: extra.json, herramientas: extra.herramientas },
    abacus: esAbacus ? { identificador_externo: b.modelos.abacus_identificador.trim(), referencia_secreto: b.modelos.abacus_referencia.trim() } : undefined
  };
}

export default function AsistenteProveedor() {
  /* ──────────────────────────────────────────────────────────────────────────
   * Bloque 2 · Estado y borrador persistente (A8).
   * Qué hace: lee el borrador al montar (vuelve al último paso), lo guarda en cada cambio y
   * refresca «Guardado hace N s» cada segundo.
   * Para qué: cerrar o recargar sin perder nada. La clave nunca entra al borrador.
   * ────────────────────────────────────────────────────────────────────────── */
  const almacen = useMemo(() => (typeof window === 'undefined' ? null : almacenNavegador()), []);
  const [b, setB] = useState<BorradorAsistente | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [intentoAvanzar, setIntentoAvanzar] = useState<Partial<Record<PasoAsistente, boolean>>>({});
  const [probando, setProbando] = useState(false);
  const [encendiendo, setEncendiendo] = useState(false);
  const [errorEncender, setErrorEncender] = useState<string | null>(null);
  const [terminado, setTerminado] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorPaso, setErrorPaso] = useState<string | null>(null);
  const [erroresServidor, setErroresServidor] = useState<ErroresCampo<string>>({});
  const [avisos, setAvisos] = useState<Advertencia[]>([]);
  const [codigoOtro, setCodigoOtro] = useState('');
  // Capacidades y «precio estimado» del modelo: no son texto, van aparte del borrador de texto.
  const [capJson, setCapJson] = useState(false);
  const [capHerr, setCapHerr] = useState(false);
  const [precioEstimado, setPrecioEstimado] = useState(false);
  // P1 · presets desde la API (misma lista que PRESETS_PROVEEDOR del código).
  const presets = usarCarga(() => clienteAdminIa.listarPresets());
  const tituloPaso = useRef<HTMLHeadingElement>(null);

  // Carga inicial del borrador (solo en el navegador, para no romper la hidratación).
  useEffect(() => {
    if (!almacen) return;
    setB(leerBorrador(almacen) ?? borradorNuevo());
  }, [almacen]);

  // Reloj de «Guardado hace N s».
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Aplica un cambio al borrador y lo guarda de inmediato.
  const cambiar = useCallback(
    (f: (prev: BorradorAsistente) => BorradorAsistente) => {
      setB((prev) => {
        if (!prev) return prev;
        const nuevo = f(prev);
        return almacen ? guardarBorrador(almacen, nuevo, Date.now()) : nuevo;
      });
    },
    [almacen]
  );

  // Ir a un paso (si está permitido) y llevar el foco a su título para lectores de pantalla.
  // Además deja el paso y el borrador (sin clave) en el servidor (P5 `asistente`), para retomarlo en otro equipo.
  const irA = useCallback(
    (paso: PasoAsistente) => {
      cambiar((prev) => {
        if (!puedeIrAPaso(paso, prev)) return prev;
        const nuevo = { ...prev, paso };
        if (nuevo.proveedor_id) void clienteAdminIa.actualizarProveedor(nuevo.proveedor_id, { asistente: borradorParaApi(nuevo) });
        return nuevo;
      });
      setErrorPaso(null);
      window.setTimeout(() => tituloPaso.current?.focus(), 0);
    },
    [cambiar]
  );

  if (!b) {
    return (
      <section>
        <EncabezadoPantalla titulo="Agregar proveedor" />
        <Esqueleto forma="formulario" />
      </section>
    );
  }

  const borrador = b;
  const preset = presetDe(borrador);
  const indice = PASOS.findIndex((p) => p.id === borrador.paso);
  const paso = PASOS[indice];
  const esAbacus = preset?.tipo_adaptador === 'abacus';
  const erroresModelo = validarParametrosModelo(borrador.modelos, { esAbacus });
  const listaPresets: PresetApi[] = presets.estado.fase === 'ok' ? presets.estado.datos : [];
  // Validación de la URL con la lista permitida del código (BA-034), igual que hará la API (P3).
  const validacionUrl = preset ? validarUrlBase(preset.tipo_adaptador, urlEfectiva(borrador)) : null;
  const vigente = pruebaVigente(borrador);
  const botonEncender = estadoBotonEncender(borrador);
  const nombreProv = preset?.nombre ?? 'el proveedor';
  const nombreCorto = nombreProv.replace(/\s*\(.*\)$/, '');

  /* ──────────────────────────────────────────────────────────────────────────
   * Bloque 3 · Acciones de cada paso.
   * Qué hace: avanzar con validación, probar la conexión y encender.
   * Para qué: no dejar pasar datos incompletos (P1) ni encender sin prueba exitosa (A7).
   * ────────────────────────────────────────────────────────────────────────── */

  // Lleva un error de la API a su campo (si trae `campo`) o al mensaje general del paso.
  function mostrarErrorApi(r: { tipo: 'error'; mensaje: string; campo?: string } | { tipo: 'sin_permiso' }) {
    if (r.tipo === 'sin_permiso') {
      setErrorPaso('No tienes permiso para configurar proveedores.');
      return;
    }
    const campo = campoDesdeApi(r.campo);
    if (campo) setErroresServidor({ [campo]: r.mensaje });
    else setErrorPaso(r.mensaje);
  }

  // Paso 1 → P3: crea el proveedor apagado. Si ya existe (409 `codigo_existente`), retoma ese.
  async function crearProveedor(): Promise<boolean> {
    if (!preset) return false;
    if (borrador.proveedor_id) return true;
    setGuardando(true);
    const r = await clienteAdminIa.crearProveedor({
      preset_codigo: preset.codigo,
      codigo: preset.codigo === 'otro_compatible' ? codigoOtro.trim() : undefined,
      url_base: preset.codigo === 'otro_compatible' ? borrador.url_base.trim() : undefined
    });
    let id: string | null = null;
    if (r.tipo === 'ok') {
      id = r.datos.id;
      cambiar((prev) => ({ ...prev, proveedor_id: r.datos.id, credencial: r.datos.clave.configurada ? r.datos.clave : null }));
    } else if (r.tipo === 'error' && r.codigo === 'codigo_existente' && (r.detalles as { id?: string } | undefined)?.id) {
      // Ya existía: se retoma ese proveedor (su clave sigue como esté).
      id = (r.detalles as { id: string }).id;
      const det = await clienteAdminIa.obtenerProveedor(id);
      cambiar((prev) => ({ ...prev, proveedor_id: id, credencial: det.tipo === 'ok' && det.datos.clave.configurada ? det.datos.clave : null }));
      setAvisos([{ codigo: 'retomado', mensaje: `${preset.nombre} ya existía: retomamos su configuración.` }]);
    } else {
      mostrarErrorApi(r);
    }
    setGuardando(false);
    return !!id;
  }

  // Paso 3 → M2 (crear) o M3 (editar, si cambió algo). Los errores con `campo` van junto al campo.
  async function guardarModelo(): Promise<boolean> {
    if (!borrador.proveedor_id) return false;
    const firma = firmaModelo(borrador);
    if (borrador.despliegue_id && borrador.modelo_guardado_firma === firma) return true;
    setGuardando(true);
    setErroresServidor({});
    const cuerpo = cuerpoModelo(borrador, { json: capJson, herramientas: capHerr, estimado: precioEstimado });
    const r = borrador.despliegue_id
      ? await clienteAdminIa.actualizarModelo(borrador.despliegue_id, cuerpo)
      : await clienteAdminIa.crearModelo({ ...cuerpo, proveedor_id: borrador.proveedor_id });
    setGuardando(false);
    if (r.tipo === 'ok') {
      cambiar((prev) => ({ ...prev, despliegue_id: r.datos.id, modelo_guardado_firma: firma }));
      return true;
    }
    mostrarErrorApi(r);
    return false;
  }

  // Continuar: valida el paso, hace la escritura que le toca y avanza.
  async function continuar() {
    setErrorPaso(null);
    if (borrador.paso === 'elegir') {
      if (!preset || (validacionUrl && 'motivo' in validacionUrl) || (preset.codigo === 'otro_compatible' && !/^[a-z0-9_]{3,40}$/.test(codigoOtro.trim()))) {
        setIntentoAvanzar((x) => ({ ...x, elegir: true }));
        return;
      }
      if (!(await crearProveedor())) return;
    } else if (borrador.paso === 'modelos') {
      if (Object.keys(erroresModelo).length) {
        setIntentoAvanzar((x) => ({ ...x, modelos: true }));
        return;
      }
      if (!(await guardarModelo())) return;
    } else if (borrador.paso === 'clave' && !borrador.credencial?.configurada) {
      setIntentoAvanzar((x) => ({ ...x, clave: true }));
      return;
    }
    // Avanza en el siguiente render (cuando el borrador ya tiene los ids nuevos).
    window.setTimeout(() => irA(PASOS[Math.min(indice + 1, PASOS.length - 1)].id), 0);
  }

  // Probar conexión (M4): mensaje fijo armado por el servidor; aquí no viaja la clave.
  async function probar() {
    if (!borrador.despliegue_id) return;
    setProbando(true);
    setErrorPaso(null);
    const firma = firmaPrueba(borrador);
    const r = await clienteAdminIa.probarModelo(borrador.despliegue_id);
    setProbando(false);
    if (r.tipo === 'ok') cambiar((prev) => ({ ...prev, prueba: r.datos.prueba, prueba_firma: firma }));
    else mostrarErrorApi(r); // p. ej. 429 `demasiadas_pruebas`: «Espera un momento antes de probar otra vez.»
  }

  // Encender: modelo (M5) y proveedor (P9). La API vuelve a exigir la prueba vigente (409 si no).
  async function encender() {
    if (!botonEncender.habilitado || !borrador.despliegue_id || !borrador.proveedor_id) return;
    setEncendiendo(true);
    setErrorEncender(null);
    const m = await clienteAdminIa.encenderModelo(borrador.despliegue_id);
    if (m.tipo !== 'ok') {
      setEncendiendo(false);
      setErrorEncender(m.tipo === 'error' ? m.mensaje : 'No tienes permiso para encender proveedores.');
      return;
    }
    const p = await clienteAdminIa.encenderProveedor(borrador.proveedor_id);
    setEncendiendo(false);
    if (p.tipo === 'ok') {
      if (almacen) borrarBorrador(almacen);
      setTerminado(preset?.nombre ?? nombreCorto);
    } else {
      setErrorEncender(p.tipo === 'error' ? p.mensaje : 'No tienes permiso para encender proveedores.');
    }
  }

  // Descartar el borrador y empezar de cero.
  function descartar() {
    if (almacen) borrarBorrador(almacen);
    setB(borradorNuevo());
    setIntentoAvanzar({});
    setErroresServidor({});
    setErrorPaso(null);
    setAvisos([]);
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * Bloque 4 · Pantalla final tras encender.
   * Qué hace: confirma el resultado y ofrece los siguientes pasos.
   * Para qué: cerrar el flujo con un estado claro (Encendido) y llevar a asignarlo a un agente.
   * ────────────────────────────────────────────────────────────────────────── */
  if (terminado) {
    return (
      <section aria-live="polite">
        <EncabezadoPantalla titulo="Agregar proveedor" migas={[{ texto: 'IA multiproveedor', href: '/admin/ia/multiproveedor' }, { texto: 'Agregar proveedor' }]} />
        <div className={`${TARJETA} p-6`}>
          <p className="text-lg"><TextoExito>{terminado} quedó encendido</TextoExito></p>
          <p className={`mt-1 ${TEXTO_SECUNDARIO}`}>Ya puedes asignarlo como modelo principal o de respaldo de un agente. El cambio aplica en menos de 60 s, sin redeploy.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/admin/ia/multiproveedor" className={BOTON_CTA}>Ir a Proveedores</Link>
            <Link href="/admin/ia/multiproveedor/agentes" className={BOTON_SECUNDARIO}>Asignar a un agente</Link>
          </div>
        </div>
      </section>
    );
  }

  const mostrarErrores = !!intentoAvanzar[borrador.paso];
  const validacionUrlTexto = validacionUrl && 'motivo' in validacionUrl ? validacionUrl.motivo : undefined;
  const presetApi = listaPresets.find((p) => p.codigo === borrador.proveedor_codigo) ?? null;
  // Error de un campo: primero el del servidor (si llegó), luego el de Frontend al intentar avanzar.
  const errorDe = (c: CampoModelo) => erroresServidor[c] ?? (mostrarErrores ? erroresModelo[c] : undefined);
  // Si el modelo cambió después de probar, se avisa que hay que probar otra vez.
  const pruebaVieja = !!borrador.prueba && borrador.prueba_firma !== firmaPrueba(borrador);

  return (
    <section className="text-base sm:text-[15px]">
      <EncabezadoPantalla
        titulo="Agregar proveedor"
        descripcion="Conecta un proveedor de IA en 5 pasos. Nada llega a un estudiante hasta que lo pruebes y lo enciendas."
        migas={[{ texto: 'IA multiproveedor', href: '/admin/ia/multiproveedor' }, { texto: 'Agregar proveedor' }]}
      />
      <AvisoDatosEjemplo visible={clienteAdminIa.esEjemplo} />

      <BarraPasos actual={borrador.paso} completo={(p) => pasoCompleto(p, borrador)} navegable={(p) => puedeIrAPaso(p, borrador)} onIr={irA} />

      <div className="mx-auto max-w-[640px]">
        <h3 ref={tituloPaso} tabIndex={-1} className={`${FOCO} mb-3 rounded text-xl font-bold text-[#3b2f8f]`}>
          {indice + 1}. {paso.nombre}
        </h3>
        <CajaPorQue
          id={`asistente-${paso.id}`}
          porQue={paso.id === 'elegir' && presetApi?.ayuda ? presetApi.ayuda.por_que : paso.porQue}
          paraQue={paso.id === 'elegir' && presetApi?.ayuda ? presetApi.ayuda.para_que : paso.paraQue}
        />

        {/* ── Paso 1 · Elegir (A2, P1, P3): tarjetas con el nombre como logo y la URL en solo lectura. ── */}
        {borrador.paso === 'elegir' && (
          presets.estado.fase !== 'ok' ? (
            <FaseNoOk estado={presets.estado} forma="tarjetas" onReintentar={presets.recargar} />
          ) : (
            <fieldset className="space-y-3">
              <legend className="mb-2 font-semibold">¿Qué proveedor quieres conectar?</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {listaPresets.map((p) => {
                  const elegido = borrador.proveedor_codigo === p.codigo;
                  return (
                    <label key={p.codigo} className={`${TARJETA} flex min-h-[44px] cursor-pointer items-start gap-3 p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#3b2f8f] ${elegido ? 'border-2 border-[#3b2f8f] bg-[#ece8f7]/40' : ''}`}>
                      <input
                        type="radio"
                        name="proveedor"
                        value={p.codigo}
                        checked={elegido}
                        onChange={() => {
                          // Cambiar de proveedor reinicia el borrador: la clave y el modelo son de cada proveedor.
                          setErroresServidor({});
                          setAvisos([]);
                          cambiar(() => ({
                            ...borradorNuevo(),
                            paso: 'elegir',
                            proveedor_codigo: p.codigo,
                            modelos: { ...MODELO_POR_DEFECTO, modelo: MODELO_SUGERIDO[p.codigo]?.[0] ?? '' }
                          }));
                        }}
                        className="mt-1 h-5 w-5 accent-[#3b2f8f]"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#3b2f8f] text-xs font-bold text-white" aria-hidden="true">{p.nombre.slice(0, 2).toUpperCase()}</span>
                          <span className="font-semibold text-[#1a1830]">{p.nombre}</span>
                        </span>
                        <span className={`mt-1 block break-all text-sm ${TEXTO_SECUNDARIO}`}>
                          {p.url_base ?? (p.tipo_adaptador === 'abacus' ? 'Dirección fija de Abacus AI (no se configura)' : 'Eliges la URL de la lista permitida')}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* «Otro compatible»: código interno + URL validada contra la lista permitida (P3). */}
              {presetApi && presetApi.url_editable && (
                <div className="space-y-4 pt-2">
                  <Campo
                    etiqueta="Identificador interno del proveedor"
                    valor={codigoOtro}
                    onCambio={(v) => { setCodigoOtro(v); setErroresServidor({}); }}
                    ayuda="Minúsculas, números y _ (3 a 40). Por ejemplo: groq."
                    error={erroresServidor.codigo ?? (mostrarErrores && !/^[a-z0-9_]{3,40}$/.test(codigoOtro.trim()) ? 'El identificador solo admite minúsculas, números y _ (3 a 40).' : undefined)}
                  />
                  <Campo
                    etiqueta="URL base del proveedor compatible"
                    tipo="url"
                    modoEntrada="url"
                    valor={borrador.url_base}
                    onCambio={(v) => { setErroresServidor({}); cambiar((prev) => ({ ...prev, url_base: v })); }}
                    ayuda={`Solo se aceptan URLs de la lista permitida: ${presetApi.urls_permitidas.join(', ')}.`}
                    error={erroresServidor.url_base ?? ((mostrarErrores || borrador.url_base) ? validacionUrlTexto : undefined)}
                    lista="urls-permitidas"
                  />
                  <datalist id="urls-permitidas">{presetApi.urls_permitidas.map((u) => <option key={u} value={u} />)}</datalist>
                </div>
              )}
              {presetApi && presetApi.url_base && (
                <Campo etiqueta="URL del proveedor (precargada)" valor={presetApi.url_base} soloLectura ayuda="Sale de la lista permitida en código. No se puede cambiar." />
              )}
              {mostrarErrores && !preset && <ErrorEnLinea mensaje="Elige un proveedor de la lista." />}
            </fieldset>
          )
        )}

        {/* ── Paso 2 · Clave (A3, A4; P6, P7): contraseña; luego solo «Configurada ✓» + Reemplazar / Revocar. ── */}
        {borrador.paso === 'clave' && preset && borrador.proveedor_id && (
          <div className="space-y-3">
            <EstadoClave
              nombreProveedor={nombreCorto}
              meta={borrador.credencial}
              actualizadaPor={borrador.credencial?.actualizada_por ?? 'ti'}
              guardarEsCta={!borrador.credencial?.configurada}
              onGuardar={async (clave) => {
                const r = await clienteAdminIa.guardarClave(borrador.proveedor_id!, clave);
                if (r.tipo === 'ok') cambiar((prev) => ({ ...prev, credencial: r.datos.clave }));
                return r;
              }}
              onRevocar={async (c) => {
                const r = await clienteAdminIa.revocarClave(borrador.proveedor_id!, c);
                if (r.tipo === 'ok') cambiar((prev) => ({ ...prev, credencial: r.datos.clave, encendido: false }));
                return r;
              }}
            />
            {presetApi?.variable_env_sugerida && (
              <p className={`text-sm ${TEXTO_SECUNDARIO}`}>¿Prefieres una variable de entorno? Usa <code className="font-mono">{presetApi.variable_env_sugerida}</code>; ese camino sí necesita un redeploy.</p>
            )}
            {mostrarErrores && !borrador.credencial?.configurada && <ErrorEnLinea mensaje="Guarda la clave para continuar." />}
          </div>
        )}

        {/* ── Paso 3 · Modelos (A5, M2/M3): valores por defecto, rango debajo y error junto al campo. ── */}
        {borrador.paso === 'modelos' && (
          <div className="space-y-4">
            <Campo
              etiqueta="Nombre para reconocerlo"
              valor={borrador.modelos.nombre}
              onCambio={(v) => { setErroresServidor({}); cambiar((prev) => ({ ...prev, modelos: { ...prev.modelos, nombre: v } })); }}
              ayuda={`Por ejemplo: ${nombreCorto} · ${borrador.modelos.modelo || 'modelo'}. Máximo 80 caracteres.`}
              error={errorDe('nombre')}
            />
            <Campo
              etiqueta={esAbacus ? 'Modelo (opcional en Abacus)' : 'Modelo'}
              valor={borrador.modelos.modelo}
              onCambio={(v) => { setErroresServidor({}); cambiar((prev) => ({ ...prev, modelos: { ...prev.modelos, modelo: v } })); }}
              ayuda="Identificador exacto del modelo (letras, números y . _ : / @ -)."
              error={errorDe('modelo')}
              lista="modelos-sugeridos"
            />
            <datalist id="modelos-sugeridos">{(MODELO_SUGERIDO[borrador.proveedor_codigo ?? ''] ?? []).map((m) => <option key={m} value={m} />)}</datalist>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['temperatura', 'Temperatura', undefined],
                  ['max_tokens', 'Máximo de tokens por respuesta', undefined],
                  ['timeout_ms', 'Tiempo máximo de espera', 'ms'],
                  ['costo_usd_1k_entrada', 'Costo por 1.000 tokens de entrada', 'USD'],
                  ['costo_usd_1k_salida', 'Costo por 1.000 tokens de salida', 'USD']
                ] as Array<[keyof typeof RANGOS_MODELO, string, string | undefined]>
              ).map(([campo, etiqueta, unidad]) => (
                <Campo
                  key={campo}
                  etiqueta={etiqueta}
                  modoEntrada="decimal"
                  valor={borrador.modelos[campo]}
                  onCambio={(v) => { setErroresServidor({}); cambiar((prev) => ({ ...prev, modelos: { ...prev.modelos, [campo]: v } })); }}
                  ayuda={RANGOS_MODELO[campo].ayuda}
                  error={errorDe(campo)}
                  prefijo={unidad === 'USD' ? 'USD' : undefined}
                  sufijo={unidad === 'ms' ? 'ms' : undefined}
                />
              ))}
            </div>
            {/* Precio estimado y capacidades (B3 es fail-closed: lo no marcado cuenta como «no»). */}
            <fieldset className="space-y-2">
              <legend className="font-semibold">Opciones</legend>
              {(
                [
                  [precioEstimado, setPrecioEstimado, 'El precio es aproximado (se mostrará «precio estimado»)'],
                  [capJson, setCapJson, 'Soporta respuesta estructurada (JSON)'],
                  [capHerr, setCapHerr, 'Soporta herramientas']
                ] as Array<[boolean, (v: boolean) => void, string]>
              ).map(([valor, fijar, texto]) => (
                <label key={texto} className="flex min-h-[44px] cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={valor} onChange={(e) => { fijar(e.target.checked); cambiar((prev) => ({ ...prev, modelo_guardado_firma: null })); }} className={`${FOCO} h-5 w-5 rounded border-[#8a84b8] accent-[#3b2f8f]`} />
                  <span>{texto}</span>
                </label>
              ))}
            </fieldset>
            {/* Solo Abacus: NOMBRES de variables de entorno (nunca valores). */}
            {esAbacus && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Variable del despliegue de Abacus" valor={borrador.modelos.abacus_identificador} onCambio={(v) => cambiar((prev) => ({ ...prev, modelos: { ...prev.modelos, abacus_identificador: v } }))} ayuda="Nombre, no valor. Empieza por LLM_ o ABACUS_NAIA_." error={errorDe('abacus_identificador')} />
                <Campo etiqueta="Variable de la clave de Abacus" valor={borrador.modelos.abacus_referencia} onCambio={(v) => cambiar((prev) => ({ ...prev, modelos: { ...prev.modelos, abacus_referencia: v } }))} ayuda="Nombre, no valor. Empieza por LLM_ o ABACUS_NAIA_." error={errorDe('abacus_referencia')} />
              </div>
            )}
          </div>
        )}

        {/* ── Paso 4 · Probar (A6, M4): CTA «Probar conexión», resultado ✓/✗ con latencia y modelo en aria-live. ── */}
        {borrador.paso === 'probar' && (
          <div className="space-y-4">
            <div className={`${TARJETA} p-4`}>
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                <dt className={TEXTO_SECUNDARIO}>Proveedor</dt><dd className="font-semibold">{nombreProv}</dd>
                <dt className={TEXTO_SECUNDARIO}>Modelo</dt><dd className="break-all font-semibold">{borrador.modelos.modelo || '—'}</dd>
                <dt className={TEXTO_SECUNDARIO}>Mensaje</dt><dd>Mensaje fijo de prueba, sin datos de estudiantes.</dd>
              </dl>
              <button type="button" onClick={probar} disabled={probando} aria-busy={probando} className={`${vigente ? BOTON_SECUNDARIO : BOTON_CTA} mt-4 w-full sm:w-auto`}>
                {probando ? 'Probando…' : vigente ? 'Probar de nuevo' : 'Probar conexión'}
              </button>
            </div>

            {pruebaVieja && <AvisoAmbar>Cambiaste el modelo o la clave después de probar: prueba la conexión de nuevo.</AvisoAmbar>}

            {/* Región viva: el lector de pantalla anuncia el resultado sin mover el foco. */}
            <div aria-live="polite" aria-atomic="true">
              {probando && <p className={TEXTO_SECUNDARIO}>Enviando el mensaje de prueba…</p>}
              {!probando && borrador.prueba && !pruebaVieja && (
                borrador.prueba.exitosa ? (
                  <div className="rounded-xl border-2 border-[#15803d] bg-[#f0fdf4] p-4">
                    <p className="text-lg"><TextoExito>Conexión exitosa</TextoExito></p>
                    <p className="mt-1">Latencia: <strong>{borrador.prueba.latencia_ms} ms</strong> · Respondió: <strong className="break-all">{borrador.prueba.modelo_respondio}</strong></p>
                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-[#b91c1c] bg-[#fef2f2] p-4">
                    <p className="flex items-center gap-1.5 text-lg font-bold text-[#b91c1c]"><IconoError className="h-6 w-6" />No se pudo conectar</p>
                    <p className="mt-1"><strong>Motivo:</strong> {borrador.prueba.motivo}</p>
                    {borrador.prueba.que_hacer && <p><strong>Qué hacer:</strong> {borrador.prueba.que_hacer}</p>}
                    {borrador.prueba.motivo_codigo && ARREGLA_EN[borrador.prueba.motivo_codigo] && (
                      <button type="button" className={`${BOTON_SECUNDARIO} mt-2`} onClick={() => irA(ARREGLA_EN[borrador.prueba!.motivo_codigo!]!.irA)}>
                        {ARREGLA_EN[borrador.prueba.motivo_codigo]!.boton}
                      </button>
                    )}
                    <p className={`mt-2 text-sm ${TEXTO_SECUNDARIO}`}>Latencia: {borrador.prueba.latencia_ms} ms</p>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* ── Paso 5 · Encender (A7, P5; M5 + P9): bloqueado con la razón escrita si no hay prueba exitosa. ── */}
        {borrador.paso === 'encender' && (
          <div className="space-y-4">
            <div className={`${TARJETA} p-4`}>
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                <dt className={TEXTO_SECUNDARIO}>Proveedor</dt><dd className="font-semibold">{nombreProv}</dd>
                <dt className={TEXTO_SECUNDARIO}>Modelo</dt><dd className="break-all font-semibold">{borrador.modelos.modelo || '—'}</dd>
                <dt className={TEXTO_SECUNDARIO}>Clave</dt><dd>{borrador.credencial?.configurada ? <TextoExito>Configurada ✓</TextoExito> : 'Sin clave'}</dd>
                <dt className={TEXTO_SECUNDARIO}>Prueba</dt>
                <dd>{vigente ? <TextoExito>Probado ✓ · {borrador.prueba!.latencia_ms} ms</TextoExito> : <span className="font-semibold text-[#b45309]">Sin prueba exitosa</span>}</dd>
              </dl>
            </div>
            <p className={TEXTO_SECUNDARIO}>Al encenderlo queda disponible para los agentes en menos de 60 s, sin redeploy. Puedes apagarlo cuando quieras desde Proveedores.</p>
            {!botonEncender.habilitado && (
              <p><button type="button" className={`${ENLACE} min-h-[44px]`} onClick={() => irA('probar')}>Ir al paso Probar</button></p>
            )}
            <ErrorEnLinea mensaje={errorEncender} />
          </div>
        )}

        {/* Avisos y errores generales del paso (los de campo van junto al campo). */}
        <div className="mt-4 space-y-2">
          {avisos.map((a) => <AvisoAmbar key={a.codigo}>{a.mensaje}</AvisoAmbar>)}
          <ErrorEnLinea mensaje={errorPaso} />
        </div>

        {/* ── Botonera: «Atrás» secundario a la izquierda y el único CTA coral a la derecha; fija abajo en móvil. ── */}
        <AccionesFijas
          nota={
            <div className={`flex flex-wrap items-center justify-between gap-2 ${TEXTO_SECUNDARIO}`}>
              <span>{textoGuardadoHace(borrador.guardado_en, ahora)}</span>
              <button type="button" onClick={descartar} className={`${FOCO} min-h-[44px] rounded px-1 text-sm font-semibold text-[#3b2f8f] underline underline-offset-2`}>Descartar borrador</button>
            </div>
          }
        >
          {indice > 0 ? (
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => irA(PASOS[indice - 1].id)}>Atrás</button>
          ) : (
            <Link href="/admin/ia/multiproveedor" className={BOTON_SECUNDARIO}>Cancelar</Link>
          )}

          {borrador.paso === 'encender' ? (
            'motivo' in botonEncender ? (
              <div className="flex flex-col items-end text-right">
                <button type="button" className={BOTON_DESHABILITADO} aria-disabled="true" aria-describedby="motivo-encender">
                  Encender {nombreCorto}
                </button>
                <MotivoDeshabilitado id="motivo-encender">{botonEncender.motivo}</MotivoDeshabilitado>
              </div>
            ) : (
              <button type="button" className={BOTON_CTA} onClick={encender} disabled={encendiendo} aria-busy={encendiendo}>
                {encendiendo ? 'Encendiendo…' : `Encender ${nombreCorto}`}
              </button>
            )
          ) : borrador.paso === 'clave' && !borrador.credencial?.configurada ? (
            // En Clave el CTA coral es «Guardar clave» (dentro del paso); Continuar queda secundario.
            <button type="button" className={BOTON_SECUNDARIO} onClick={continuar}>Continuar</button>
          ) : borrador.paso === 'probar' && !vigente ? (
            // En Probar el CTA coral es «Probar conexión»; Continuar queda secundario hasta probar.
            <button type="button" className={BOTON_SECUNDARIO} onClick={continuar}>Continuar sin probar</button>
          ) : (
            <button type="button" className={BOTON_CTA} onClick={continuar} disabled={guardando} aria-busy={guardando}>{guardando ? 'Guardando…' : 'Continuar'}</button>
          )}
        </AccionesFijas>
      </div>
    </section>
  );
}
