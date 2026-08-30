'use client';

import { useEffect, useState } from 'react';
import OtpInput from './OtpInput';
import { getOrCreateVisitorId } from '@/src/lib/visitor';

interface TipoConsentimiento {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  version?: string;
  texto_completo?: string;
  es_obligatorio?: boolean;
}

interface Props {
  ofertaId: string;
  ofertaNombre: string;
  /** 'por_lead' exige transferencia; 'por_inscrito' gestión interna. Puede venir null. */
  modeloNegocio?: string | null;
  onCerrar: () => void;
  onConvertido: (resultado: any) => void;
}

type Paso = 'datos' | 'otp' | 'consentimientos' | 'enviando' | 'listo';

/**
 * Flujo completo de aplicación a una oferta (consent-first):
 *   datos → verificación OTP → consentimientos (sin casillas preseleccionadas)
 *   → conversión transaccional.
 * Mobile-first. No transfiere a universidad sin consentimiento explícito.
 */
export default function AplicacionConsentimientoModal({
  ofertaId,
  ofertaNombre,
  modeloNegocio,
  onCerrar,
  onConvertido
}: Props) {
  const [paso, setPaso] = useState<Paso>('datos');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [celular, setCelular] = useState('');
  const [celularNorm, setCelularNorm] = useState('');
  const [pais, setPais] = useState('CO');
  const [codigo, setCodigo] = useState('');
  const [codigoDemo, setCodigoDemo] = useState('');
  const [esSimulado, setEsSimulado] = useState(false);
  const [tipos, setTipos] = useState<TipoConsentimiento[]>([]);
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});
  const [visitanteId, setVisitanteId] = useState('');
  const [cargando, setCargando] = useState(false);
  const [enviandoConversion, setEnviandoConversion] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<any>(null);

  useEffect(() => {
    getOrCreateVisitorId().then(setVisitanteId);
    fetch('/api/leadcenter/consentimientos')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setTipos(d.items || []);
      })
      .catch(() => {});
  }, []);

  const requiereTransferencia = modeloNegocio === 'por_lead';

  const enviarDatos = async () => {
    if (nombre.trim().length < 3) return setError('Ingresa tu nombre completo.');
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
      return setError('El correo no parece válido.');
    if (celular.trim().length < 7) return setError('Ingresa un celular válido.');
    setError('');
    setCargando(true);
    try {
      const res = await fetch('/api/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celular, proposito: 'registro', visitanteId })
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.mensaje || 'No se pudo enviar el código.');
        return;
      }
      setCelularNorm(d.celular);
      setPais(d.pais || 'CO');
      setEsSimulado(!!d.proveedorSimulado);
      if (d.codigoDemo) setCodigoDemo(d.codigoDemo);
      setPaso('otp');
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const verificar = async (cod: string) => {
    if (cod.length !== 6) return;
    setError('');
    setCargando(true);
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celular: celularNorm, codigo: cod, proposito: 'registro' })
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.mensaje || 'Código incorrecto.');
        return;
      }
      setPaso('consentimientos');
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const convertir = async () => {
    if (enviandoConversion) return;

    // Validación: el consentimiento obligatorio (tratamiento de datos) debe estar.
    const obligatorios = tipos.filter((t) => t.es_obligatorio);
    for (const o of obligatorios) {
      if (!seleccion[o.codigo]) {
        setError(`Debes aceptar: ${o.nombre}.`);
        return;
      }
    }

    setError('');
    setPaso('enviando');
    setCargando(true);
    setEnviandoConversion(true);

    try {
      const claveIdempotencia = `${visitanteId || 'anon'}:${ofertaId}:${celularNorm}`;
      const consentimientos = tipos.map((t) => ({
        codigo: t.codigo,
        otorgado: !!seleccion[t.codigo],
        versionTexto: t.version || 'v1'
      }));
      const res = await fetch('/api/leadcenter/convertir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          celular: celularNorm,
          pais,
          ofertaId,
          nombreCompleto: nombre.trim(),
          correo: correo.trim() || undefined,
          visitanteId,
          claveIdempotencia,
          consentimientos
        })
      });

      const d = await res.json();
      if (!d.ok) {
        if (d.error === 'duplicada') {
          setError('Esta solicitud ya estaba creada.');
          setPaso('consentimientos');
          return;
        }
        if (d.error === 'limite_alcanzado') {
          setError(
            'Solo puedes tener hasta 3 aplicaciones activas. Debes cerrar tu solicitud con la universidad o con BuscoEdu antes de crear otra.'
          );
          setPaso('consentimientos');
          return;
        }

        setError(d.mensaje || 'No se pudo completar la aplicación.');
        setPaso('consentimientos');
        return;
      }

      setResultado(d);
      onConvertido(d);
      onCerrar();
    } catch {
      setError('Error de red. Intenta de nuevo.');
      setPaso('consentimientos');
    } finally {
      setCargando(false);
      setEnviandoConversion(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="pr-4 text-lg font-semibold text-gray-900">Aplicar a: {ofertaNombre}</h2>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <p className="mb-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          Aplicar está sujeto a requisitos, revisión, condiciones, vigencia y disponibilidad.
          Iniciar la aplicación no garantiza admisión ni asignación de beneficio.
        </p>

        {paso === 'datos' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nombre completo</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Correo <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Celular</label>
              <input
                type="tel"
                inputMode="tel"
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                placeholder="Ej: 300 123 4567"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={enviarDatos}
              disabled={cargando}
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {cargando ? 'Enviando…' : 'Continuar'}
            </button>
          </div>
        )}

        {paso === 'otp' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Ingresa el código de 6 dígitos enviado a <strong>{celularNorm}</strong>.
            </p>
            <OtpInput
              onCompleto={(c) => {
                setCodigo(c);
                verificar(c);
              }}
              onCambio={setCodigo}
              disabled={cargando}
            />
            {esSimulado && codigoDemo && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-semibold">Código de demostración</p>
                <p className="mt-1 font-mono text-lg tracking-widest">{codigoDemo}</p>
                <p className="mt-1 text-xs">
                  En producción llega por SMS/WhatsApp y no se muestra aquí.
                </p>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={() => verificar(codigo)}
              disabled={cargando || codigo.length !== 6}
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {cargando ? 'Verificando…' : 'Verificar'}
            </button>
          </div>
        )}

        {paso === 'consentimientos' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Antes de continuar, revisa y autoriza lo que corresponda. Ninguna casilla viene
              marcada por defecto.
            </p>
            {requiereTransferencia && (
              <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
                Esta oferta se gestiona directamente con la universidad. Para que te contacten,
                necesitas autorizar la transferencia de tus datos.
              </p>
            )}
            <div className="space-y-3">
              {tipos.map((t) => (
                <label
                  key={t.codigo}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3"
                >
                  <input
                    type="checkbox"
                    checked={!!seleccion[t.codigo]}
                    onChange={(e) =>
                      setSeleccion((prev) => ({ ...prev, [t.codigo]: e.target.checked }))
                    }
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-gray-900">
                      {t.nombre}
                      {t.es_obligatorio && <span className="text-red-500"> *</span>}
                    </span>
                    {t.texto_completo && (
                      <span className="mt-1 block text-xs text-gray-500">{t.texto_completo}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={convertir}
              disabled={cargando || enviandoConversion}
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {cargando || enviandoConversion ? 'Procesando…' : 'Confirmar aplicación'}
            </button>
          </div>
        )}

        {paso === 'enviando' && (
          <div className="py-10 text-center text-gray-600">Procesando tu aplicación…</div>
        )}

        {paso === 'listo' && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
              ✓
            </div>
            <p className="font-semibold text-gray-900">¡Aplicación registrada!</p>
            <p className="text-sm text-gray-600">
              {resultado?.requiere_consentimiento_transferencia
                ? 'Tu solicitud quedó registrada. Para compartir tus datos con la universidad necesitamos tu autorización de transferencia.'
                : 'Un asesor dará seguimiento a tu solicitud muy pronto.'}
            </p>
            <button
              onClick={onCerrar}
              className="w-full rounded-xl bg-gray-900 py-3 font-semibold text-white hover:bg-black"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
