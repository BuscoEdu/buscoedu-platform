-- =====================================================
-- Deshacer BA-005 · índice del orden estable de ofertas
-- Autor: Backend BuscoEdu (bot) · 2026-10-18
-- NO APLICADA – requiere OK de Jhon y plan de BD (igual que la migración que revierte:
-- supabase/migrations_pendientes/20261018170000_ba005_indice_orden_ofertas.sql).
-- Qué hace: elimina el índice si existe. Para qué: volver atrás sin tocar datos
-- (borrar un índice no cambia filas ni resultados, solo el plan de la consulta).
-- =====================================================

-- Borra el índice propuesto (idempotente).
drop index if exists public.idx_ofertas_academicas_creado_en_desc_id;
