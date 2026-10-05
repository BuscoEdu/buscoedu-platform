# BA-031 — Funnel aplicar → registro → consentimiento en el hilo Demo WhatsApp

> El cruce de hilo, la sesión QA y el enmascarado están en `docs/backend/README-a1-demowapp.md`. Desde ese cambio, `POST /api/demowapp/aplicar` exige `oportunidadId`.

**Rama:** `feat/lote-ba-naia-wapp`  
**Alcance:** backend del hilo `/demoWapp`. Sin PR. Sin Meta Cloud / BA-032. El SQL no se aplicó en producción.

NaIA sigue orientando en el turno de chat. Aplicar, el registro y el consentimiento son otro camino: una sesión demo que no es oportunidad. El lead del Lead Center aparece solo si el estudiante acepta el consentimiento en el hilo.

## Reglas

- Mi lista, Aplicar y Autorizar contacto no se mezclan.
- Guardar en Mi lista, pedir datos o mostrar el texto no crea persona, oportunidad ni aplicación.
- Sin aceptación explícita no hay lead a la universidad. Rechazo y abandono cierran la sesión con esos ids en null.
- Sin sesión web, el nombre, el celular y el correo opcional se guardan en la sesión del hilo. La respuesta no manda a un perfil web.
- Tras aceptar: burbuja de confirmación en la sesión y, si la conversación CRM se puede abrir, la misma frase en `mensajes_conversacion`. La oportunidad queda en el Lead Center con la traza.
- El panel `/demoWapp` no cambió. Estas respuestas son el contrato para pintarlo en el chat (`ui.estado`, `mensajes`). Mientras el request está en vuelo, la UI pone `cargando: true`. El servidor responde `success` o `error` con `cargando: false`.

## Auth

Igual que el resto de `/api/demowapp` privado: sesión de Lead Center y rol `super_admin`. Si no, `403` `forbidden`.

## Rutas

| Método | Ruta | Efecto |
| --- | --- | --- |
| `POST` | `/api/demowapp/aplicar` | `accion: "iniciar"` abre Aplicar. `accion: "mi_lista"` solo registra Mi lista. |
| `GET` | `/api/demowapp/aplicar/:intencionId` | Estado y burbujas de la sesión demo. |
| `POST` | `/api/demowapp/aplicar/:intencionId/datos` | Guarda contacto. Si nombre y celular quedan completos, pasa a consentimiento. |
| `GET` | `/api/demowapp/aplicar/:intencionId/consentimiento` | Presenta los textos de `tipos_consentimiento`. Ninguno viene otorgado. |
| `POST` | `/api/demowapp/aplicar/:intencionId/consentimiento` | `aceptar`, `rechazar` o `abandonar`. Solo aceptar puede crear el lead. |

`GET /api/leadcenter/consentimientos` sigue igual. Ahora lee el mismo helper que el hilo (`src/lib/leadcenter/tipos-consentimiento.ts`).

El turno `POST /api/demowapp/sesiones/:oportunidadId/mensaje` y `POST /api/naia` no crean este lead. BA-024 (voz y sesión) no se modifica, salvo un comentario de límite en `mensaje-service`.

## Request

Iniciar, sin datos todavía:

```json
{
  "accion": "iniciar",
  "ofertaId": "uuid-de-oferta",
  "claveIdempotencia": "hilo-demo-001"
}
```

`pais` es el código ISO (`CO`) o el prefijo (`57`). El default es Colombia.

Datos en la sesión:

```json
{
  "nombreCompleto": "Laura Pérez",
  "celular": "3001234567",
  "pais": "57",
  "correo": "laura@correo.com"
}
```

Decisión. `otorgado` solo cuenta si es el booleano `true`. Un string `"true"` queda en false.

```json
{
  "decision": "aceptar",
  "consentimientos": [
    { "codigo": "tratamiento_datos", "otorgado": true },
    { "codigo": "contacto", "otorgado": true },
    { "codigo": "transferencia_universidad", "otorgado": false }
  ]
}
```

Si la oferta es `por_lead`, `transferencia_universidad` tiene que ir en `true`. Si es `por_inscrito`, hace falta al menos uno de `contacto`, `contacto_whatsapp` o `transferencia_universidad`, además de los tipos con `es_obligatorio`.

