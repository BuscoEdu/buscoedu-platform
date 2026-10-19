# Generador de la carga de 4 aliadas (Poli, Areandina, UNIR, Asturias) — BD BuscoEdu 2026-10-19
# Basado en gen_carga_aliadas_20261017.py (mismo namespace uuid5 => mismos ids), con las
# correcciones del dry-run contra el esquema real de prod (ver docs/bd/README-carga-aliadas-20261017.md).
# Salida: supabase/ops/20261019_carga_aliadas_{2_dryrun,3_paso1_staging,4_paso2_carga}.sql
import openpyxl, uuid, json, collections, os, sys
SRC='/workspace/buscoedu-knowledge/research/programas-aliadas/programas-aliadas-2026-10-05.xlsx'
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','supabase','ops')
HOY='2026-10-19'; TOPE='2026-12-31'
EXCLUIR={'52058','109936','111217'}
NS=uuid.UUID('6f1c2a7e-0b1d-4c55-9a51-20261017a11a'.replace('a11a','0a11'))
def uid(*k): return str(uuid.uuid5(NS,'|'.join(map(str,k))))
UNIS={
 'Politécnico Grancolombiano':dict(slug='poli'),
 'Fundación Universitaria del Área Andina':dict(slug='areandina'),
 'Fundación Universitaria Internacional de La Rioja (UNIR)':dict(slug='unir'),
 'Corporación Universitaria de Asturias':dict(slug='asturias'),
}
# Corrección DR-2: nivel por CÓDIGO del catálogo real (niveles_academicos.codigo)
NIVEL={'Universitario':'pregrado','Especialización universitaria':'especializacion','Maestría':'maestria',
       'Tecnológico':'tecnologo','Formación técnica profesional':'tecnico','Doctorado':'doctorado'}
# Corrección DR-3: modalidad por CÓDIGO (modalidades.codigo)
MODAL={'Presencial':'presencial','Virtual':'virtual','A distancia':'distancia',
       'Híbrida (Presencial-Virtual)':'semipresencial','Presencial-Virtual':'semipresencial'}
# Corrección DR-4: área SNIES -> área BuscoEdu (areas_conocimiento.nombre). 'Sin información' -> NULL
AREA={'Economía, administración, contaduría y afines':'Administración y Negocios',
      'Ingeniería, arquitectura, urbanismo y afines':'Ingeniería y Tecnología',
      'Ciencias de la salud':'Ciencias de la Salud',
      'Ciencias sociales y humanas':'Ciencias Sociales y Humanidades',
      'Ciencias de la educación':'Educación y Pedagogía',
      'Bellas artes':'Arte, Diseño y Comunicación',
      'Matemáticas y ciencias naturales':'Ciencias Exactas y Naturales',
      'Agronomía, veterinaria y afines':'Agronomía y Ciencias Ambientales',
      'Sin información':None}
wb=openpyxl.load_workbook(SRC,read_only=True,data_only=True)
rows=list(wb['Consolidado'].iter_rows(values_only=True)); h=rows[0]
R=[dict(zip(h,r),_fila=i+2) for i,r in enumerate(rows[1:])]
def q(v):
    if v is None or (isinstance(v,str) and v.strip()==''): return 'NULL'
    return "'"+str(v).replace("'","''")+"'"
def num(v):
    try: return str(int(round(float(v)))) if v not in (None,'') else 'NULL'
    except: return 'NULL'
filas=[]; cnt=collections.Counter()
for r in R:
    u=r['universidad']
    if u not in UNIS: continue
    s=str(r['codigo_snies'])
    if s in EXCLUIR: cnt[(UNIS[u]['slug'],'excluida')]+=1; continue
    U=UNIS[u]; venc=r['snies_fecha_vencimiento_registro']
    pub = r['publicable']=='sí' and (venc is None or str(venc)>=HOY)
    sede=r['sede']; sid=uid('sede',U['slug'],sede)
    vd = (str(r['vigente_desde']) if r['vigente_desde'] else HOY) if pub else None
    vh = (min(str(venc),TOPE) if venc else TOPE) if pub else (str(venc) if venc else None)
    # Corrección DR-5: duracion_unidad con el CHECK real (semestres|trimestres|meses|anios|creditos)
    dv, du = r['duracion_valor'], r['duracion_unidad']
    if du=='años': du='anios'
    elif du=='cuatrimestres' and dv not in (None,''): dv=float(dv)*4; du='meses'
    if r['nivel_academico'] not in NIVEL or r['modalidad'] not in MODAL or r['area_conocimiento'] not in AREA:
        sys.exit(f"sin mapeo: fila {r['_fila']} {r['nivel_academico']}|{r['modalidad']}|{r['area_conocimiento']}")
    cnt[(U['slug'],'cargadas')]+=1; cnt[(U['slug'],'visibles' if pub else 'no_publicadas')]+=1
    filas.append(dict(r=r,U=U,s=s,sid=sid,pub=pub,vd=vd,vh=vh,dv=dv,du=du,
        motivo=None if pub else (r['estado_vigencia'] or 'no publicable'),
        pid=uid('programa',U['slug'],s,sede,r['modalidad']),oid=uid('oferta',U['slug'],s,sede,r['modalidad']),
        prid=uid('precio',U['slug'],s,sede,r['modalidad'])))
