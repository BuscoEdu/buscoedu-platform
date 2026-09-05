-- Auditoría no destructiva de la arquitectura IA de BuscoEdu.
-- No crea, modifica ni elimina tablas, funciones, datos o políticas.
-- Ejecutar en Supabase para comprobar que la configuración modular está disponible.

WITH requeridas(nombre) AS (
  VALUES
    ('agentes_ia'),
    ('proveedores_ia'),
    ('despliegues_ia'),
    ('versiones_agente_ia'),
    ('componentes_contexto_ia'),
    ('versiones_agente_contextos'),
    ('canales_ia'),
    ('configuraciones_agente_canal'),
    ('herramientas_ia'),
    ('agente_herramientas'),
    ('fuentes_contexto_ia'),
    ('agente_fuentes_contexto'),
    ('pruebas_agente_ia'),
    ('ejecuciones_agente_ia'),
    ('conversaciones'),
    ('mensajes_conversacion'),
    ('hechos_extraidos_naia')
)
SELECT
  r.nombre AS tabla,
  CASE WHEN c.table_name IS NULL THEN 'FALTA' ELSE 'OK' END AS estado
FROM requeridas r
LEFT JOIN information_schema.tables c
  ON c.table_schema = 'public'
 AND c.table_name = r.nombre
ORDER BY r.nombre;

-- Comprueba que el agente principal y los canales configurados existan.
SELECT
  a.codigo AS agente,
  a.estado AS estado_agente,
  a.version_activa_id,
  c.codigo AS canal,
  c.activo AS canal_activo
FROM public.agentes_ia a
LEFT JOIN public.canales_ia c ON c.agente_predeterminado_id = a.id
WHERE a.codigo = 'naia_asesora_educativa'
ORDER BY c.codigo;

-- Detecta versiones publicadas sin despliegue explícito en el snapshot.
SELECT
  a.codigo AS agente,
  v.id AS version_id,
  v.estado,
  v.configuracion_snapshot
FROM public.agentes_ia a
JOIN public.versiones_agente_ia v ON v.id = a.version_activa_id
WHERE a.codigo = 'naia_asesora_educativa'
  AND v.estado = 'publicada'
  AND COALESCE(v.configuracion_snapshot ->> 'despliegue_id', '') = '';