Rechazar o abandonar:

```json
{ "decision": "rechazar" }
```

```json
{ "decision": "abandonar" }
```

Mi lista:

```json
{
  "accion": "mi_lista",
  "ofertaId": "uuid-de-oferta",
  "claveIdempotencia": "lista-demo-001"
}
```

## Response

Éxito (`200`). `leadCreado` es `false` hasta una aceptación que pasó las reglas.

```json
{
  "ok": true,
  "leadCreado": false,
  "idempotente": false,
  "ui": {
    "estado": "success",
    "cargando": false,
    "paso": "consentimiento",
    "leadCreado": false,
    "acciones": ["aceptar", "rechazar", "abandonar"]
  },
  "mensajes": [
    {
      "id": "uuid",
      "rol": "naia",
      "tipo": "consentimiento",
      "texto": "…",
      "en": "2026-09-27T00:00:00.000Z"
    }
  ],
  "sesionDemo": {
    "id": "uuid",
    "ofertaId": "uuid",
    "ofertaNombre": "Nombre de la oferta",
    "modeloNegocio": "por_lead",
    "paso": "consentimiento",
    "contacto": {
      "nombreCompleto": "Laura Pérez",
      "celularE164": "+573001234567",
      "celularEnmascarado": "+57••••••567",
      "correo": "laura@correo.com",
      "pais": "CO"
    }
  },
  "oportunidadId": null,
  "aplicacionId": null,
  "personaId": null,
  "trazaConsentimiento": null,
  "consentimientos": [
    {
      "codigo": "tratamiento_datos",
      "nombre": "Tratamiento de datos personales",
      "esObligatorio": true,
      "otorgado": false,
      "versionTexto": "v1"
    }
  ],
  "hiloCrm": null
}
```

Tras aceptar, `leadCreado` es `true`, `paso` es `aceptada`, y `oportunidadId`, `aplicacionId`, `personaId` y `trazaConsentimiento` vienen llenos. `hiloCrm` trae `conversacionId` y `mensajeId` si se pudo anexar la confirmación a la conversación. Si ese anexo falla, el lead igual queda y la burbuja sigue en `mensajes`.

Error:

```json
{
  "ok": false,
  "code": "consentimiento_transferencia_requerido",
  "error": "Esta oferta solo sigue si autorizas la transferencia a la universidad. Sin eso no creo el lead.",
  "leadCreado": false,
  "ui": {
    "estado": "error",
    "cargando": false,
    "paso": "consentimiento",
    "leadCreado": false,
    "acciones": ["aceptar", "rechazar", "abandonar"]
  },
  "mensajes": [
    {
      "rol": "naia",
      "tipo": "error",
      "texto": "Esta oferta solo sigue si autorizas la transferencia a la universidad. Sin eso no creo el lead."
    }
  ]
}
```

Repetir la misma `claveIdempotencia` devuelve la sesión existente (`idempotente: true`) y no la reinicia. La misma clave no puede pasar de Mi lista a Aplicar (`clave_en_uso`).

## Códigos fail-closed

| Código | HTTP | Cuándo | Lead |
| --- | --- | --- | --- |
| `mi_lista_no_es_aplicar` | 409 | Se intenta seguir una fila de Mi lista como aplicación | no |
| `paso_invalido` | 409 | Aceptar o rechazar antes de tener datos y texto, o presentar consentimiento sin contacto completo | no |
| `ya_resuelta` | 409 | La sesión ya está aceptada, rechazada o abandonada y la decisión no es la misma | no |
| `consentimiento_obligatorio_faltante` | 422 | Un tipo `es_obligatorio` no está en `true` | no |
| `consentimiento_transferencia_requerido` | 422 | Oferta `por_lead` sin `transferencia_universidad: true` | no |
| `consentimiento_no_aceptado` | 422 | No hay autorización de contacto (`contacto`, `contacto_whatsapp` o `transferencia_universidad`) | no |
| `decision_invalida` | 400 | Decisión distinta de aceptar, rechazar o abandonar | no |
| `datos_incompletos` | 400 | Nombre ausente o fuera de 3–120 caracteres, o no llegó ningún campo | no |
| `celular_invalido` | 400 | El celular no normaliza a E.164 | no |
| `correo_invalido` | 400 | Correo con forma inválida | no |
| `oferta_inexistente` | 404 | El id no está en `ofertas_academicas` | no |
| `oferta_no_disponible` | 422 | `activo = false` | no |
| `oferta_sin_periodo` | 422 | La oferta no tiene `periodo_academico_id` | no |
| `duplicada` | 400 | Ya hay una aplicación activa de esa persona, oferta y periodo | no nuevo |
| `limite_alcanzado` | 400 | La persona ya tiene 3 aplicaciones activas | no nuevo |
| `lead_no_creado` | 422 | La RPC no devolvió oportunidad o aplicación. La sesión no pasa a `aceptada` | no se marca |
| `funnel_no_disponible` | 503 | Falta esta migración | no |
| `clave_en_uso` | 409 | La clave ya es de otro paso | no |
| `forbidden` | 403 | Sin super admin | no |