assert len(filas)==331 and sum(f['pub'] for f in filas)==291, (len(filas), sum(f['pub'] for f in filas))

COLS="""fila_excel int PRIMARY KEY, aliada_slug text NOT NULL, universidad_id uuid NOT NULL,
  sede_id uuid NOT NULL, sede_nombre text NOT NULL, programa_id uuid NOT NULL, oferta_id uuid NOT NULL,
  precio_id uuid NOT NULL, codigo_snies text NOT NULL, nombre_oficial text NOT NULL, nombre_corto text,
  nivel_academico text NOT NULL, nivel_codigo text NOT NULL, modalidad text NOT NULL, modalidad_codigo text NOT NULL,
  jornada text, area_conocimiento text, area_bd text, duracion_valor int, duracion_unidad text,
  numero_creditos int, titulo_otorgado text, descripcion text, nombre_oferta text NOT NULL,
  vigente_desde date, vigente_hasta date, precio numeric, moneda text, periodicidad text, concepto_cobro text,
  publicable boolean NOT NULL, motivo_no_publica text, url_fuente text, fuente_precio text, vencimiento_registro date,
  nivel_id uuid, modalidad_id uuid, jornada_id uuid, area_id uuid, periodo_id uuid"""
vals=[]
for f in filas:
    r=f['r'];U=f['U']
    vals.append("("+",".join([str(r['_fila']),q(U['slug']),q(uid('universidad',U['slug'])),q(f['sid']),q(r['sede']),q(f['pid']),q(f['oid']),q(f['prid']),q(f['s']),
      q(r['nombre_oficial']),q(r['nombre_corto']),q(r['nivel_academico']),q(NIVEL[r['nivel_academico']]),q(r['modalidad']),q(MODAL[r['modalidad']]),
      q(r['jornada']),q(r['area_conocimiento']),q(AREA[r['area_conocimiento']]),num(f['dv']),q(f['du']),num(r['numero_creditos']),
      q(r['titulo_otorgado']),q(r['descripcion']),q(r['nombre_corto'] or r['nombre_oficial']),
      q(f['vd']),q(f['vh']),(str(float(r['precio'])) if r['precio'] else 'NULL'),q(r['moneda'] or ('COP' if r['precio'] else None)),
      q(r['periodicidad']),q(r['concepto_cobro']),'true' if f['pub'] else 'false',q(f['motivo']),q(r['url_fuente']),
      q(r['fuente_precio_pdf'] or (r['url_fuente'] if r['precio'] else None)),q(r['snies_fecha_vencimiento_registro'])])+")")
