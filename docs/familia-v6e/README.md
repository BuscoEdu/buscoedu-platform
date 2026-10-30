# FAMLY v6e · Olas O0–O6

Estado: **APLICADO EN PROD (BD)** 2026-10-30 via Supabase MCP (`khnrnnoxyzuulagemfbh`). FE en PR `feat/familia-v6e`.

## Archivos SQL (orden)
| Archivo | Contenido |
|---|---|
| v6e_00_respaldo.sql | Respaldos previos |
| v6e_01_columnas.sql | cierre_auto, duracion_min, aprobada_para_hacer, en_subasta, telefono, params |
| v6e_02_horario.sql | Trigger INSERT/UPDATE Fin>Inicio + duración 1–72 h |
| v6e_03_premios_ap1.sql | liberar_para_hacer + helper premio |
| v6e_04_tick_reabrir_subasta.sql | tick_vencidas + cron */5, reabrir, perdonar_despues_auto, aceptar_subasta |

## Fuera de este corte
- **E-AG1** Agenda (corte propio).
- PIN seguro C4 (sigue en espera).

## Quién
Orquestador BuscoEdu / executor · OK Jhon t792u 2026-10-30 15:02 Europe/Madrid.