También pueden volver `json_invalido`, `oferta_requerida`, `oferta_invalida`, `accion_invalida`, `clave_idempotencia_requerida`, `intencion_invalida`, `intencion_no_encontrada`, `rpc_error` y `server_error`.

## Traza ligada al lead

Solo en `paso = aceptada` la fila tiene `persona_id`, `oportunidad_id` y `aplicacion_id`. El check de la tabla lo impide en cualquier otro paso.

`traza_consentimiento` guarda canal `demo_wapp`, la decisión, los ítems (código, otorgado, versión) y esos tres ids. `verificacionCelular` queda en `declarada_en_hilo_sin_otp`: este hilo no pide OTP ni llama a Meta. La ruta web `POST /api/leadcenter/convertir` sigue exigiendo OTP.

La conversión reusa `fn_convertir_aplicacion` a través de `fn_ba031_convertir_si_consentido`. Esa función no escribe si falta el booleano, un obligatorio, la transferencia en `por_lead` o una autorización de contacto. Si la RPC histórica inserta y luego responde `ok: false`, el `RAISE` revierte la transacción.

Después del ok, las filas nuevas de `consentimientos_persona` (canal `explorador`, que es el valor que escribe la RPC) reciben `notas` con la intención y la oportunidad, y `canal = demo_wapp` si la columna lo admite. El evento `demowapp_consentimiento_hilo` en `eventos_negocio` repite la traza con `oportunidad_id`. La confirmación del hilo CRM usa referencia `ba031:confirmacion:{intencionId}`.

La clave de la oportunidad es `demowapp-ba031:{intencionId}`, distinta de la clave de la sesión, para no chocar con una conversión web.

## SQL listo para pegar

No está aplicado en producción. Depende de `fn_convertir_aplicacion`, `fn_validar_aplicacion` e `is_super_admin()`, ya presentes en las migraciones del Lead Center. Archivo: `supabase/migrations/20260927210000_ba031_intenciones_aplicar_demowapp.sql`.

