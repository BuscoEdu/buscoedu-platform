# Generador del SQL de carga de 4 aliadas (Poli, Areandina, UNIR, Asturias) — BD BuscoEdu 2026-10-17
import openpyxl, uuid, json, datetime, collections
SRC='/workspace/buscoedu-knowledge/research/programas-aliadas/programas-aliadas-2026-10-05.xlsx'
HOY='2026-10-17'; TOPE='2026-12-31'
EXCLUIR={'52058','109936','111217'}
# uuid deterministas (uuid5) => el mismo Excel siempre produce los mismos ids (idempotente)
NS=uuid.UUID('6f1c2a7e-0b1d-4c55-9a51-20261017a11a'.replace('a11a','0a11'))
def uid(*k): return str(uuid.uuid5(NS,'|'.join(map(str,k))))
UNIS={
 'Politécnico Grancolombiano':dict(slug='poli',slug_u='politecnico-grancolombiano',corto='Poli',sigla=None,web='https://www.poli.edu.co',snies='2725',tipo='institucion_universitaria',logo='poli/logo.svg'),
 'Fundación Universitaria del Área Andina':dict(slug='areandina',slug_u='fundacion-universitaria-del-area-andina',corto='Areandina',sigla=None,web='https://www.areandina.edu.co',snies='2728',tipo='institucion_universitaria',logo='areandina/logo.svg'),
 'Fundación Universitaria Internacional de La Rioja (UNIR)':dict(slug='unir',slug_u='unir-colombia',corto='UNIR',sigla='UNIR',web='https://unir.edu.co',snies='9926',tipo='institucion_universitaria',logo='unir/logo.svg'),
 'Corporación Universitaria de Asturias':dict(slug='asturias',slug_u='corporacion-universitaria-de-asturias',corto='Asturias',sigla=None,web='https://uniasturias.edu.co',snies='9913',tipo='institucion_universitaria',logo='asturias/logo-web.png'),
}
wb=openpyxl.load_workbook(SRC,read_only=True,data_only=True)
rows=list(wb['Consolidado'].iter_rows(values_only=True)); h=rows[0]
R=[dict(zip(h,r),_fila=i+2) for i,r in enumerate(rows[1:])]
def q(v):
    if v is None or (isinstance(v,str) and v.strip()==''): return 'NULL'
    return "'"+str(v).replace("'","''")+"'"
def num(v):
    try: return str(float(v)) if v not in (None,'') else 'NULL'
    except: return 'NULL'
filas=[]; cnt=collections.Counter(); sedes={}
for r in R:
    u=r['universidad']
    if u not in UNIS: continue
    s=str(r['codigo_snies'])
    if s in EXCLUIR: cnt[(u,'excluida')]+=1; continue
    U=UNIS[u]; venc=r['snies_fecha_vencimiento_registro']
    pub = r['publicable']=='sí' and (venc is None or str(venc)>=HOY)
    sede=r['sede']; sid=uid('sede',U['slug'],sede); sedes[sid]=(U['slug'],sede)
    vd = (r['vigente_desde'] or HOY) if pub else None
    vh = (min(str(venc),TOPE) if venc else TOPE) if pub else (str(venc) if venc else None)
    motivo = None if pub else (r['estado_vigencia'] or 'no publicable')
    cnt[(u,'cargadas')]+=1; cnt[(u,'visibles' if pub else 'no_publicadas')]+=1
    if r['precio']: cnt[(u,'precio')]+=1
    if r['precio'] and not r['periodicidad']: cnt[(u,'precio_sin_periodicidad')]+=1
    filas.append(dict(r=r,U=U,s=s,sid=sid,pub=pub,vd=vd,vh=vh,motivo=motivo,
        pid=uid('programa',U['slug'],s,sede,r['modalidad']),oid=uid('oferta',U['slug'],s,sede,r['modalidad']),
        prid=uid('precio',U['slug'],s,sede,r['modalidad'])))
