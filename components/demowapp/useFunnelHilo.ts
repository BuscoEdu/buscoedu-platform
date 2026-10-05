'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  almacenNavegador,
  cuerpoIniciarHilo,
  declaracionesDesdeMarcas,
  esCierreAplicar,
  fusionarError,
  guardarMemoria,
  leerMemoria,
  normalizarCuerpo,
  rotarSlot,
  rutaConHilo,
  vistaCargando,
  vistaRed,
  vistaSoloLista,
  type DecisionHilo,
  type MemoriaHilo,
  type VistaFunnel
} from './funnelContrato';

/**
 * BA-031 · Estado del funnel dentro de /demoWapp.
 * Habla con las rutas ya existentes. No crea lead en el cliente:
 * leadCreado sale solo de la respuesta, y Mi lista vive en otro carril.
 */

export interface BorradorDatos {
  nombre: string;
  celular: string;
  correo: string;
}

export interface FunnelHilo {
  ofertaId: string | null;
  aplicar: VistaFunnel | null;
  miLista: VistaFunnel | null;
  borrador: BorradorDatos;
  marcas: Record<string, boolean>;
  ancla: string;
  cambiarBorrador: (campo: keyof BorradorDatos, valor: string) => void;
  alternarMarca: (codigo: string, otorgado: boolean) => void;
  iniciarAplicar: () => void;
  guardarEnLista: () => void;
  enviarDatos: () => void;
  decidir: (decision: DecisionHilo) => void;
  verPermisos: () => void;
}

async function leerJson(res: Response): Promise<VistaFunnel> {
  try {
    return normalizarCuerpo(await res.json());
  } catch {
    return vistaRed('No pude leer la respuesta del hilo. No quedó ninguna solicitud.');
  }
}

