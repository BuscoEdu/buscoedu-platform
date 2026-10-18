'use client';

/**
 * E1 · BA-037 — Modelo principal + respaldos por agente (B1–B4; B-1…B-6; UX §3.10).
 *
 * Qué hace: por cada agente muestra la versión que se edita (el borrador; si solo hay publicada,
 * ofrece duplicarla), deja elegir el modelo principal entre los encendidos y probados (B1), ordenar
 * de 0 a 5 respaldos con flechas, avisa en ámbar «Sin respaldo: si el modelo falla, NaIA pasa a una
 * persona» (B2), adelanta los respaldos incompatibles que bloquearán la publicación (B3) y permite
 * guardar, publicar y volver a una versión anterior con nota (B4).
 * Se edita UN agente a la vez (selector arriba) para que «Publicar vN» sea el único botón coral
 * de la pantalla; guardar, duplicar y restaurar son secundarios (borde índigo).
 * Para qué: cambiar de modelo sin tocar lo que está en vivo hasta publicar, y con camino de regreso.
 */

import { useEffect, useId, useState } from 'react';
import { clienteAdminIa } from '@/src/lib/admin-ia/cliente';
import { AVISO_SIN_RESPALDO, MAXIMO_RESPALDOS, fechaDiaMes, problemasRespaldos } from '@/src/lib/admin-ia/logica';
import type { AgenteConVersiones, ModeloDisponibleApi, VersionAgente } from '@/src/lib/admin-ia/tipos';
import { AvisoAmbar, AvisoDatosEjemplo, CajaPorQue, Campo, EncabezadoPantalla, ErrorEnLinea, EstadoVacio, FaseNoOk, TextoExito } from './Base';
import Dialogo from './Dialogo';
import { BOTON_CTA, BOTON_SECUNDARIO, CAMPO, FOCO, TARJETA, TEXTO_SECUNDARIO } from './estilos';
import { usarCarga } from './usarCarga';

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1 · Tarjeta de un agente.
 * Qué hace: edita principal + respaldos de su borrador y llama a B-2 / B-3 / B-5 / B-6.
 * Para qué: que cada agente se configure por separado, con errores y avisos junto a lo que los causa.
 * ──────────────────────────────────────────────────────────────────────────── */

