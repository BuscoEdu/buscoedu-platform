# FAMILIA v6e · Olas O0–O6 (+ cierre FI1/DU1/canje)

Estado: **BD v6e_00…v6e_05 en prod** (Supabase `khnrnnoxyzuulagemfbh`). FE en PR `feat/familia-v6e-fi1`.

## Archivos SQL (orden)
| Archivo | Contenido |
|---|---|
| v6e_00_respaldo.sql | Respaldos previos |
| v6e_01_columnas.sql | cierre_auto, duracion_min, aprobada_para_hacer, en_subasta, telefono, params |
| v6e_02_horario.sql | Trigger INSERT/UPDATE Fin>Inicio + duración 1–72 h |
| v6e_03_premios_ap1.sql | liberar_para_hacer + helper premio |
| v6e_04_tick_reabrir_subasta.sql | tick_vencidas + cron */5, reabrir, perdonar_despues_auto, aceptar_subasta |
| v6e_05_fi1_canje.sql | E-FI1 zona Europe/Madrid + duración por día en series; E-PR1 guarda `asignado_a` en RPC de canje; previa/cambiar con `{hora,dur_min}` |

## Manual corto (padre)
1. **Crear / editar** tarea o deber: elige **Inicio** + **Duración** (1–72 h). El Fin se calcula solo.
2. **Deber repetitivo**: marca días L–D; hora y duración general; opcional otra hora/duración por día.
3. **Cruce**: si el horario se solapa con otra tarea del mismo hijo, no deja guardar.
4. **Premio por hijo**: solo ese hijo lo ve y lo canjea (también bloqueado en BD).
5. **Subasta / cierre auto / Reabrir / Perdonar**: opciones en la ficha; el servidor cierra las vencidas con `cierre_auto` cada ~5 min.

## Fuera de este corte
- **E-AG1** Agenda (corte propio).
- PIN seguro C4 (sigue en espera).

## Quién
Orquestador BuscoEdu / executor · OK Jhon t792u (+ 15:19 AGENTS.md) · Europe/Madrid.