async function pedir(url: string, metodo: 'GET' | 'POST', cuerpo?: unknown): Promise<VistaFunnel> {
  try {
    const res = await fetch(url, {
      method: metodo,
      cache: 'no-store',
      headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    return leerJson(res);
  } catch {
    return vistaRed('No pude conectar con el hilo. No quedó ninguna solicitud.');
  }
}

function recordarIntencion(oportunidadId: string, ofertaId: string, memoria: MemoriaHilo) {
  guardarMemoria(almacenNavegador(), oportunidadId, ofertaId, memoria);
}

export function useFunnelHilo(ofertaId: string | null, oportunidadId: string | null = null): FunnelHilo {
  const [aplicar, setAplicar] = useState<VistaFunnel | null>(null);
  const [miLista, setMiLista] = useState<VistaFunnel | null>(null);
  const [borrador, setBorrador] = useState<BorradorDatos>({ nombre: '', celular: '', correo: '' });
  const [marcas, setMarcas] = useState<Record<string, boolean>>({});
  const seqAplicar = useRef(0);
  const seqLista = useRef(0);
  const ocupadoAplicar = useRef(false);
  const ocupadoLista = useRef(false);
  const precargado = useRef<string | null>(null);
  const firmaMarcas = useRef('');

  /* Al cambiar de oferta se olvida el carril anterior y se restaura el de esta. */
  useEffect(() => {
    seqAplicar.current += 1;
    seqLista.current += 1;
    ocupadoAplicar.current = false;
    ocupadoLista.current = false;
    setAplicar(null);
    setMiLista(null);
    setBorrador({ nombre: '', celular: '', correo: '' });
    setMarcas({});
    precargado.current = null;
    firmaMarcas.current = '';
    if (!ofertaId || !oportunidadId) return;

    let cancelado = false;
    const memoria = leerMemoria(almacenNavegador(), oportunidadId, ofertaId);

    const restaurarAplicar = async () => {
      if (!memoria.aplicar.intencionId) return;
      const seq = ++seqAplicar.current;
      setAplicar(vistaCargando(null, null));
      let vista = await pedir(
        rutaConHilo(`/api/demowapp/aplicar/${memoria.aplicar.intencionId}`, oportunidadId),
        'GET'
      );
      if (cancelado || seq !== seqAplicar.current) return;
      if (!vista.ok && vista.code === 'intencion_no_encontrada') {
        memoria.aplicar.intencionId = null;
        recordarIntencion(oportunidadId, ofertaId, memoria);
        setAplicar(null);
        return;
      }
      if (vista.ok && vista.ui.paso === 'consentimiento' && vista.sesionDemo?.id) {
        const textos = await pedir(
          rutaConHilo(`/api/demowapp/aplicar/${vista.sesionDemo.id}/consentimiento`, oportunidadId),
          'GET'
        );
        if (cancelado || seq !== seqAplicar.current) return;
        vista = textos.ok ? textos : fusionarError(vista, textos);
      }
      setAplicar(vista.ok ? vista : fusionarError(null, vista));
    };

    const restaurarLista = async () => {
      if (!memoria.lista.intencionId) return;
      const seq = ++seqLista.current;
      setMiLista(vistaCargando(null, 'mi_lista'));
      const vista = vistaSoloLista(
        await pedir(rutaConHilo(`/api/demowapp/aplicar/${memoria.lista.intencionId}`, oportunidadId), 'GET')
      );
      if (cancelado || seq !== seqLista.current) return;
      if (!vista.ok && vista.code === 'intencion_no_encontrada') {
        memoria.lista.intencionId = null;
        recordarIntencion(oportunidadId, ofertaId, memoria);
        setMiLista(null);
        return;
      }
      setMiLista(vista.ok ? vista : fusionarError(null, vista));
    };

    void restaurarAplicar();
    void restaurarLista();
    return () => {
      cancelado = true;
    };
  }, [ofertaId, oportunidadId]);

  /* Nombre y celular ya guardados vuelven al formulario si el paso sigue abierto. */
  useEffect(() => {
    const id = aplicar?.sesionDemo?.id;
    const contacto = aplicar?.sesionDemo?.contacto;
    const paso = aplicar?.ui.paso;
    if (!id || !contacto || precargado.current === id) return;
    if (paso !== 'iniciada' && paso !== 'datos') return;
    precargado.current = id;
    setBorrador({
      nombre: contacto.nombreCompleto || '',
      celular: contacto.celularE164 || '',
      correo: contacto.correo || ''
    });
  }, [aplicar]);

  /* Ningún permiso viene marcado. El string true del servidor no cuenta. */
  useEffect(() => {
    if (aplicar?.ui.paso !== 'consentimiento') return;
    const firma = `${aplicar.sesionDemo?.id || ''}:${aplicar.consentimientos.map((item) => item.codigo).join('|')}`;
    if (!firma || firma === firmaMarcas.current) return;
    firmaMarcas.current = firma;
    setMarcas(Object.fromEntries(aplicar.consentimientos.map((item) => [item.codigo, false])));
  }, [aplicar]);

  const publicarAplicar = useCallback((seq: number, vista: VistaFunnel) => {
    if (seq !== seqAplicar.current) return;
    setAplicar(vista);
    if (!ofertaId || !oportunidadId || !vista.sesionDemo?.id) return;
    const memoria = leerMemoria(almacenNavegador(), oportunidadId, ofertaId);
    memoria.aplicar.intencionId = vista.sesionDemo.id;
    recordarIntencion(oportunidadId, ofertaId, memoria);
  }, [ofertaId, oportunidadId]);

  const conTextos = useCallback(async (vista: VistaFunnel) => {
    if (!oportunidadId || !vista.ok || vista.ui.paso !== 'consentimiento' || !vista.sesionDemo?.id) return vista;
    const textos = await pedir(
      rutaConHilo(`/api/demowapp/aplicar/${vista.sesionDemo.id}/consentimiento`, oportunidadId),
      'GET'
    );
    return textos.ok ? textos : fusionarError(vista, textos);
  }, [oportunidadId]);

  const iniciarAplicar = useCallback(() => {
    if (!ofertaId || !oportunidadId || aplicar?.ui.cargando || ocupadoAplicar.current) return;
    ocupadoAplicar.current = true;
    const memoria = leerMemoria(almacenNavegador(), oportunidadId, ofertaId);
    if (esCierreAplicar(aplicar?.ui.paso)) {
      memoria.aplicar = rotarSlot(memoria.aplicar, oportunidadId, ofertaId, 'iniciar');
      recordarIntencion(oportunidadId, ofertaId, memoria);
      precargado.current = null;
      firmaMarcas.current = '';
      setBorrador({ nombre: '', celular: '', correo: '' });
      setMarcas({});
    }
    const seq = ++seqAplicar.current;
    const base = esCierreAplicar(aplicar?.ui.paso) ? null : aplicar;
    setAplicar(vistaCargando(base, 'iniciada'));
    void (async () => {
      try {
        const vista = await pedir(
          '/api/demowapp/aplicar',
          'POST',
          cuerpoIniciarHilo({
            accion: 'iniciar',
            ofertaId,
            oportunidadId,
            claveIdempotencia: memoria.aplicar.clave
          })
        );
        const lista = vista.ok ? await conTextos(vista) : fusionarError(base, vista);
        publicarAplicar(seq, lista);
      } finally {
        if (seq === seqAplicar.current) ocupadoAplicar.current = false;
      }
    })();
  }, [ofertaId, oportunidadId, aplicar, conTextos, publicarAplicar]);

  const guardarEnLista = useCallback(() => {
    /* La misma clave vuelve a la fila de Mi lista. No abre datos ni consentimiento. */
    if (!ofertaId || !oportunidadId || miLista?.ui.cargando || ocupadoLista.current) return;
    ocupadoLista.current = true;
    const memoria = leerMemoria(almacenNavegador(), oportunidadId, ofertaId);
    const seq = ++seqLista.current;
    setMiLista(vistaCargando(miLista, 'mi_lista'));
    void (async () => {
      try {
        const vista = vistaSoloLista(
          await pedir(
            '/api/demowapp/aplicar',
            'POST',
            cuerpoIniciarHilo({
              accion: 'mi_lista',
              ofertaId,
              oportunidadId,
              claveIdempotencia: memoria.lista.clave
            })
          )
        );
        if (seq !== seqLista.current) return;
        const pintada = vista.ok ? vista : fusionarError(miLista, vista);
        setMiLista(vistaSoloLista(pintada));
        if (pintada.ok && pintada.sesionDemo?.id && pintada.ui.paso === 'mi_lista') {
          memoria.lista.intencionId = pintada.sesionDemo.id;
          recordarIntencion(oportunidadId, ofertaId, memoria);
        }
      } finally {
        if (seq === seqLista.current) ocupadoLista.current = false;
      }
    })();
  }, [ofertaId, oportunidadId, miLista]);

  const enviarDatos = useCallback(() => {
    const intencionId = aplicar?.sesionDemo?.id;
    if (!ofertaId || !oportunidadId || !intencionId || aplicar?.ui.cargando || ocupadoAplicar.current) return;
    if (aplicar.ui.paso === 'mi_lista') return;
    ocupadoAplicar.current = true;
    const seq = ++seqAplicar.current;
    setAplicar(vistaCargando(aplicar, aplicar.ui.paso));
    const cuerpo: Record<string, string> = {
      oportunidadId,
      nombreCompleto: borrador.nombre,
      celular: borrador.celular,
      pais: 'CO'
    };
    if (borrador.correo.trim()) cuerpo.correo = borrador.correo.trim();
    void (async () => {
      try {
        const vista = await pedir(`/api/demowapp/aplicar/${intencionId}/datos`, 'POST', cuerpo);
        const lista = vista.ok ? await conTextos(vista) : fusionarError(aplicar, vista);
        publicarAplicar(seq, lista);
      } finally {
        if (seq === seqAplicar.current) ocupadoAplicar.current = false;
      }
    })();
  }, [ofertaId, oportunidadId, aplicar, borrador, conTextos, publicarAplicar]);

  const decidir = useCallback((decision: DecisionHilo) => {
    const intencionId = aplicar?.sesionDemo?.id;
    if (!ofertaId || !oportunidadId || !intencionId || aplicar?.ui.cargando || ocupadoAplicar.current) return;
    if (aplicar.ui.paso === 'mi_lista') return;
    ocupadoAplicar.current = true;
    const seq = ++seqAplicar.current;
    setAplicar(vistaCargando(aplicar, aplicar.ui.paso));
    const cuerpo: Record<string, unknown> = { decision, oportunidadId };
    if (decision === 'aceptar') {
      cuerpo.consentimientos = declaracionesDesdeMarcas(
        aplicar.consentimientos.map((item) => item.codigo),
        marcas
      );
    }
    void (async () => {
      try {
        const vista = await pedir(`/api/demowapp/aplicar/${intencionId}/consentimiento`, 'POST', cuerpo);
        publicarAplicar(seq, vista.ok ? vista : fusionarError(aplicar, vista));
      } finally {
        if (seq === seqAplicar.current) ocupadoAplicar.current = false;
      }
    })();
  }, [ofertaId, oportunidadId, aplicar, marcas, publicarAplicar]);

  /* Si el POST de datos no trajo el catálogo, el hilo vuelve a pedir el texto. */
  const verPermisos = useCallback(() => {
    const intencionId = aplicar?.sesionDemo?.id;
    if (!ofertaId || !oportunidadId || !intencionId || aplicar?.ui.cargando || ocupadoAplicar.current) return;
    if (aplicar.ui.paso !== 'consentimiento') return;
    ocupadoAplicar.current = true;
    const seq = ++seqAplicar.current;
    setAplicar(vistaCargando(aplicar, 'consentimiento'));
    void (async () => {
      try {
        const textos = await pedir(
          rutaConHilo(`/api/demowapp/aplicar/${intencionId}/consentimiento`, oportunidadId),
          'GET'
        );
        publicarAplicar(seq, textos.ok ? textos : fusionarError(aplicar, textos));
      } finally {
        if (seq === seqAplicar.current) ocupadoAplicar.current = false;
      }
    })();
  }, [ofertaId, oportunidadId, aplicar, publicarAplicar]);

  const cambiarBorrador = useCallback((campo: keyof BorradorDatos, valor: string) => {
    setBorrador((actual) => ({ ...actual, [campo]: valor }));
  }, []);

  const alternarMarca = useCallback((codigo: string, otorgado: boolean) => {
    setMarcas((actual) => ({ ...actual, [codigo]: otorgado === true }));
  }, []);

  const ancla = [
    ofertaId || '',
    aplicar?.ui.paso || '',
    aplicar?.ui.cargando ? '1' : '0',
    aplicar?.leadCreado ? '1' : '0',
    aplicar?.mensajes.at(-1)?.id || '',
    miLista?.ui.paso || '',
    miLista?.ui.cargando ? '1' : '0',
    miLista?.mensajes.at(-1)?.id || ''
  ].join('|');

  return {
    ofertaId,
    aplicar,
    miLista,
    borrador,
    marcas,
    ancla,
    cambiarBorrador,
    alternarMarca,
    iniciarAplicar,
    guardarEnLista,
  enviarDatos,
  decidir,
  verPermisos
};
}