out=[]
out.append(f"""-- =====================================================================
-- Paso 1/2 · Staging de la carga de 4 aliadas (Poli, Areandina, UNIR, Asturias)
-- Fecha: 2026-10-17 · Quién: Base de datos BuscoEdu (OK Jhon 17/10 12:28 vía Orquestador)
-- Fuente: research/programas-aliadas/programas-aliadas-2026-10-05.xlsx (hoja Consolidado)
--         + paso4-bd-validacion-v2.md (PASS)
-- Qué hace: crea una tabla de trabajo (no TEMP: el editor de Supabase corta
--   la sesión entre ejecuciones) con las {len(filas)} filas a cargar y los ids
--   ya calculados. NO toca tablas del catálogo. Se puede correr varias veces.
-- Exclusiones: Sergio Arboleda (standby) y Areandina 52058, 109936, 111217.
-- =====================================================================
BEGIN;

-- Bloque 1 · Tabla de trabajo (RLS activo y sin políticas = solo service role / editor SQL)
CREATE TABLE IF NOT EXISTS public.carga_aliadas_20261017 (
  fila_excel        int PRIMARY KEY,           -- fila de la hoja Consolidado
  aliada_slug       text NOT NULL,             -- poli | areandina | unir | asturias
  universidad_id    uuid NOT NULL,
  sede_id           uuid NOT NULL,
  sede_nombre       text NOT NULL,             -- sede = lugar de la oferta
  programa_id       uuid NOT NULL,
  oferta_id         uuid NOT NULL,
  precio_id         uuid NOT NULL,
  codigo_snies      text NOT NULL,
  nombre_oficial    text NOT NULL,
  nombre_corto      text,
  nivel_academico   text NOT NULL,
  modalidad         text NOT NULL,
  jornada           text,
  area_conocimiento text,
  duracion_valor    numeric,
  duracion_unidad   text,
  numero_creditos   numeric,
  titulo_otorgado   text,
  descripcion       text,
  nombre_oferta     text NOT NULL,
  vigente_desde     date,
  vigente_hasta     date,
  precio            numeric,
  moneda            text,
  periodicidad      text,
  concepto_cobro    text,
  publicable        boolean NOT NULL,          -- true = se publica y valida
  motivo_no_publica text,
  url_fuente        text,
  fuente_precio     text,
  vencimiento_registro date
);
ALTER TABLE public.carga_aliadas_20261017 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.carga_aliadas_20261017 IS
  'Trabajo carga 4 aliadas 2026-10-17 (BD). Traza y base para deshacer. No borrar.';

-- Bloque 2 · Datos (ON CONFLICT = idempotente; recalcula si se vuelve a correr)
INSERT INTO public.carga_aliadas_20261017 VALUES""")
vals=[]
for f in filas:
    r=f['r'];U=f['U']
    nombre_oferta=r['nombre_corto'] or r['nombre_oficial']
    uid_u=uid('universidad',U['slug'])
    vals.append("("+",".join([str(r['_fila']),q(U['slug']),q(uid_u),q(f['sid']),q(r['sede']),q(f['pid']),q(f['oid']),q(f['prid']),q(f['s']),
      q(r['nombre_oficial']),q(r['nombre_corto']),q(r['nivel_academico']),q(r['modalidad']),q(r['jornada']),q(r['area_conocimiento']),
      num(r['duracion_valor']),q(r['duracion_unidad']),num(r['numero_creditos']),q(r['titulo_otorgado']),q(r['descripcion']),q(nombre_oferta),
      q(f['vd']),q(f['vh']),num(r['precio']),q(r['moneda'] or ('COP' if r['precio'] else None)),q(r['periodicidad']),q(r['concepto_cobro']),
      'true' if f['pub'] else 'false',q(f['motivo']),q(r['url_fuente']),q(r['fuente_precio_pdf'] or (r['url_fuente'] if r['precio'] else None)),
      q(r['snies_fecha_vencimiento_registro'])])+")")
out.append(",\n".join(vals))
out.append("""ON CONFLICT (fila_excel) DO UPDATE SET
  aliada_slug=EXCLUDED.aliada_slug, universidad_id=EXCLUDED.universidad_id, sede_id=EXCLUDED.sede_id,
  sede_nombre=EXCLUDED.sede_nombre, programa_id=EXCLUDED.programa_id, oferta_id=EXCLUDED.oferta_id,
  precio_id=EXCLUDED.precio_id, vigente_desde=EXCLUDED.vigente_desde, vigente_hasta=EXCLUDED.vigente_hasta,
  publicable=EXCLUDED.publicable, motivo_no_publica=EXCLUDED.motivo_no_publica;

-- Bloque 3 · Control: debe dar 331 filas = 291 publicables + 40 no publicadas
SELECT aliada_slug, count(*) AS filas, count(*) FILTER (WHERE publicable) AS publicables,
       count(*) FILTER (WHERE NOT publicable) AS no_publicadas
FROM public.carga_aliadas_20261017 GROUP BY aliada_slug ORDER BY aliada_slug;

COMMIT;
""")
open('/workspace/carga-aliadas/paso1.sql','w').write("\n".join(out))
meta=dict(unis={U['slug']:dict(id=uid('universidad',U['slug']),nombre=n,**U) for n,U in UNIS.items()},
  sedes={k:v for k,v in sedes.items()}, cnt={f"{a}|{b}":v for (a,b),v in cnt.items()}, total=len(filas), pub=sum(f['pub'] for f in filas))
json.dump(meta,open('/workspace/carga-aliadas/meta.json','w'),ensure_ascii=False,indent=1)
print(json.dumps(meta,ensure_ascii=False,indent=1))