INSERT_COLS="fila_excel,aliada_slug,universidad_id,sede_id,sede_nombre,programa_id,oferta_id,precio_id,codigo_snies,nombre_oficial,nombre_corto,nivel_academico,nivel_codigo,modalidad,modalidad_codigo,jornada,area_conocimiento,area_bd,duracion_valor,duracion_unidad,numero_creditos,titulo_otorgado,descripcion,nombre_oferta,vigente_desde,vigente_hasta,precio,moneda,periodicidad,concepto_cobro,publicable,motivo_no_publica,url_fuente,fuente_precio,vencimiento_registro"
STAGING=f"""  -- Bloque S1 · Tabla de trabajo (RLS activo y sin políticas = solo service role / editor SQL)
  CREATE TABLE IF NOT EXISTS public.carga_aliadas_20261019 (
  {COLS}
  );
  ALTER TABLE public.carga_aliadas_20261019 ENABLE ROW LEVEL SECURITY;
  COMMENT ON TABLE public.carga_aliadas_20261019 IS
    'Trabajo carga 4 aliadas 2026-10-19 (BD). Traza de ids y base del deshacer. No borrar.';
  -- Bloque S2 · Datos (idempotente: ON CONFLICT actualiza la fila de trabajo)
  INSERT INTO public.carga_aliadas_20261019 ({INSERT_COLS}) VALUES
""" + ",\n".join(vals) + """
  ON CONFLICT (fila_excel) DO UPDATE SET
    aliada_slug=EXCLUDED.aliada_slug, universidad_id=EXCLUDED.universidad_id, sede_id=EXCLUDED.sede_id,
    sede_nombre=EXCLUDED.sede_nombre, programa_id=EXCLUDED.programa_id, oferta_id=EXCLUDED.oferta_id,
    precio_id=EXCLUDED.precio_id, nivel_codigo=EXCLUDED.nivel_codigo, modalidad_codigo=EXCLUDED.modalidad_codigo,
    area_bd=EXCLUDED.area_bd, duracion_valor=EXCLUDED.duracion_valor, duracion_unidad=EXCLUDED.duracion_unidad,
    vigente_desde=EXCLUDED.vigente_desde, vigente_hasta=EXCLUDED.vigente_hasta,
    publicable=EXCLUDED.publicable, motivo_no_publica=EXCLUDED.motivo_no_publica;
"""
UNI_IDS="('6069f39d-6bd2-5991-b922-24e58ac7137a','53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998','79de384c-1c32-5c80-b5c0-70a12a7fa79d','031ff5d5-fc68-519c-88d7-bd37765715b1')"
assert uid('universidad','poli')=='6069f39d-6bd2-5991-b922-24e58ac7137a'
CIU_PER=uid('ciudad','pereira'); CIU_VAL=uid('ciudad','valledupar')
RESPALDO="""  -- Bloque R · Respaldo (foto previa por universidad) para comparar y deshacer
  CREATE TABLE IF NOT EXISTS public.carga_aliadas_20261019_respaldo AS
  SELECT now() AS tomado_en, u.id AS universidad_id, u.nombre_oficial, u.es_demo,
         count(o.id) AS ofertas_total,
         count(o.id) FILTER (WHERE o.activo AND o.estado_publicacion = 'publicado'
                             AND o.estado_validacion = 'validado' AND o.vigente_desde <= current_date
                             AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date)) AS ofertas_visibles
  FROM public.universidades u LEFT JOIN public.ofertas_academicas o ON o.universidad_id = u.id
  GROUP BY u.id, u.nombre_oficial, u.es_demo;
  ALTER TABLE public.carga_aliadas_20261019_respaldo ENABLE ROW LEVEL SECURITY;
"""
CARGA=f"""  -- Bloque C · Carga con controles (si uno falla, RAISE deshace TODO)
  DECLARE
    v_faltan text; v_pais uuid; v_ciudad_null boolean;
    v_bogota uuid; v_medellin uuid; v_pereira uuid; v_valledupar uuid;
    v_ciudades_creadas text := '';
    r record;
  BEGIN
    -- C.1 · La tabla de trabajo debe tener 331 filas (291 publicables)
    IF (SELECT count(*) FROM public.carga_aliadas_20261019) <> 331
       OR (SELECT count(*) FROM public.carga_aliadas_20261019 WHERE publicable) <> 291 THEN
      RAISE EXCEPTION 'Paso 1 incompleto: se esperaban 331 filas y 291 publicables.';
    END IF;
    -- C.2 · No debe existir otra universidad con el mismo nombre o slug (otro id)
    SELECT string_agg(u.nombre_oficial, ', ') INTO v_faltan FROM public.universidades u
     WHERE u.id NOT IN {UNI_IDS}
       AND (lower(u.slug) IN ('politecnico-grancolombiano','fundacion-universitaria-del-area-andina','unir-colombia','corporacion-universitaria-de-asturias')
            OR lower(translate(u.nombre_oficial,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) IN
               ('politecnico grancolombiano','fundacion universitaria del area andina',
                'fundacion universitaria internacional de la rioja (unir)','corporacion universitaria de asturias'));
    IF v_faltan IS NOT NULL THEN RAISE EXCEPTION 'Ya existe universidad con ese nombre/slug: %', v_faltan; END IF;
    -- C.3 · País Colombia
    SELECT id INTO v_pais FROM public.paises WHERE codigo_iso = 'COL' LIMIT 1;
    IF v_pais IS NULL THEN RAISE EXCEPTION 'No existe Colombia (COL) en public.paises.'; END IF;
    -- C.4 · Ciudades. Corrección DR-1: Pereira y Valledupar NO existían en prod; se crean
    --       (ids fijos, pais=Colombia, sin región) solo si faltan. Bogotá y Medellín ya existen.
    SELECT id INTO v_bogota FROM public.ciudades WHERE pais_id = v_pais AND lower(translate(nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) LIKE 'bogota%' ORDER BY nombre LIMIT 1;
    SELECT id INTO v_medellin FROM public.ciudades WHERE pais_id = v_pais AND lower(translate(nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) = 'medellin' LIMIT 1;
    SELECT id INTO v_pereira FROM public.ciudades WHERE pais_id = v_pais AND lower(translate(nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) = 'pereira' LIMIT 1;
    SELECT id INTO v_valledupar FROM public.ciudades WHERE pais_id = v_pais AND lower(translate(nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) = 'valledupar' LIMIT 1;
    IF v_pereira IS NULL THEN
      INSERT INTO public.ciudades (id, pais_id, nombre, activo) VALUES ('{CIU_PER}', v_pais, 'Pereira', true)
      ON CONFLICT (id) DO NOTHING;
      v_pereira := '{CIU_PER}'; v_ciudades_creadas := v_ciudades_creadas || 'Pereira ';
    END IF;
    IF v_valledupar IS NULL THEN
      INSERT INTO public.ciudades (id, pais_id, nombre, activo) VALUES ('{CIU_VAL}', v_pais, 'Valledupar', true)
      ON CONFLICT (id) DO NOTHING;
      v_valledupar := '{CIU_VAL}'; v_ciudades_creadas := v_ciudades_creadas || 'Valledupar ';
    END IF;
    IF v_bogota IS NULL OR v_medellin IS NULL THEN
      RAISE EXCEPTION 'Falta Bogotá o Medellín en public.ciudades (%, %).', v_bogota, v_medellin;
    END IF;
    SELECT NOT attnotnull INTO v_ciudad_null FROM pg_attribute
     WHERE attrelid = 'public.sedes'::regclass AND attname = 'ciudad_id';
    -- C.5 · Catálogos por CÓDIGO (DR-2, DR-3) y área por nombre BuscoEdu (DR-4)
    UPDATE public.carga_aliadas_20261019 c SET
      nivel_id     = (SELECT n.id FROM public.niveles_academicos n WHERE n.codigo = c.nivel_codigo),
      modalidad_id = (SELECT m.id FROM public.modalidades m WHERE m.codigo = c.modalidad_codigo),
      jornada_id   = (SELECT j.id FROM public.jornadas j WHERE j.codigo = lower(c.jornada)),
      area_id      = (SELECT a.id FROM public.areas_conocimiento a WHERE a.nombre = c.area_bd);
    SELECT string_agg(DISTINCT nivel_codigo, ', ') INTO v_faltan FROM public.carga_aliadas_20261019 WHERE nivel_id IS NULL;
    IF v_faltan IS NOT NULL THEN RAISE EXCEPTION 'Nivel sin equivalente: %', v_faltan; END IF;
    SELECT string_agg(DISTINCT modalidad_codigo, ', ') INTO v_faltan FROM public.carga_aliadas_20261019 WHERE modalidad_id IS NULL;
    IF v_faltan IS NOT NULL THEN RAISE EXCEPTION 'Modalidad sin equivalente: %', v_faltan; END IF;
    SELECT string_agg(DISTINCT jornada, ', ') INTO v_faltan FROM public.carga_aliadas_20261019 WHERE jornada IS NOT NULL AND jornada_id IS NULL;
    IF v_faltan IS NOT NULL THEN RAISE EXCEPTION 'Jornada sin equivalente: %', v_faltan; END IF;
    SELECT string_agg(DISTINCT area_bd, ', ') INTO v_faltan FROM public.carga_aliadas_20261019 WHERE area_bd IS NOT NULL AND area_id IS NULL;
    IF v_faltan IS NOT NULL THEN RAISE EXCEPTION 'Área sin equivalente: %', v_faltan; END IF;

    -- C.6 · Universidades (4): aliadas reales, no demo, publicadas y validadas (DR-6: estado_validacion explícito).
    --       DR-8: el trigger AFTER INSERT trg_universidad_crea_oportunidad inserta en oportunidades sin persona_id,
    --       que en prod es NOT NULL → cualquier INSERT en universidades falla hoy. Se desactiva SOLO durante este
    --       INSERT y se reactiva enseguida, dentro de la misma transacción (si algo falla, el rollback lo deja activo).
    --       Efecto: no se crean oportunidades tipo 'universidad' (igual que las 10 demo, que no tienen ninguna).
    ALTER TABLE public.universidades DISABLE TRIGGER trg_universidad_crea_oportunidad;
    INSERT INTO public.universidades
      (id, nombre_oficial, nombre_corto, sigla, slug, tipo_institucion, naturaleza, pais_id,
       pagina_web, estado_alianza, estado_validacion, estado_publicacion, es_demo, activo)
    VALUES
      ('6069f39d-6bd2-5991-b922-24e58ac7137a','Politécnico Grancolombiano','Poli',NULL,'politecnico-grancolombiano','institucion_universitaria','privada',v_pais,'https://www.poli.edu.co','aliada','validado','publicado',false,true),
      ('53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998','Fundación Universitaria del Área Andina','Areandina',NULL,'fundacion-universitaria-del-area-andina','institucion_universitaria','privada',v_pais,'https://www.areandina.edu.co','aliada','validado','publicado',false,true),
      ('79de384c-1c32-5c80-b5c0-70a12a7fa79d','Fundación Universitaria Internacional de La Rioja (UNIR)','UNIR','UNIR','unir-colombia','institucion_universitaria','privada',v_pais,'https://unir.edu.co','aliada','validado','publicado',false,true),
      ('031ff5d5-fc68-519c-88d7-bd37765715b1','Corporación Universitaria de Asturias','Asturias',NULL,'corporacion-universitaria-de-asturias','institucion_universitaria','privada',v_pais,'https://uniasturias.edu.co','aliada','validado','publicado',false,true)
    ON CONFLICT (id) DO NOTHING;
    ALTER TABLE public.universidades ENABLE TRIGGER trg_universidad_crea_oportunidad;
    IF (SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_universidad_crea_oportunidad'
          AND tgrelid = 'public.universidades'::regclass) <> 'O' THEN
      RAISE EXCEPTION 'Control falló: el trigger trg_universidad_crea_oportunidad no quedó activo.';
    END IF;

    -- C.7 · Sedes (9). Sede = lugar donde se dicta la oferta.
    INSERT INTO public.sedes (id, universidad_id, nombre, slug, tipo, pais_id, ciudad_id, estado_validacion, estado_publicacion, es_demo, activo)
    SELECT DISTINCT ON (c.sede_id) c.sede_id, c.universidad_id,
           CASE c.sede_nombre WHEN 'Bogotá, D.C.' THEN 'Bogotá' ELSE c.sede_nombre END,
           c.aliada_slug || '-' || CASE c.sede_nombre WHEN 'Bogotá, D.C.' THEN 'bogota' WHEN 'Medellín' THEN 'medellin' ELSE lower(c.sede_nombre) END,
           CASE WHEN c.sede_nombre = 'Virtual' THEN 'virtual' WHEN c.sede_nombre = 'Bogotá, D.C.' THEN 'principal'
                WHEN c.aliada_slug = 'areandina' AND c.sede_nombre = 'Pereira' THEN 'seccional' ELSE NULL END,
           v_pais,
           CASE c.sede_nombre WHEN 'Bogotá, D.C.' THEN v_bogota WHEN 'Medellín' THEN v_medellin
                WHEN 'Pereira' THEN v_pereira WHEN 'Valledupar' THEN v_valledupar
                ELSE CASE WHEN v_ciudad_null THEN NULL ELSE v_bogota END END,
           'validado', 'publicado', false, true
    FROM public.carga_aliadas_20261019 c ORDER BY c.sede_id
    ON CONFLICT (id) DO NOTHING;

    -- C.8 · Período académico por aliada ("por confirmar"; no se inventan fechas)
    INSERT INTO public.periodos_academicos (id, universidad_id, nombre, notas, estado, activo) VALUES
      ('38708f86-cbfa-533e-9495-781896093490','6069f39d-6bd2-5991-b922-24e58ac7137a','Por confirmar · catálogo 2026','Calendario no publicado por la IES (carga 2026-10-19).','activo',true),
      ('79c4bd75-ffcc-539e-ba92-aa2316a7a4ea','53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998','Por confirmar · catálogo 2026','Calendario no publicado por la IES (carga 2026-10-19).','activo',true),
      ('7043546f-ea31-5515-be45-c057a9c98f6b','79de384c-1c32-5c80-b5c0-70a12a7fa79d','Por confirmar · catálogo 2026','Calendario no publicado por la IES (carga 2026-10-19).','activo',true),
      ('90423ea2-4f1b-5a84-93d8-112a35b27a6c','031ff5d5-fc68-519c-88d7-bd37765715b1','Por confirmar · catálogo 2026','Calendario no publicado por la IES (carga 2026-10-19).','activo',true)
    ON CONFLICT (id) DO NOTHING;
    UPDATE public.carga_aliadas_20261019 SET periodo_id = CASE aliada_slug
      WHEN 'poli' THEN '38708f86-cbfa-533e-9495-781896093490'::uuid
      WHEN 'areandina' THEN '79c4bd75-ffcc-539e-ba92-aa2316a7a4ea'::uuid
      WHEN 'unir' THEN '7043546f-ea31-5515-be45-c057a9c98f6b'::uuid
      ELSE '90423ea2-4f1b-5a84-93d8-112a35b27a6c'::uuid END;

    -- C.9 · Programas (331). Publicable → validado + publicado; resto → pendiente + creado_internamente.
    INSERT INTO public.programas_academicos
      (id, universidad_id, sede_id, nombre_oficial, nombre_corto, codigo_snies, nivel_academico_id,
       modalidad_id, jornada_id, area_conocimiento_id, duracion_valor, duracion_unidad, numero_creditos,
       titulo_otorgado, descripcion, fuente, estado_validacion, estado_publicacion, es_demo, activo)
    SELECT c.programa_id, c.universidad_id, c.sede_id, c.nombre_oficial, c.nombre_corto, c.codigo_snies,
           c.nivel_id, c.modalidad_id, c.jornada_id, c.area_id, c.duracion_valor, c.duracion_unidad,
           c.numero_creditos, c.titulo_otorgado, c.descripcion, 'carga_aliadas_20261019',
           CASE WHEN c.publicable THEN 'validado' ELSE 'pendiente' END,
           CASE WHEN c.publicable THEN 'publicado' ELSE 'creado_internamente' END, false, true
    FROM public.carga_aliadas_20261019 c
    ON CONFLICT (id) DO NOTHING;

    -- C.10 · Ofertas (331). desde = fecha publicada o de carga; hasta = min(vencimiento registro, 2026-12-31).
    --        No publicables: sin vigente_desde → nunca salen.
    INSERT INTO public.ofertas_academicas
      (id, programa_id, universidad_id, sede_id, periodo_academico_id, nombre_oferta, fuente,
       vigente_desde, vigente_hasta, estado_validacion, estado_publicacion, es_demo, activo)
    SELECT c.oferta_id, c.programa_id, c.universidad_id, c.sede_id, c.periodo_id, c.nombre_oferta, 'carga_aliadas_20261019',
           c.vigente_desde, c.vigente_hasta,
           CASE WHEN c.publicable THEN 'validado' ELSE 'pendiente' END,
           CASE WHEN c.publicable THEN 'publicado' ELSE 'creado_internamente' END, false, true
    FROM public.carga_aliadas_20261019 c
    ON CONFLICT (id) DO NOTHING;

    -- C.11 · Precios. DR-7: concepto_cobro es NOT NULL en prod → si falta va 'otro' + MARCA + pendiente.
    INSERT INTO public.precios_oferta
      (id, oferta_id, periodo_academico_id, tipo_valor, concepto_cobro, valor, moneda, periodicidad,
       descripcion_condiciones, fuente, estado_validacion, vigente_desde, vigente_hasta, es_precio_activo)
    SELECT c.precio_id, c.oferta_id, c.periodo_id, 'universidad', coalesce(c.concepto_cobro,'otro'), c.precio,
           coalesce(c.moneda,'COP'), c.periodicidad,
           CASE WHEN c.periodicidad IS NULL OR c.concepto_cobro IS NULL
                THEN 'MARCA: ' || concat_ws('; ',
                       CASE WHEN c.periodicidad IS NULL THEN 'periodicidad no publicada por la institución' END,
                       CASE WHEN c.concepto_cobro IS NULL THEN 'concepto de cobro no publicado (se cargó como otro)' END)
                     || '; confirmar antes de mostrar.' END,
           c.fuente_precio,
           CASE WHEN c.periodicidad IS NULL OR c.concepto_cobro IS NULL THEN 'pendiente' ELSE 'validado' END,
           c.vigente_desde, c.vigente_hasta, true
    FROM public.carga_aliadas_20261019 c WHERE c.precio IS NOT NULL
    ON CONFLICT (id) DO NOTHING;

    -- C.12 · Auditoría de la carga (tabla existente cargas_catalogo)
    INSERT INTO public.cargas_catalogo (id, tipo, nombre_archivo, estado, total_filas, filas_creadas,
      filas_omitidas, resumen, confirmado_en, finalizado_en)
    VALUES ('a49db869-1b7b-541e-ac4e-ba0c9ed084a7','ofertas','programas-aliadas-2026-10-05.xlsx (SQL BD 2026-10-19)',
      'completado', 331, 331, 3,
      jsonb_build_object('aliadas', jsonb_build_array('poli','areandina','unir','asturias'), 'publicables', 291,
        'no_publicadas', 40, 'excluidas', jsonb_build_array('52058','109936','111217'), 'sergio_arboleda', 'standby',
        'ciudades_creadas', trim(v_ciudades_creadas)),
      now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- C.13 · Controles finales con el MISMO filtro de obtenerOfertas
    FOR r IN
      SELECT x.slug, x.esperado,
             (SELECT count(*) FROM public.ofertas_academicas o
               WHERE o.universidad_id = x.id AND o.activo AND o.estado_publicacion = 'publicado'
                 AND o.estado_validacion = 'validado' AND o.vigente_desde <= current_date
                 AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date)) AS real
      FROM (VALUES ('poli','6069f39d-6bd2-5991-b922-24e58ac7137a'::uuid,101),
                   ('areandina','53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998'::uuid,94),
                   ('unir','79de384c-1c32-5c80-b5c0-70a12a7fa79d'::uuid,46),
                   ('asturias','031ff5d5-fc68-519c-88d7-bd37765715b1'::uuid,50)) AS x(slug,id,esperado)
    LOOP
      IF r.real <> r.esperado THEN
        RAISE EXCEPTION 'Control falló en %: visibles % ≠ esperado %', r.slug, r.real, r.esperado;
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.programas_academicos p JOIN public.universidades u ON u.id = p.universidad_id
               WHERE u.id IN {UNI_IDS} AND p.codigo_snies IN ('109936','111217','52058')) THEN
      RAISE EXCEPTION 'Control falló: hay un código excluido (109936/111217/52058) cargado.';
    END IF;
    IF (SELECT count(*) FROM public.programas_academicos WHERE id IN (SELECT programa_id FROM public.carga_aliadas_20261019)) <> 331
       OR (SELECT count(*) FROM public.ofertas_academicas WHERE id IN (SELECT oferta_id FROM public.carga_aliadas_20261019)) <> 331
       OR (SELECT count(*) FROM public.sedes WHERE id IN (SELECT sede_id FROM public.carga_aliadas_20261019)) <> 9 THEN
      RAISE EXCEPTION 'Control falló: programas/ofertas/sedes no suman 331/331/9.';
    END IF;
    PERFORM set_config('carga.ciudades_creadas', trim(v_ciudades_creadas), true);
  END;
"""
CONTEO="""(SELECT string_agg(x, ' ') FROM (
   SELECT u.nombre_corto || '=' || count(o.id) FILTER (WHERE o.activo AND o.estado_publicacion='publicado'
     AND o.estado_validacion='validado' AND o.vigente_desde <= current_date
     AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date)) || '/' || count(o.id) AS x
   FROM public.universidades u LEFT JOIN public.ofertas_academicas o ON o.universidad_id = u.id
   WHERE NOT u.es_demo GROUP BY u.nombre_corto ORDER BY u.nombre_corto) z)"""
