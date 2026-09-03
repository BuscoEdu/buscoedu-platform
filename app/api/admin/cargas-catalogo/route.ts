import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import {
  CABECERAS_OFERTAS,
  CABECERAS_PROGRAMAS,
  generarCsvPlantilla,
  normalizarTexto,
  parseCsv,
  type AccionCarga,
  type FilaPrevisualizada,
  type TipoCargaCatalogo
} from '@/src/lib/catalog-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Catalogo = { id: string; nombre?: string | null; nombre_oficial?: string | null; universidad_id?: string | null; sede_id?: string | null };
type Programa = { id: string; universidad_id: string | null; sede_id: string | null; codigo_snies: string | null; nombre_oficial: string | null; nivel_academico_id: string | null; modalidad_id: string | null };

function texto(item: Catalogo) {
  return item.nombre_oficial || item.nombre || '';
}

function buscarCatalogo(items: Catalogo[], valor: string, universidadId?: string | null) {
  const buscado = normalizarTexto(valor);
  return items.find((item) => normalizarTexto(texto(item)) === buscado && (!universidadId || item.universidad_id === universidadId));
}

function requerido(valores: Record<string, string>, campos: string[]) {
  return campos.filter((campo) => !valores[campo]?.trim());
}

async function datosBase() {
  const supabase = getServiceRoleClient();
  const [universidades, sedes, niveles, modalidades, jornadas, areas, programas, periodos, comerciales, ofertas, referencias, tiposBeneficio] = await Promise.all([
    supabase.from('universidades').select('id, nombre_oficial'),
    supabase.from('sedes').select('id, nombre, universidad_id'),
    supabase.from('niveles_academicos').select('id, nombre'),
    supabase.from('modalidades').select('id, nombre'),
    supabase.from('jornadas').select('id, nombre'),
    supabase.from('areas_conocimiento').select('id, nombre'),
    supabase.from('programas_academicos').select('id, universidad_id, sede_id, codigo_snies, nombre_oficial, nivel_academico_id, modalidad_id'),
    supabase.from('periodos_academicos').select('id, nombre, universidad_id, sede_id'),
    supabase.from('periodos_comerciales').select('id, nombre'),
    supabase.from('ofertas_academicas').select('id, programa_id, periodo_academico_id, periodo_comercial_id'),
    supabase.from('referencias_externas_programa').select('programa_id, universidad_id, fuente, codigo_externo'),
    supabase.from('tipos_beneficio').select('id, codigo, nombre')
  ]);
  return {
    universidades: (universidades.data || []) as Catalogo[], sedes: (sedes.data || []) as Catalogo[], niveles: (niveles.data || []) as Catalogo[], modalidades: (modalidades.data || []) as Catalogo[], jornadas: (jornadas.data || []) as Catalogo[], areas: (areas.data || []) as Catalogo[], programas: (programas.data || []) as Programa[], periodos: (periodos.data || []) as Catalogo[], comerciales: (comerciales.data || []) as Catalogo[], ofertas: (ofertas.data || []) as Array<{ id: string; programa_id: string; periodo_academico_id: string | null; periodo_comercial_id: string | null }>, referencias: (referencias.data || []) as Array<{ programa_id: string; universidad_id: string; fuente: string; codigo_externo: string }>, tiposBeneficio: (tiposBeneficio.data || []) as Array<{ id: string; codigo: string; nombre: string }>
  };
}

function encontrarPrograma(valores: Record<string, string>, universidadId: string, base: Awaited<ReturnType<typeof datosBase>>) {
  const codigoOrigen = valores.codigo_programa_origen?.trim();
  const snies = valores.codigo_snies?.trim();
  if (codigoOrigen) {
    const referencia = base.referencias.find((item) => item.universidad_id === universidadId && item.codigo_externo === codigoOrigen);
    if (referencia) return base.programas.find((programa) => programa.id === referencia.programa_id);
  }
  if (snies) {
    const programaSnies = base.programas.find((programa) => programa.universidad_id === universidadId && programa.codigo_snies === snies);
    if (programaSnies) return programaSnies;
  }
  const nombre = normalizarTexto(valores.nombre_oficial || valores.nombre_programa);
  const candidatos = base.programas.filter((programa) => programa.universidad_id === universidadId && normalizarTexto(programa.nombre_oficial) === nombre);
  return candidatos.length === 1 ? candidatos[0] : undefined;
}