```sql
-- =====================================================
-- BA-031 · Funnel aplicar → registro → consentimiento
-- en el hilo de Demo WhatsApp, antes de cualquier lead.
-- =====================================================
-- No toca Meta Cloud ni el canal web.
-- No modifica fn_convertir_aplicacion: la envuelve y,
-- si esa RPC escribe y luego responde ok=false, revierte.
-- No aplicar en producción desde este cambio: el SQL queda
-- listo para pegar (ver docs/backend/README-ba031.md).
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Borrador del hilo. No es oportunidad, aplicación ni catálogo.
-- persona/oportunidad/aplicación solo pueden llenarse en paso 'aceptada'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intenciones_aplicar_demowapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id uuid NOT NULL REFERENCES public.ofertas_academicas(id),
  paso text NOT NULL,
  clave_idempotencia text NOT NULL,
  nombre_completo text,
  correo text,
  celular_e164 text,
  pais_celular text,
  visitante_id uuid,
  modelo_negocio text,
  oferta_nombre text,
  consentimientos jsonb NOT NULL DEFAULT '[]'::jsonb,
  traza_consentimiento jsonb,
  mensajes jsonb NOT NULL DEFAULT '[]'::jsonb,
  persona_id uuid REFERENCES public.personas(id),
  oportunidad_id uuid REFERENCES public.oportunidades(id),
  aplicacion_id uuid REFERENCES public.aplicaciones(id),
  ip_origen text,
  motivo_cierre text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  resuelto_en timestamptz,
  CONSTRAINT intenciones_aplicar_demowapp_paso_check CHECK (
    paso IN (
      'mi_lista',
      'iniciada',
      'datos',
      'consentimiento',
      'aceptada',
      'rechazada',
      'abandonada'
    )
  ),
  CONSTRAINT intenciones_aplicar_demowapp_lead_solo_aceptada CHECK (
    (
      paso = 'aceptada'
      AND persona_id IS NOT NULL
      AND oportunidad_id IS NOT NULL
      AND aplicacion_id IS NOT NULL
    )
    OR (
      paso <> 'aceptada'
      AND persona_id IS NULL
      AND oportunidad_id IS NULL
      AND aplicacion_id IS NULL
    )
  )
);

COMMENT ON TABLE public.intenciones_aplicar_demowapp IS
  'BA-031. Intención de aplicar en el hilo Demo WhatsApp. No es un lead: la oportunidad solo se liga si paso = aceptada.';
COMMENT ON COLUMN public.intenciones_aplicar_demowapp.paso IS
  'mi_lista | iniciada | datos | consentimiento | aceptada | rechazada | abandonada. Mi lista no transiciona a lead.';
COMMENT ON COLUMN public.intenciones_aplicar_demowapp.traza_consentimiento IS
  'Snapshot del consentimiento del hilo, con oportunidad_id solo tras aceptar.';
COMMENT ON COLUMN public.intenciones_aplicar_demowapp.mensajes IS
  'Burbujas del funnel antes de que exista conversación CRM (la conversación exige oportunidad).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_intenciones_aplicar_demowapp_clave
  ON public.intenciones_aplicar_demowapp (clave_idempotencia);

CREATE INDEX IF NOT EXISTS idx_intenciones_aplicar_demowapp_oferta_paso
  ON public.intenciones_aplicar_demowapp (oferta_id, paso);

CREATE INDEX IF NOT EXISTS idx_intenciones_aplicar_demowapp_oportunidad
  ON public.intenciones_aplicar_demowapp (oportunidad_id)
  WHERE oportunidad_id IS NOT NULL;

-- Lectura para super admin. Escritura solo vía service role (bypass RLS).
ALTER TABLE public.intenciones_aplicar_demowapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ba031_intenciones_select_super ON public.intenciones_aplicar_demowapp;
CREATE POLICY ba031_intenciones_select_super
  ON public.intenciones_aplicar_demowapp
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Conversión del hilo. Reusa fn_convertir_aplicacion.
-- Fail-closed: sin consentimiento_aceptado, sin obligatorios,
-- sin autorización de contacto (y sin transferencia si la oferta es
-- por_lead) no llama a la conversión.
-- Si la RPC interna deja filas y responde ok=false, RAISE revierte.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ba031_convertir_si_consentido(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oferta uuid := nullif(p_payload->>'oferta_id', '')::uuid;
  v_celular text := nullif(p_payload->>'celular_e164', '');
  v_modelo text;
  v_periodo uuid;
  v_persona uuid;
  v_validacion jsonb;
  v_result jsonb;
BEGIN
  -- Solo el booleano JSON true. El texto "true" no cuenta.
  IF jsonb_typeof(p_payload->'consentimiento_aceptado') IS DISTINCT FROM 'boolean'
     OR p_payload->'consentimiento_aceptado' IS DISTINCT FROM 'true'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consentimiento_no_aceptado');
  END IF;

  IF v_oferta IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oferta_id_requerida');
  END IF;

  IF v_celular IS NULL OR length(v_celular) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'celular_requerido');
  END IF;

  SELECT coalesce(modelo_negocio, 'por_inscrito'), periodo_academico_id
    INTO v_modelo, v_periodo
  FROM public.ofertas_academicas
  WHERE id = v_oferta
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oferta_inexistente');
  END IF;

  IF v_periodo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oferta_sin_periodo');
  END IF;

  -- Obligatorios del catálogo vigente. Ausente o no-true = no otorgado.
  IF EXISTS (
    SELECT 1
    FROM public.tipos_consentimiento t
    WHERE t.activo = true
      AND t.es_obligatorio = true
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(p_payload->'consentimientos', '[]'::jsonb)) c
        WHERE c->>'codigo' = t.codigo
          AND jsonb_typeof(c->'otorgado') = 'boolean'
          AND c->'otorgado' = 'true'::jsonb
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consentimiento_obligatorio_faltante');
  END IF;

  IF v_modelo = 'por_lead' AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_payload->'consentimientos', '[]'::jsonb)) c
    WHERE c->>'codigo' = 'transferencia_universidad'
      AND jsonb_typeof(c->'otorgado') = 'boolean'
      AND c->'otorgado' = 'true'::jsonb
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consentimiento_transferencia_requerido');
  END IF;

  -- Aplicar no es autorizar contacto. Tratamiento de datos, solo, no abre lead.
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_payload->'consentimientos', '[]'::jsonb)) c
    WHERE c->>'codigo' IN ('contacto', 'contacto_whatsapp', 'transferencia_universidad')
      AND jsonb_typeof(c->'otorgado') = 'boolean'
      AND c->'otorgado' = 'true'::jsonb
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consentimiento_no_aceptado');
  END IF;

  SELECT id INTO v_persona
  FROM public.personas
  WHERE celular_e164 = v_celular
  ORDER BY creado_en DESC
  LIMIT 1;

  -- Misma regla que fn_validar_aplicacion, antes de escribir.
  IF v_persona IS NOT NULL THEN
    v_validacion := public.fn_validar_aplicacion(v_persona, v_oferta, v_periodo);
    IF coalesce((v_validacion->>'ok')::boolean, false) IS NOT TRUE THEN
      RETURN v_validacion;
    END IF;
  END IF;

  v_result := public.fn_convertir_aplicacion(p_payload);

  -- La RPC histórica inserta la oportunidad y, si la validación falla
  -- después, responde ok=false sin deshacer. Aquí sí se deshace.
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'ba031_sin_lead:%', coalesce(v_result->>'error', 'rpc_error');
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_ba031_convertir_si_consentido(jsonb) IS
  'BA-031. Crea persona+oportunidad+aplicación solo con consentimiento aceptado. Si fn_convertir_aplicacion escribe y falla, la transacción se revierte.';

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.fn_ba031_convertir_si_consentido(jsonb) FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_ba031_convertir_si_consentido(jsonb) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_ba031_convertir_si_consentido(jsonb) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fn_ba031_convertir_si_consentido(jsonb) TO service_role';
  END IF;
END $$;

COMMIT;
```