function TarjetaAgente({ a, disponibles, onCambio }: { a: AgenteConVersiones; disponibles: ModeloDisponibleApi[]; onCambio: () => void }) {
  const idPrincipal = useId();
  const idAgregar = useId();
  const borrador = a.versiones.find((v) => v.estado === 'borrador') ?? null;
  const publicada = a.versiones.find((v) => v.id === a.version_activa_id) ?? null;
  const editable: VersionAgente | null = borrador ?? publicada;
  const anteriores = a.versiones.filter((v) => v.estado === 'desactivada' && v.publicada_en);

  const [principal, setPrincipal] = useState<string>(editable?.despliegue_id ?? '');
  const [respaldos, setRespaldos] = useState<string[]>(editable?.respaldos_ids ?? []);
  const [agregar, setAgregar] = useState('');
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [numeroNuevo, setNumeroNuevo] = useState('');
  const [errorNumero, setErrorNumero] = useState<string | undefined>();
  const [restaurar, setRestaurar] = useState<{ v: VersionAgente; nota: string; error?: string } | null>(null);

  // Si cambia la versión editable (tras duplicar o publicar), se recargan sus valores.
  useEffect(() => {
    setPrincipal(editable?.despliegue_id ?? '');
    setRespaldos(editable?.respaldos_ids ?? []);
  }, [editable?.id, editable?.despliegue_id, editable?.respaldos_ids]);

  // Nombre visible de un modelo; si ya no está disponible no se muestra su identificador interno.
  const nombre = (id: string) => disponibles.find((m) => m.id === id)?.nombre ?? 'Modelo no disponible';
  const esBorrador = editable?.estado === 'borrador';
  const problemas = editable ? problemasRespaldos(editable.requiere, principal || null, respaldos, disponibles) : [];
  const principalNoDisponible = !!principal && !disponibles.some((m) => m.id === principal);

  // Mueve un respaldo una posición (alternativa accesible a arrastrar).
  function mover(i: number, delta: number) {
    setRespaldos((r) => {
      const j = i + delta;
      if (j < 0 || j >= r.length) return r;
      const copia = [...r];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  // B-2: guarda principal + respaldos en el borrador y muestra las advertencias de la API.
  async function guardar() {
    if (!editable || !principal) {
      setMensaje({ ok: false, texto: 'Elige el modelo principal.' });
      return;
    }
    setOcupado(true);
    const r = await clienteAdminIa.asignarModelo(editable.id, { despliegue_id: principal, respaldos_ids: respaldos });
    setOcupado(false);
    if (r.tipo === 'ok') {
      const adv = r.datos.advertencias.map((x) => x.mensaje).join(' ');
      setMensaje({ ok: true, texto: `Borrador ${editable.numero_version} guardado.${adv ? ` ${adv}.` : ''} Lo que está en vivo no cambia hasta publicar.` });
      onCambio();
    } else setMensaje({ ok: false, texto: r.tipo === 'error' ? r.mensaje : 'No tienes permiso para cambiar agentes.' });
  }

  // B-5: publica el borrador; la API bloquea `respaldo_incompatible` y `modelo_no_disponible`.
  async function publicar() {
    if (!editable) return;
    setOcupado(true);
    const r = await clienteAdminIa.publicarVersion(editable.id);
    setOcupado(false);
    if (r.tipo === 'ok') {
      setMensaje({ ok: true, texto: `Publicaste ${editable.numero_version}. Aplica en menos de 60 s.` });
      onCambio();
    } else setMensaje({ ok: false, texto: r.tipo === 'error' ? r.mensaje : 'No tienes permiso para publicar.' });
  }

  // B-3: duplica la publicada para poder cambiarle el modelo sin tocar lo que está en vivo.
  async function duplicar() {
    if (!publicada) return;
    if (!numeroNuevo.trim() || numeroNuevo.trim().length > 20) {
      setErrorNumero('Escribe un número de versión (1 a 20 caracteres), por ejemplo v8.');
      return;
    }
    setOcupado(true);
    const r = await clienteAdminIa.duplicarVersion(publicada.id, numeroNuevo.trim(), 'Cambio de modelo (E1)');
    setOcupado(false);
    if (r.tipo === 'ok') {
      setErrorNumero(undefined);
      setMensaje({ ok: true, texto: `Creaste el borrador ${r.datos.numero_version}.` });
      onCambio();
    } else if (r.tipo === 'error' && r.campo === 'numero_version') setErrorNumero(r.mensaje);
    else setMensaje({ ok: false, texto: r.tipo === 'error' ? r.mensaje : 'No tienes permiso para duplicar versiones.' });
  }

  // B-6: vuelve a una versión anterior con nota obligatoria.
  async function confirmarRestaurar() {
    if (!restaurar) return;
    if (restaurar.nota.trim().length < 5) {
      setRestaurar({ ...restaurar, error: 'Escribe una nota de 5 a 500 caracteres: por qué vuelves a esta versión.' });
      return;
    }
    setOcupado(true);
    const r = await clienteAdminIa.restaurarVersion(restaurar.v.id, restaurar.nota.trim());
    setOcupado(false);
    if (r.tipo === 'ok') {
      setMensaje({ ok: true, texto: `Volviste a ${restaurar.v.numero_version}. Aplica en menos de 60 s.` });
      setRestaurar(null);
      onCambio();
    } else setRestaurar({ ...restaurar, error: r.tipo === 'error' ? r.mensaje : 'No tienes permiso para restaurar versiones.' });
  }

  return (
    <li className={`${TARJETA} space-y-4 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-[#3b2f8f]">{a.nombre}</h3>
          <p className={`text-sm ${TEXTO_SECUNDARIO}`}>
            En vivo: {publicada ? `${publicada.numero_version} · ${publicada.despliegue_id ? nombre(publicada.despliegue_id) : 'sin modelo'}` : 'sin versión publicada'}
            {editable && esBorrador ? ` · Editando el borrador ${editable.numero_version}` : ''}
          </p>
        </div>
      </div>

      {/* Versión publicada sin borrador: B4 exige duplicar para cambiar el modelo. */}
      {editable && !esBorrador && (
        <div className="space-y-2 rounded-xl bg-[#f7f4ee] p-3">
          <p>Esta versión ya está publicada. Duplícala para cambiar el modelo.</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1"><Campo etiqueta="Número de la nueva versión" valor={numeroNuevo} onCambio={(v) => { setNumeroNuevo(v); setErrorNumero(undefined); }} error={errorNumero} ayuda="Único por agente, por ejemplo v8." /></div>
            <button type="button" className={`${BOTON_SECUNDARIO} mb-6`} onClick={duplicar} disabled={ocupado}>Duplicar versión</button>
          </div>
        </div>
      )}

      {editable && esBorrador && (
        <>
          {/* Principal (B1): solo modelos encendidos y probados. */}
          <div className="space-y-1">
            <label htmlFor={idPrincipal} className="block font-semibold">Modelo principal</label>
            <select id={idPrincipal} value={principal} onChange={(e) => setPrincipal(e.target.value)} className={CAMPO}>
              <option value="">Elige un modelo…</option>
              {principalNoDisponible && <option value={principal}>Modelo actual (no disponible)</option>}
              {disponibles.map((m) => <option key={m.id} value={m.id}>{m.proveedor_nombre} · {m.nombre}</option>)}
            </select>
            <p className={`text-sm ${TEXTO_SECUNDARIO}`}>Solo aparecen modelos encendidos y con prueba vigente.</p>
            {principalNoDisponible && <ErrorEnLinea mensaje="Ese modelo no está encendido y probado. Elige otro antes de publicar." />}
          </div>

          {/* Respaldos ordenados (B2): el primero responde primero. */}
          <div className="space-y-2">
            <p className="font-semibold">Respaldos <span className={`font-normal ${TEXTO_SECUNDARIO}`}>(opcional, máximo {MAXIMO_RESPALDOS}; el primero responde primero)</span></p>
            {respaldos.length === 0 ? (
              <AvisoAmbar>{AVISO_SIN_RESPALDO}</AvisoAmbar>
            ) : (
              <ol className="space-y-2">
                {respaldos.map((id, i) => (
                  <li key={id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#8a84b8] px-3 py-1">
                    <span className="font-semibold">{i + 1}.</span>
                    <span className="min-w-0 flex-1 break-words">{nombre(id)}</span>
                    <button type="button" className={`${FOCO} min-h-[44px] min-w-[44px] rounded font-bold text-[#3b2f8f]`} onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${nombre(id)}`}>↑</button>
                    <button type="button" className={`${FOCO} min-h-[44px] min-w-[44px] rounded font-bold text-[#3b2f8f]`} onClick={() => mover(i, 1)} disabled={i === respaldos.length - 1} aria-label={`Bajar ${nombre(id)}`}>↓</button>
                    <button type="button" className={`${FOCO} min-h-[44px] rounded px-2 font-semibold text-[#b91c1c] underline`} onClick={() => setRespaldos((r) => r.filter((x) => x !== id))}>Quitar</button>
                  </li>
                ))}
              </ol>
            )}
            {respaldos.length < MAXIMO_RESPALDOS && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1 space-y-1">
                  <label htmlFor={idAgregar} className="block text-sm font-semibold">Agregar respaldo</label>
                  <select id={idAgregar} value={agregar} onChange={(e) => setAgregar(e.target.value)} className={CAMPO}>
                    <option value="">Elige un modelo…</option>
                    {disponibles.filter((m) => m.id !== principal && !respaldos.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.proveedor_nombre} · {m.nombre}</option>)}
                  </select>
                </div>
                <button type="button" className={BOTON_SECUNDARIO} disabled={!agregar} onClick={() => { setRespaldos((r) => [...r, agregar]); setAgregar(''); }}>Agregar</button>
              </div>
            )}
            {/* B3: lo que bloqueará la publicación, dicho antes. */}
            {problemas.map((p) => <ErrorEnLinea key={p} mensaje={`${p} Así no se podrá publicar.`} bloquea={false} />)}
          </div>

          {/* N3: «Publicar vN» es el ÚNICO botón coral de la pantalla; «Guardar borrador» es secundario. */}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTON_CTA} onClick={publicar} disabled={ocupado}>Publicar {editable.numero_version}</button>
            <button type="button" className={BOTON_SECUNDARIO} onClick={guardar} disabled={ocupado} aria-busy={ocupado}>Guardar borrador</button>
          </div>
        </>
      )}

      {/* Resultado de la última acción (polite) — los errores bloqueantes usan role="alert". */}
      <div aria-live="polite">
        {mensaje && (mensaje.ok ? <TextoExito>{mensaje.texto}</TextoExito> : <ErrorEnLinea mensaje={mensaje.texto} />)}
      </div>

      {/* Versiones anteriores (B4 «Volver a esta versión»). */}
      {anteriores.length > 0 && (
        <details>
          <summary className={`${FOCO} flex min-h-[44px] cursor-pointer items-center rounded font-semibold text-[#3b2f8f] underline underline-offset-2`}>Versiones anteriores ({anteriores.length})</summary>
          <ul className="mt-2 space-y-2">
            {anteriores.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f7f4ee] px-3 py-2">
                <span>{v.numero_version} · publicada el {fechaDiaMes(v.publicada_en!)} · {v.despliegue_id ? nombre(v.despliegue_id) : 'sin modelo'}</span>
                <button type="button" className={BOTON_SECUNDARIO} onClick={() => setRestaurar({ v, nota: '' })}>Volver a esta versión</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialogo
        abierto={!!restaurar}
        titulo={`Volver a ${restaurar?.v.numero_version ?? ''}`}
        onCerrar={() => setRestaurar(null)}
        // Restaurar es una acción secundaria (N3): borde índigo, nunca coral.
        accion={<button type="button" className={BOTON_SECUNDARIO} onClick={confirmarRestaurar} disabled={ocupado}>{`Volver a ${restaurar?.v.numero_version ?? ''}`}</button>}
      >
        <p>La versión en vivo pasa a desactivada y {restaurar?.v.numero_version} vuelve a publicarse. Queda en la bitácora con tu nota.</p>
        <div className="mt-3">
          <Campo etiqueta="Nota (obligatoria)" valor={restaurar?.nota ?? ''} onCambio={(v) => restaurar && setRestaurar({ ...restaurar, nota: v, error: undefined })} ayuda="De 5 a 500 caracteres: por qué vuelves a esta versión." error={restaurar?.error} />
        </div>
      </Dialogo>
    </li>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 2 · Pantalla.
 * Qué hace: carga agentes (rutas existentes) + modelos disponibles (B-1) con estados separados y
 * muestra un selector para editar un agente a la vez.
 * Para qué: mantener un solo botón coral por pantalla (el «Publicar vN» del agente elegido).
 * ──────────────────────────────────────────────────────────────────────────── */

export default function PantallaAgentes() {
  const ag = usarCarga(() => clienteAdminIa.listarAgentes());
  const disp = usarCarga(() => clienteAdminIa.modelosDisponibles());
  const refrescar = () => {
    ag.recargar({ silencioso: true });
    disp.recargar({ silencioso: true });
  };
  const fase = ag.estado.fase !== 'ok' ? ag.estado : disp.estado.fase !== 'ok' ? disp.estado : null;
  const idSelector = useId();
  const [elegido, setElegido] = useState<string>('');
  const agentes = ag.estado.fase === 'ok' ? ag.estado.datos : [];
  // Agente en edición: el elegido en el selector o, por defecto, el primero con un borrador
  // pendiente de publicar (si no hay ninguno, el primero de la lista).
  const actual = agentes.find((x) => x.id === elegido) ?? agentes.find((x) => x.versiones.some((v) => v.estado === 'borrador')) ?? agentes[0] ?? null;

  return (
    <section className="space-y-4 text-base sm:text-[15px]">
      <EncabezadoPantalla
        titulo="Modelo por agente"
        descripcion="Elige el modelo principal de cada agente y, si quieres, respaldos por si falla. Los cambios van a un borrador hasta publicar."
        migas={[{ texto: 'IA multiproveedor', href: '/admin/ia/multiproveedor' }, { texto: 'Modelo por agente' }]}
      />
      <AvisoDatosEjemplo visible={clienteAdminIa.esEjemplo} />
      <CajaPorQue
        id="agentes-modelo"
        porQue="Si el modelo principal falla o se apaga, responde el primer respaldo encendido."
        paraQue="Para que el estudiante nunca quede en silencio; sin respaldo, pasa a una persona."
      />
      {fase && <FaseNoOk estado={fase} forma="tarjetas" onReintentar={() => { ag.recargar(); disp.recargar(); }} />}
      {!fase && ag.estado.fase === 'ok' && disp.estado.fase === 'ok' && (
        ag.estado.datos.length === 0 ? (
          <EstadoVacio titulo="Aún no hay agentes" texto="Cuando crees un agente en el Centro de Agentes IA, aquí eliges su modelo." />
        ) : (
          <>
            {/* Selector de agente: solo aparece si hay más de uno. */}
            {agentes.length > 1 && (
              <div className="max-w-md space-y-1">
                <label htmlFor={idSelector} className="block font-semibold">Agente que vas a editar</label>
                <select id={idSelector} value={actual?.id ?? ''} onChange={(e) => setElegido(e.target.value)} className={CAMPO}>
                  {agentes.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
                <p className={`text-sm ${TEXTO_SECUNDARIO}`}>{agentes.length} agentes. Se edita uno a la vez.</p>
              </div>
            )}
            <ul className="space-y-4">
              {actual && <TarjetaAgente key={actual.id} a={actual} disponibles={disp.estado.fase === 'ok' ? disp.estado.datos : []} onCambio={refrescar} />}
            </ul>
          </>
        )
      )}
    </section>
  );
}