HDR=lambda t,d: f"""-- =====================================================================
-- 20261019 · Carga aliadas · {t}
-- OK de Jhon 2026-10-19 16:18 (Europe/Madrid) vía Orquestador. Prod khnrnnoxyzuulagemfbh.
-- Generado por scripts/bd/gen_carga_aliadas_20261019.py desde
--   research/programas-aliadas/programas-aliadas-2026-10-05.xlsx (hoja Consolidado, PASS paso 4 v2).
-- {d}
-- =====================================================================
"""
open(os.path.join(OUT,'20261019_carga_aliadas_3_paso1_staging.sql'),'w').write(
  HDR('Paso 3/5 · Staging (331 filas)','Solo crea/llena public.carga_aliadas_20261019. No toca el catálogo. Idempotente.')+
  "BEGIN;\nDO $staging$\nBEGIN\n"+STAGING+"END\n$staging$;\nCOMMIT;\n\n-- Verificación: poli 115/101 · areandina 118/94 · unir 46/46 · asturias 52/50 (filas/publicables)\n"
  "SELECT aliada_slug, count(*) AS filas, count(*) FILTER (WHERE publicable) AS publicables\nFROM public.carga_aliadas_20261019 GROUP BY aliada_slug ORDER BY aliada_slug;\n")
