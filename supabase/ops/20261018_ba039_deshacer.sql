-- =====================================================
-- DESHACER 20261018120000_ba039_voz_naia_componentes
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18 · E1 (aplicación en prod)
-- Qué hace: apaga (sin borrar) los 3 componentes de voz/contrato de NaIA y sus
--   vínculos con la versión activa, y saca la versión del historial.
-- Para qué: volver al comportamiento previo. Con los componentes inactivos el runtime
--   usa la voz desde código (lib/agentes/vozNaia.ts), que es el MISMO texto, y deja el
--   aviso "[BA-039 voz] ... voz_desde_codigo" en el log.
-- Sin DELETE de datos: solo UPDATE activo/estado. (El historial de migraciones es
--   metadato, igual que en los demás deshaceres de E1.)
-- ⚠ Reaplicar 120000 después de esto NO reactiva los componentes (su INSERT es
--   ON CONFLICT DO NOTHING): para reactivar, correr el Bloque 4 comentado.
-- No se ejecuta solo; correr a mano con OK de Jhon.
-- =====================================================
BEGIN;

-- Bloque 1: apagar los vínculos con las versiones del agente (no se borran).
UPDATE public.versiones_agente_contextos vac
SET activo = false
FROM public.componentes_contexto_ia c
WHERE vac.componente_contexto_id = c.id
  AND c.codigo IN ('voz_naia', 'contrato_salida_naia', 'contrato_salida_naia_whatsapp')
  AND vac.activo;

-- Bloque 2: apagar los componentes (no se borran; quedan para auditoría).
UPDATE public.componentes_contexto_ia
SET activo = false, estado = 'inactivo', actualizado_en = now()
WHERE codigo IN ('voz_naia', 'contrato_salida_naia', 'contrato_salida_naia_whatsapp')
  AND (activo OR estado <> 'inactivo');

-- Bloque 3: sacar la versión del historial.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261018120000';

COMMIT;

-- Bloque 4 (opcional, comentado): reactivar si se quiere volver a usar la voz desde BD.
-- BEGIN;
-- UPDATE public.componentes_contexto_ia SET activo = true, estado = 'activo', actualizado_en = now()
-- WHERE codigo IN ('voz_naia', 'contrato_salida_naia', 'contrato_salida_naia_whatsapp');
-- UPDATE public.versiones_agente_contextos vac SET activo = true
-- FROM public.componentes_contexto_ia c
-- WHERE vac.componente_contexto_id = c.id
--   AND c.codigo IN ('voz_naia', 'contrato_salida_naia', 'contrato_salida_naia_whatsapp');
-- COMMIT;