## Archivos

- `src/lib/demowapp/funnel-aplicar-reglas.ts` — reglas puras, sin base de datos
- `src/lib/demowapp/funnel-aplicar-reglas.test.ts` — casos fail-closed
- `src/lib/demowapp/funnel-aplicar-mensajes.ts` — burbujas del hilo
- `src/lib/demowapp/funnel-aplicar.ts` — sesión demo, traza y conversión
- `src/lib/demowapp/funnel-http.ts` — auth y forma de error
- `src/lib/leadcenter/tipos-consentimiento.ts` — catálogo compartido con el flujo web
- `app/api/demowapp/aplicar/route.ts`
- `app/api/demowapp/aplicar/[intencionId]/route.ts`
- `app/api/demowapp/aplicar/[intencionId]/datos/route.ts`
- `app/api/demowapp/aplicar/[intencionId]/consentimiento/route.ts`
- `app/api/leadcenter/consentimientos/route.ts` — misma respuesta, helper compartido
- `src/lib/demowapp/mensaje-service.ts` — comentario de límite; el turno de NaIA no crea el lead
- `supabase/migrations/20260927210000_ba031_intenciones_aplicar_demowapp.sql`

## Verificación

`tsc --noEmit` pasa. Los 10 casos de `funnel-aplicar-reglas.test.ts` pasan (Mi lista, rechazo, abandono, obligatorio ausente, `por_lead` sin transferencia, string `"true"` que no cuenta como otorgado).

No hay base Supabase en este entorno: la RPC y las rutas no se ejecutaron contra datos reales. Hace falta aplicar el SQL de arriba antes de probar el hilo en un proyecto.
