const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const EXPECTED_TABLES = [
  // MÓDULO GEOGRAFÍA
  'paises',
  'regiones',
  'ciudades',

  // MÓDULO NIVELES ACADÉMICOS
  'niveles_academicos',
  'homologaciones_nivel_academico',

  // MÓDULO INSTITUCIONAL
  'universidades',
  'imagenes_universidad',
  'sedes',
  'imagenes_sede',

  // MÓDULO CATÁLOGO EDUCATIVO
  'modalidades',
  'areas_conocimiento',
  'jornadas',
  'programas_academicos',
  'requisitos_acceso_programa',

  // MÓDULO OFERTAS Y PRECIOS
  'tipos_beneficio',
  'ofertas_academicas',
  'beneficios_oferta',
  'requisitos_oferta_academica',
  'precios_oferta',

  // MÓDULO PERIODOS
  'periodos_academicos',
  'periodos_comerciales',

  // MÓDULO PERSONAS
  'visitantes',
  'personas',
  'preferencias_educativas_persona',
  'perfil_progresivo_persona',

  // MÓDULO CONSENTIMIENTOS
  'tipos_consentimiento',
  'consentimientos_persona',

  // MÓDULO CRM
  'etapas_embudo',
  'subestados_oportunidad',
  'oportunidades',
  'historial_etapas_oportunidad',
  'historial_scoring_oportunidad',
  'asignaciones_oportunidad',
  'tareas_crm',
  'notas_crm',

  // MÓDULO CONVERSACIONES
  'conversaciones',
  'mensajes_conversacion',
  'hechos_extraidos_naia',
  'escalamientos_conversacion',

  // MÓDULO APLICACIONES
  'aplicaciones',
  'propuestas_comerciales',
  'versiones_propuesta_comercial',

  // MÓDULO TRANSFERENCIAS
  'transferencias_universidad',

  // MÓDULO USUARIOS INTERNOS
  'roles',
  'usuarios_internos',

  // MÓDULO PANEL B2B
  'usuarios_universidad',
  'permisos_universidad',

  // MÓDULO AUDITORÍA
  'auditoria_eventos',
  'eventos_negocio',

  // MÓDULO COMUNICACIONES
  'comunicaciones_transaccionales',
  'webhooks_recibidos',

  // MÓDULO GOBIERNO DE PUBLICACIÓN
  'flujos_revision_contenido',
  'historial_revision_contenido'
];

function loadEnvLocalIfExists() {
  const envPath = path.join(process.cwd(), '.env.local');

  if (!fs.existsSync(envPath)) {
    console.log('ℹ️  .env.local no existe. Se usarán variables de entorno del sistema.');
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  let loaded = 0;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
      loaded += 1;
    }
  }

  console.log(`✅ Variables cargadas desde .env.local: ${loaded}`);
}

function printTableList(prefix, tables) {
  if (tables.length === 0) {
    console.log(`${prefix} (ninguna)`);
    return;
  }

  for (const table of tables) {
    console.log(`${prefix} ${table}`);
  }
}

async function runAudit() {
  loadEnvLocalIfExists();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase
    .schema('information_schema')
    .from('tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .order('table_name', { ascending: true });

  if (error) {
    throw new Error(`Error consultando information_schema.tables: ${error.message}`);
  }

  const existingTables = (data || []).map((row) => row.table_name).filter(Boolean);
  const existingSet = new Set(existingTables);

  const expectedSorted = [...EXPECTED_TABLES].sort();
  const present = expectedSorted.filter((table) => existingSet.has(table));
  const missing = expectedSorted.filter((table) => !existingSet.has(table));
  const extra = existingTables.filter((table) => !EXPECTED_TABLES.includes(table));

  console.log('\n================ REPORTE DE AUDITORÍA SUPABASE ================');
  console.log(`Fecha/Hora: ${new Date().toISOString()}`);
  console.log(`Tablas esperadas (schema funcional): ${EXPECTED_TABLES.length}`);
  console.log(`Tablas encontradas en public: ${existingTables.length}`);
  console.log(`Coinciden con esperadas: ${present.length}`);
  console.log(`Faltantes: ${missing.length}`);
  console.log(`Extras (no incluidas en lista esperada): ${extra.length}`);

  console.log('\n✅ TABLAS QUE SÍ EXISTEN');
  printTableList('✅', present);

  console.log('\n❌ TABLAS QUE NO EXISTEN Y DEBEN CREARSE');
  printTableList('❌', missing);

  console.log('\n📦 TABLAS EXTRA EN PUBLIC (si aplica)');
  printTableList('📦', extra.sort());

  console.log('\n📊 RESUMEN FINAL');
  console.log(`- Esperadas: ${EXPECTED_TABLES.length}`);
  console.log(`- Encontradas: ${existingTables.length}`);
  console.log(`- Existentes (de esperadas): ${present.length}`);
  console.log(`- Faltantes: ${missing.length}`);
  console.log('===============================================================\n');
}

runAudit().catch((err) => {
  console.error('\n❌ ERROR EN AUDITORÍA');
  console.error(err.message || err);
  process.exit(1);
});