open(os.path.join(OUT,'20261019_carga_aliadas_4_paso2_carga.sql'),'w').write(
  HDR('Paso 4/5 · Carga en catálogo (1 transacción)','Requiere el paso 3. Solo INSERT con ids fijos + ON CONFLICT DO NOTHING (idempotente). Las demo no se tocan aquí.')+
  "BEGIN;\nDO $carga$\nBEGIN\n"+RESPALDO+CARGA+"  RAISE NOTICE 'Carga OK: %', "+CONTEO+";\nEND\n$carga$;\nCOMMIT;\n\n"
  "-- Verificación independiente (solo lectura): visibles/total por aliada real\nSELECT "+CONTEO+" AS visibles_por_aliada;\n")
open(os.path.join(OUT,'20261019_carga_aliadas_2_dryrun.sql'),'w').write(
  HDR('Paso 2/5 · Dry-run (SIEMPRE revierte)','Ejecuta staging + carga completos y aborta con RAISE: no deja nada. El mensaje trae los conteos.')+
  "DO $dry$\nBEGIN\n"+STAGING+RESPALDO+CARGA+
  "  PERFORM set_config('carga.visibles', "+CONTEO+", true);\n"
  "  PERFORM set_config('carga.otros', concat_ws(' ',\n"
  "    'staging=' || (SELECT count(*) FROM public.carga_aliadas_20261019),\n"
  "    'univ=' || (SELECT count(*) FROM public.universidades WHERE id IN "+UNI_IDS+"),\n"
  "    'sedes=' || (SELECT count(*) FROM public.sedes WHERE id IN (SELECT sede_id FROM public.carga_aliadas_20261019)),\n"
  "    'precios=' || (SELECT count(*) FROM public.precios_oferta WHERE id IN (SELECT precio_id FROM public.carga_aliadas_20261019)),\n"
  "    'precios_marca=' || (SELECT count(*) FROM public.precios_oferta WHERE id IN (SELECT precio_id FROM public.carga_aliadas_20261019) AND descripcion_condiciones LIKE 'MARCA:%'),\n"
  "    'opp_trigger=' || (SELECT count(*) FROM public.oportunidades WHERE universidad_id IN "+UNI_IDS+"),\n"
  "    'excluidas_visibles=' || (SELECT count(*) FROM public.programas_academicos WHERE codigo_snies IN ('109936','111217') AND universidad_id IN "+UNI_IDS+"),\n"
  "    'sergio=' || (SELECT count(*) FROM public.universidades WHERE nombre_oficial ILIKE '%sergio arboleda%'),\n"
  "    'area_null=' || (SELECT count(*) FROM public.programas_academicos WHERE id IN (SELECT programa_id FROM public.carga_aliadas_20261019) AND area_conocimiento_id IS NULL),\n"
  "    'vh_max=' || (SELECT max(vigente_hasta) FROM public.ofertas_academicas WHERE id IN (SELECT oferta_id FROM public.carga_aliadas_20261019)),\n"
  "    'vh_min_visible=' || (SELECT min(vigente_hasta) FROM public.ofertas_academicas WHERE id IN (SELECT oferta_id FROM public.carga_aliadas_20261019) AND estado_publicacion='publicado'),\n"
  "    'ciudades_creadas=' || current_setting('carga.ciudades_creadas', true),\n"
  "    'demo_visibles=' || (SELECT count(*) FROM public.ofertas_academicas o WHERE o.es_demo AND o.activo AND o.estado_publicacion='publicado' AND o.estado_validacion='validado' AND o.vigente_desde <= current_date AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date))\n"
  "  ), true);\n"
  "  RAISE EXCEPTION 'DRYRUN_REVERTIDO visibles[%] %', current_setting('carga.visibles'), current_setting('carga.otros');\nEND\n$dry$;\n")
print(dict(cnt)); print('pereira',CIU_PER,'valledupar',CIU_VAL)