async function previsualizar(tipo: TipoCargaCatalogo, csv: string): Promise<{ filas: FilaPrevisualizada[]; error?: string }> {
  const { cabeceras, filas } = parseCsv(csv);
  const esperadas = tipo === 'programas' ? CABECERAS_PROGRAMAS : CABECERAS_OFERTAS;
  const faltantes = esperadas.filter((cabecera) => !cabeceras.includes(cabecera));
  if (faltantes.length) return { filas: [], error: `Faltan columnas en la plantilla: ${faltantes.join(', ')}` };
  const base = await datosBase();
  const vistos = new Set<string>();
  const resultado: FilaPrevisualizada[] = filas.map((fila) => {
    const mensajes: string[] = [];
    const obligatorios = tipo === 'programas'
      ? requerido(fila.valores, ['universidad', 'nombre_oficial', 'nivel_academico', 'modalidad'])
      : requerido(fila.valores, ['universidad', 'periodo_academico']);
    if (obligatorios.length) return { ...fila, accion: 'error', mensajes: [`Faltan datos obligatorios: ${obligatorios.join(', ')}`] };

    const universidad = buscarCatalogo(base.universidades, fila.valores.universidad);
    if (!universidad) return { ...fila, accion: 'error', mensajes: ['La universidad no existe en BuscoEdu. Créala o corrige el nombre antes de importar.'] };
    const sede = fila.valores.sede ? buscarCatalogo(base.sedes, fila.valores.sede, universidad.id) : undefined;
    if (fila.valores.sede && !sede) return { ...fila, accion: 'error', mensajes: ['La sede no existe o no pertenece a la universidad indicada.'] };

    const claveArchivo = tipo === 'programas'
      ? `${universidad.id}|${fila.valores.codigo_snies || fila.valores.codigo_programa_origen || normalizarTexto(fila.valores.nombre_oficial)}|${normalizarTexto(fila.valores.modalidad)}`
      : `${universidad.id}|${fila.valores.codigo_snies || fila.valores.codigo_programa_origen || normalizarTexto(fila.valores.nombre_programa)}|${normalizarTexto(fila.valores.periodo_academico)}|${normalizarTexto(fila.valores.periodo_comercial)}`;
    if (vistos.has(claveArchivo)) return { ...fila, accion: 'error', mensajes: ['Esta fila está repetida dentro del mismo archivo.'] };
    vistos.add(claveArchivo);

    if (tipo === 'programas') {
      const nivel = buscarCatalogo(base.niveles, fila.valores.nivel_academico);
      const modalidad = buscarCatalogo(base.modalidades, fila.valores.modalidad);
      if (!nivel || !modalidad) return { ...fila, accion: 'error', mensajes: ['Nivel académico o modalidad no existe en los catálogos.'] };
      const programa = encontrarPrograma(fila.valores, universidad.id, base);
      if (programa) return { ...fila, accion: 'vincular', programaId: programa.id, coincidencia: programa.nombre_oficial || undefined, mensajes: ['Encontramos un programa existente. No se duplicará; puedes vincularlo o omitirlo.'] };
      return { ...fila, accion: 'crear', mensajes: ['Se registrará como programa nuevo en estado pendiente de validación.'] };
    }

    if (!fila.valores.codigo_snies?.trim() && !fila.valores.codigo_programa_origen?.trim() && !fila.valores.nombre_programa?.trim()) {
      return { ...fila, accion: 'error', mensajes: ['Indica SNIES, código de origen o nombre del programa para asociar la oferta.'] };
    }
    const programa = encontrarPrograma(fila.valores, universidad.id, base);
    if (!programa) return { ...fila, accion: 'error', mensajes: ['No encontramos el programa base. Cárgalo primero en Programas o corrige la referencia.'] };
    const periodo = buscarCatalogo(base.periodos, fila.valores.periodo_academico, universidad.id);
    if (!periodo) return { ...fila, accion: 'error', mensajes: ['El período académico no existe para la universidad indicada.'] };
    const comercial = fila.valores.periodo_comercial ? buscarCatalogo(base.comerciales, fila.valores.periodo_comercial) : undefined;
    if (fila.valores.periodo_comercial && !comercial) return { ...fila, accion: 'error', mensajes: ['El período comercial no existe. Créalo antes o corrige el nombre.'] };
    const oferta = base.ofertas.find((item) => item.programa_id === programa.id && item.periodo_academico_id === periodo.id && (!comercial || item.periodo_comercial_id === comercial.id));
    if (oferta) return { ...fila, accion: 'actualizar', programaId: programa.id, ofertaId: oferta.id, coincidencia: programa.nombre_oficial || undefined, mensajes: ['Ya existe una oferta para este programa y período. Podrás actualizar sus condiciones o omitirla.'] };
    return { ...fila, accion: 'crear', programaId: programa.id, coincidencia: programa.nombre_oficial || undefined, mensajes: ['Se creará una oferta en estado pendiente de validación.'] };
  });
  return { filas: resultado };
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth.ok === false) return auth.response;
  const tipo = request.nextUrl.searchParams.get('tipo') as TipoCargaCatalogo;
  if (tipo !== 'programas' && tipo !== 'ofertas') return NextResponse.json({ error: 'tipo_invalido' }, { status: 400 });
  return new NextResponse(generarCsvPlantilla(tipo), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="plantilla_${tipo}.csv"` } });
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth.ok === false) return auth.response;
  const body = await request.json();
  const tipo = body?.tipo as TipoCargaCatalogo;
  if (tipo !== 'programas' && tipo !== 'ofertas' || typeof body?.csv !== 'string') return NextResponse.json({ error: 'solicitud_invalida' }, { status: 400 });
  const vista = await previsualizar(tipo, body.csv);
  if (vista.error) return NextResponse.json({ error: vista.error }, { status: 400 });
  if (body.modo !== 'confirmar') return NextResponse.json({ ok: true, filas: vista.filas });

  const decisiones = new Map<number, AccionCarga>(Object.entries(body.decisiones || {}).map(([linea, accion]) => [Number(linea), accion as AccionCarga]));
  const service = getServiceRoleClient();
  const { data: carga, error: cargaError } = await service.from('cargas_catalogo').insert({ tipo, nombre_archivo: body.nombreArchivo || `carga_${tipo}.csv`, estado: 'confirmado', total_filas: vista.filas.length, creado_por: auth.ctx.usuarioInternoId, confirmado_por: auth.ctx.usuarioInternoId, confirmado_en: new Date().toISOString() }).select('id').single();
  if (cargaError || !carga) return NextResponse.json({ error: cargaError?.message || 'No fue posible iniciar la carga.' }, { status: 500 });

  const base = await datosBase();
  let creadas = 0; let actualizadas = 0; let omitidas = 0; let errores = 0;
  for (const fila of vista.filas) {
    const accion = decisiones.get(fila.numeroLinea) || fila.accion;
    const mensajes = [...fila.mensajes];
    let programaId = fila.programaId || null;
    let ofertaId = fila.ofertaId || null;
    let resultado: 'creado' | 'vinculado' | 'actualizado' | 'omitido' | 'error' = 'omitido';
    try {
      if (accion === 'omitir' || accion === 'error' || fila.accion === 'error') { omitidas += 1; resultado = accion === 'error' || fila.accion === 'error' ? 'error' : 'omitido'; if (resultado === 'error') errores += 1; }
      else {
        const universidad = buscarCatalogo(base.universidades, fila.valores.universidad)!;
        const sede = fila.valores.sede ? buscarCatalogo(base.sedes, fila.valores.sede, universidad.id) : undefined;
        if (tipo === 'programas') {
          if (accion === 'crear') {
            const nivel = buscarCatalogo(base.niveles, fila.valores.nivel_academico)!;
            const modalidad = buscarCatalogo(base.modalidades, fila.valores.modalidad)!;
            const jornada = fila.valores.jornada ? buscarCatalogo(base.jornadas, fila.valores.jornada) : undefined;
            const area = fila.valores.area_conocimiento ? buscarCatalogo(base.areas, fila.valores.area_conocimiento) : undefined;
            const { data, error } = await service.from('programas_academicos').insert({ universidad_id: universidad.id, sede_id: sede?.id || null, nombre_oficial: fila.valores.nombre_oficial, nombre_corto: fila.valores.nombre_corto || null, codigo_snies: fila.valores.codigo_snies || null, nivel_academico_id: nivel.id, modalidad_id: modalidad.id, jornada_id: jornada?.id || null, area_conocimiento_id: area?.id || null, duracion_valor: fila.valores.duracion_valor ? Number(fila.valores.duracion_valor) : null, duracion_unidad: fila.valores.duracion_unidad || null, numero_creditos: fila.valores.numero_creditos ? Number(fila.valores.numero_creditos) : null, titulo_otorgado: fila.valores.titulo_otorgado || null, descripcion: fila.valores.descripcion || null, estado_validacion: 'pendiente', estado_publicacion: 'creado_internamente', activo: true }).select('id').single();
            if (error || !data) throw new Error(error?.message || 'No fue posible crear el programa.');
            programaId = data.id; creadas += 1; resultado = 'creado';
          } else { actualizadas += 1; resultado = 'vinculado'; }
          if (programaId && fila.valores.codigo_programa_origen) await service.from('referencias_externas_programa').upsert({ programa_id: programaId, universidad_id: universidad.id, fuente: 'archivo_super_admin', codigo_externo: fila.valores.codigo_programa_origen, activo: true }, { onConflict: 'universidad_id,fuente,codigo_externo' });
        } else {
          const periodo = buscarCatalogo(base.periodos, fila.valores.periodo_academico, universidad.id)!;
          const comercial = fila.valores.periodo_comercial ? buscarCatalogo(base.comerciales, fila.valores.periodo_comercial) : undefined;
          const valoresOferta = { programa_id: programaId, universidad_id: universidad.id, sede_id: sede?.id || null, periodo_academico_id: periodo.id, periodo_comercial_id: comercial?.id || null, nombre_oferta: fila.valores.nombre_oferta || fila.valores.nombre_programa, descripcion_beneficio: fila.valores.descripcion_beneficio || null, tipo_beneficio: fila.valores.tipo_beneficio || null, porcentaje_descuento: fila.valores.porcentaje_descuento ? Number(fila.valores.porcentaje_descuento) : null, cupos_disponibles: fila.valores.cupos_disponibles ? Number(fila.valores.cupos_disponibles) : null, vigente_desde: fila.valores.vigente_desde || null, vigente_hasta: fila.valores.vigente_hasta || null, estado_validacion: 'pendiente', estado_publicacion: 'creado_internamente', activo: true };
          if (accion === 'actualizar' && ofertaId) { const { error } = await service.from('ofertas_academicas').update(valoresOferta).eq('id', ofertaId); if (error) throw new Error(error.message); actualizadas += 1; resultado = 'actualizado'; }
          else { const { data, error } = await service.from('ofertas_academicas').insert(valoresOferta).select('id').single(); if (error || !data) throw new Error(error?.message || 'No fue posible crear la oferta.'); ofertaId = data.id; creadas += 1; resultado = 'creado'; }
          if (ofertaId && fila.valores.precio) {
            const { error } = await service.from('precios_oferta').insert({ oferta_id: ofertaId, periodo_academico_id: periodo.id, tipo_valor: 'universidad', valor: Number(fila.valores.precio), moneda: fila.valores.moneda || 'COP', periodicidad: fila.valores.periodicidad || 'unico', concepto_cobro: fila.valores.concepto_cobro || 'periodo_academico', fuente: 'archivo_super_admin', es_precio_activo: true, vigente_desde: fila.valores.vigente_desde || null, vigente_hasta: fila.valores.vigente_hasta || null });
            if (error) mensajes.push(`La oferta se creó, pero el precio requiere revisión: ${error.message}`);
          }
          if (ofertaId && fila.valores.tipo_beneficio) {
            const tipoBeneficio = base.tiposBeneficio.find((item) => normalizarTexto(item.codigo) === normalizarTexto(fila.valores.tipo_beneficio) || normalizarTexto(item.nombre) === normalizarTexto(fila.valores.tipo_beneficio));
            const beneficio = {
              oferta_id: ofertaId,
              tipo_beneficio_id: tipoBeneficio?.id || null,
              nombre_beneficio: tipoBeneficio?.nombre || fila.valores.tipo_beneficio,
              descripcion: fila.valores.descripcion_beneficio || null,
              condiciones: fila.valores.condiciones_beneficio || null,
              vigente_desde: fila.valores.vigente_desde || null,
              vigente_hasta: fila.valores.vigente_hasta || null,
              estado_validacion: 'pendiente',
              estado_publicacion: 'creado_internamente',
              es_principal: true,
              activo: true
            };
            const { data: beneficioExistente } = await service.from('beneficios_oferta').select('id').eq('oferta_id', ofertaId).eq('es_principal', true).maybeSingle();
            const { error } = beneficioExistente
              ? await service.from('beneficios_oferta').update(beneficio).eq('id', beneficioExistente.id)
              : await service.from('beneficios_oferta').insert(beneficio);
            if (error) mensajes.push(`La oferta se creó, pero el beneficio requiere revisión: ${error.message}`);
          }
        }
      }
    } catch (error) { resultado = 'error'; errores += 1; mensajes.push(error instanceof Error ? error.message : 'Error no identificado.'); }
    await service.from('cargas_catalogo_filas').insert({ carga_id: carga.id, numero_linea: fila.numeroLinea, datos_origen: fila.valores, accion, resultado, programa_id: programaId, oferta_id: ofertaId, mensajes });
  }
  const estado = errores ? 'completado_con_alertas' : 'completado';
  await service.from('cargas_catalogo').update({ estado, filas_creadas: creadas, filas_actualizadas: actualizadas, filas_omitidas: omitidas, filas_con_error: errores, resumen: { creadas, actualizadas, omitidas, errores }, finalizado_en: new Date().toISOString() }).eq('id', carga.id);
  return NextResponse.json({ ok: true, cargaId: carga.id, resumen: { creadas, actualizadas, omitidas, errores } });
}
