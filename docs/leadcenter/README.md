# Lead Center BuscoEdu — Guía general

El Lead Center es el módulo comercial (CRM) de BuscoEdu para los roles\
`super_admin` y `asesor`. Convierte a un visitante del explorador en una\
persona identificada con una oportunidad en el embudo, y da al asesor un\
workspace para gestionarla con ayuda de un copiloto determinista y\
automatizaciones de estancamiento.

## Alcance por fases

* **Fase 0 — Auditoría** (`FASE_0_AUDITORIA.md`): inventario del esquema y del\
  código reutilizable; qué existe y qué falta.

* **Fase 1 — Modelo y seguridad** (`FASE_1_MODELO_SEGURIDAD.md`): extensión de\
  `personas`, modelo de negocio en ofertas/oportunidades, RLS y helpers, seeds.

* **Fase 2 — Identidad y OTP** (`FASE_2_IDENTIDAD_OTP.md`): verificación de\
  celular por OTP simulado (hash real, caducidad, intentos, rate limit) y\
  proveedor conmutable.

* **Fase 3 — Conversión** (`FASE_3_CONVERSION.md`): RPC transaccional idempotente\
  y modal de aplicación + consentimientos desde el explorador.

* **Fase 4 — Lead Center** (`FASE_4_LEADCENTER.md`): dashboard, oportunidades,\
  ficha 360°, personas, tareas y copiloto.

* **Fase 5 — Automatizaciones** (`FASE_5_AUTOMATIZACIONES.md`): motor de\
  estancamiento idempotente y cron protegido.

* **Fase 6 — QA y operación** (`FASE_6_QA_OPERACION.md`): verificación, mapeo de\
  datos, verificación de producción y migración a OTP real.

## Rutas principales

* `/leadcenter` — dashboard (KPIs + pipeline).

* `/leadcenter/oportunidades` y `/leadcenter/oportunidades/[id]` — lista y ficha.

* `/leadcenter/personas` y `/leadcenter/personas/[id]`.

* `/leadcenter/tareas` — bandeja de tareas.

* `/leadcenter/login` — acceso (super_admin/asesor).

## API

* `POST /api/otp/request`, `POST /api/otp/verify` — verificación de celular.

* `GET /api/leadcenter/consentimientos` — tipos de consentimiento activos.

* `POST /api/leadcenter/convertir` — conversión desde el explorador.

* `POST /api/leadcenter/oportunidad/[id]/etapa|contacto` — acciones del CRM.

* `GET|POST /api/leadcenter/oportunidad/[id]/copiloto` — sugerencia/decisión.

* `POST /api/cron/automatizaciones` — motor de estancamiento (protegido).

## Variables de entorno requeridas

Ver `PRODUCTION_VERIFICATION.md`. Ninguna clave está hardcodeada.

## Principios no negociables respetados

* Nunca se borran ni renombran tablas/columnas; sólo se extienden.

* Sin borrado físico (estado/activo).

* Nunca se transfiere un lead a una universidad sin consentimiento vigente.

* OTP simulado con hash real; no se simulan envíos reales (se registran como\
  `pendiente` en `comunicaciones_transaccionales`).

* Mobile-first y en español.

* El copiloto sugiere, no actúa solo; toda decisión queda auditada.