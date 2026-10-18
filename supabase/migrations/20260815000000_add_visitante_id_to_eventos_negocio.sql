-- Migración: Agregar columna visitante_id a eventos_negocio para tracking de visitantes anónimos
-- Fecha: 2026-08-15
-- Descripción: Permite registrar eventos de negocio asociados a visitantes anónimos (no registrados)

-- Agregar columna visitante_id si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'eventos_negocio' 
        AND column_name = 'visitante_id'
    ) THEN
        ALTER TABLE eventos_negocio 
        ADD COLUMN visitante_id UUID;
        
        -- Agregar foreign key a la tabla visitantes
        ALTER TABLE eventos_negocio
        ADD CONSTRAINT fk_eventos_negocio_visitante
        FOREIGN KEY (visitante_id) REFERENCES visitantes(id)
        ON DELETE SET NULL;
        
        -- Crear índice para mejorar consultas por visitante
        CREATE INDEX IF NOT EXISTS idx_eventos_negocio_visitante_id
        ON eventos_negocio(visitante_id);
        
        -- Comentario de documentación
        COMMENT ON COLUMN eventos_negocio.visitante_id IS 
        'ID del visitante anónimo asociado al evento. Nullable para permitir eventos de personas registradas sin visitante previo.';
    END IF;
END $$;
