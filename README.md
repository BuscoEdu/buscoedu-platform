# BuscoEdu - Plataforma de Orientación Educativa

## 🎯 Descripción

BuscoEdu (www.buscoedu.com) es una plataforma de orientación educativa neutral que conecta personas con ofertas académicas (becas, descuentos, programas universitarios). **BuscoEdu NO es una universidad**, no garantiza admisión, no asigna becas. Solo orienta.

**NaIA** es la asesora virtual de BuscoEdu que ayuda a las personas a expresar lo que buscan, transforma esa intención en filtros de búsqueda visibles, explica resultados y acompaña la exploración.

## Estado actual — 20 de septiembre de 2026

### Actualización Ronda 3 (fix crítico de NaIA + UX + Universidades B2B)

* **Fix crítico NaIA:** `AgenteExecutor` ahora resuelve despliegue de forma resiliente. Si la versión activa no trae `configuracion_snapshot.despliegue_id`, busca el despliegue activo más reciente (`updated_at DESC`, con fallback a `actualizado_en`).
* **Chat NaIA limpio:** en `/naia` y `/explorar`, el chat solo muestra historial + input + bloque `Puedes continuar con`; los filtros/chips viven únicamente en resultados.
* **Ubicación de sugerencias:** `Puedes continuar con` quedó debajo del input en web y móvil.
* **Resultados móvil full-screen:** al abrir resultados se oculta el header global, se bloquea scroll del body y el cierre `Volver al chat` queda sticky (tap target >= 44px).
* **Franja disclaimer dedicada:** el texto legal-operativo se movió a una franja entre experiencia NaIA y footer; se retiró del footer para evitar duplicidad.
* **/explorar hereda lógica de /naia:** ahora usa `NaiaSearchExperience` con variante de layout que prioriza el área de resultados.
* **Nueva página `/universidades`:** landing B2B completa de 13 secciones, FAQ acordeón, CTA repetido y formulario conectado a endpoint real (`/api/universidades/contacto`).
* **Semilla SQL B2B:** se agregó `supabase/seeds/contactos_universidades_seed.sql` con tabla y políticas idempotentes.

### Actualización Ronda 2 (NaIA UX web/móvil + detalle de fichas)

* En `/naia` se recalcula dinámicamente la altura útil de escritorio (`header + contenido NaIA + footer`) para mantener visible el footer sin saltos de página durante la conversación.
* Se añadió un separador visual entre el historial del chat y el bloque `Puedes continuar con`, evitando que ambos bloques queden pegados.
* En móvil, el chat ya no muestra chips de filtros: los filtros activos viven solo en la ventana de resultados, con mejor aprovechamiento del alto útil del chat.
* El placeholder del input quedó en `Pregúntale a NaIA` para asegurar una sola línea en móvil.
* La ventana móvil de resultados conserva botón de cierre explícito (`X`) con mayor contraste táctil.
* `OfferDetailModal` ahora queda totalmente contenido dentro del viewport móvil (`max-h` + `overflow` interno).
* Se amplió la altura de rebote del indicador de `pensando` para feedback visual más claro.
* NaIA recibe contexto de ofertas visibles (filtros + fichas resumidas) desde frontend/backend para responder preguntas de detalle de universidad/oferta sin inventar datos.

* NaIA mantiene configuración de agente, versión, contexto, canal y despliegue desde base de datos; una versión sin prueba/contexto/canal/despliegue no puede publicarse.
* La experiencia `/naia` ahora encaja sin scroll vertical general en desktop: el layout usa `100dvh` con `overflow-hidden`, y solo chat/listados internos hacen scroll.
* Todas las respuestas de NaIA incluyen conteo de resultados. Cuando el total es 0, NaIA responde explícitamente que no encontró coincidencias y sugiere ampliar o limpiar filtros.
* Se activó efecto máquina de escribir para los mensajes de NaIA y se mantuvo el autoscroll del historial durante la animación.
* Se agregó una barra de filtros activos editable (chips removibles + botón `Limpiar filtros`). En móvil, esta barra vive dentro de la ventana de resultados.
* La sección `Puedes continuar con…` quedó resaltada con fondo tenue y bordes para visibilidad.
* En móvil, el placeholder del chat se acortó a `Cuéntale a NaIA qué buscas…` y se ajustó tipografía de placeholder para evitar doble línea.
* En móvil, los resultados se abren en ventana adicional desde el botón `Explorar resultados`; en desktop continúan visibles en panel derecho.
* El indicador de espera `NaIA está entendiendo.../consultando...` ahora usa animación de puntos en movimiento.
* `OfferDetailModal` fue ajustado para no exceder el viewport: `max-w-[calc(100vw-1rem)]`, `min-w-0`, `overflow-x-hidden` y `break-words`.
* **Diagnóstico Derecho (confirmado 2026-09-20):** existen 9 ofertas activas/publicadas/validadas del área Derecho, pero todas tienen `vigente_hasta=2026-08-15`. Como la lógica exige vigencia (`vigente_hasta >= hoy`), el resultado correcto es 0. **No se cambió la lógica de vigencia**; la corrección requerida es de datos en Supabase.
* El CRM mantiene la migración `20260904010000_tipos_oportunidad_universidad.sql`: agrega `tipo_oportunidad` y `codigo`, crea automáticamente oportunidad institucional y evita automatizaciones B2C para universidades.

### Checklist de verificación después del despliegue

- [ ] Ejecutar una búsqueda pública de `Derecho` y confirmar que actualmente devuelve **0 resultados** por vigencia vencida en datos (`vigente_hasta=2026-08-15`).
- [ ] Repetir la búsqueda con `derecho`, `DERECHO` y `ciencias jurídicas`, validando el mismo comportamiento hasta actualizar datos.
- [ ] Tras actualizar vigencias en Supabase, abrir una oferta y confirmar programa, universidad, sede y modalidad.
- [ ] Verificar que filtros de nivel, modalidad y ubicación continúan combinándose con la búsqueda.
- [ ] Revisar la consola del navegador y los logs de Supabase: no debe aparecer error de columna ni consulta PostgREST inválida.
- [ ] Confirmar que los cambios de funnel y sus reglas se conservan después de recargar la página.

### Pendiente operativo obligatorio

Ejecutar en Supabase las migraciones pendientes, en especial `supabase/migrations/20260904010000_tipos_oportunidad_universidad.sql`, antes de usar códigos de oportunidad o registrar nuevas universidades en producción. Después, validar una universidad de prueba y verificar que aparezca como oportunidad de tipo **Universidad** en Lead Center.

## 📚 Stack Técnico

La arquitectura modular y sus reglas de escalamiento están documentadas en
[`docs/ARQUITECTURA_ESCALABLE_BUSCOEDU.md`](docs/ARQUITECTURA_ESCALABLE_BUSCOEDU.md).
La comprobación no destructiva del módulo IA está disponible en
[`supabase/diagnostics/auditoria_escalabilidad_ia.sql`](supabase/diagnostics/auditoria_escalabilidad_ia.sql).

```
Framework:      Next.js 14+ (TypeScript, App Router)
Estilos:        Tailwind CSS
Base de datos:  Supabase (PostgreSQL)
Deploy:         Vercel → www.buscoedu.com
Cliente DB:     src/lib/supabase.ts (getSupabaseClient())
```

## 🏗️ Estructura del Proyecto

```
buscoedu-platform/
├── app/                          # Páginas de Next.js (App Router)
│   ├── page.tsx                  # Landing principal
│   ├── layout.tsx                # Layout global
│   ├── globals.css               # Estilos globales
│   ├── explorar/                 # Página de exploración (NUEVA)
│   │   └── page.tsx
│   ├── naia/                     # Página informativa de NaIA
│   ├── programas/
│   ├── universidades/
│   ├── beneficios/
│   ├── como-funciona/
│   ├── para-universidades/
│   ├── contacto/
│   ├── privacidad/
│   ├── terminos/
│   └── test-supabase/            # Prueba de conexión a Supabase
│
├── components/                   # Componentes reutilizables
│   ├── Providers.tsx             # Wrapper de contextos
│   ├── naia/
│   │   ├── NaiaEntryModal.tsx    # Modal inicial de NaIA
│   │   ├── NaiaChatPanel.tsx     # Panel de chat conversacional
│   │   └── NaiaMessage.tsx       # Componente de mensaje
│   ├── explorar/
│   │   ├── FilterPanel.tsx       # Panel de filtros manuales
│   │   ├── ActiveFilterTags.tsx  # Tags de filtros activos
│   │   ├── SortControl.tsx       # Control de ordenamiento
│   │   ├── OfferCard.tsx         # Tarjeta de oferta
│   │   └── OfferDetailModal.tsx  # Ficha de detalle bloqueante
│   ├── layout/
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── ui/
│   │   ├── SectionHeading.tsx
│   │   └── InfoCard.tsx
│   └── forms/
│       ├── InterestForm.tsx
│       └── SimpleLocalForm.tsx
│
├── src/
│   ├── lib/
│   │   ├── supabase.ts           # Cliente de Supabase
│   │   ├── visitor.ts            # Sistema de visitante anónimo
│   │   ├── naia-mock.ts          # Motor mock de NaIA
│   │   ├── ofertas.ts            # Consultas de ofertas
│   │   └── events.ts             # Sistema de tracking de eventos
│   └── contexts/
│       └── MyListContext.tsx     # Contexto de "Mi Lista"
│
├── supabase/
│   └── migrations/
│       └── 20260815_add_visitante_id_to_eventos_negocio.sql
│
├── tailwind.config.ts            # Configuración de Tailwind
├── tsconfig.json                 # Configuración de TypeScript
└── package.json
```

## 🚀 Flujo de Navegación Implementado

```
Landing (app/page.tsx)
  → [click "Hablar con NaIA"]
  → Modal inicial de NaIA (componente sobre landing)
  → [usuario escribe intención o elige sugerencia → click "Buscar con NaIA"]
  → Redirige a /explorar?q={intención}
  → Página /explorar (app/explorar/page.tsx)
      ├── Panel izquierdo (desktop): chat NaIA + filtros manuales
      ├── Panel derecho (desktop): encabezado + filtros activos + grid de tarjetas
      ├── Móvil: chat compacto → filtros en tags → lista vertical de tarjetas
      └── [click en tarjeta]
          → Ficha ampliada modal bloqueante (componente sobre /explorar)
              ├── Información completa de la oferta académica
              ├── Botones: "Guardar en Mi lista" / "Aplicar a beca"
              └── [click ×] → cierra ficha, restaura posición exacta de /explorar
```

## 🔧 Componentes Principales

### 1. NaiaEntryModal.tsx
Modal inicial que se abre al hacer click en "Hablar con NaIA":
- Área de texto para intención en lenguaje natural
- 5 sugerencias predefinidas clickeables
- Redirección a `/explorar?q={texto}`
- **NO** solicita datos personales
- Tracking de evento: `naia_modal_abierto`

### 2. NaiaChatPanel.tsx
Panel de chat conversacional con NaIA:
- Mensajes bidireccionales (usuario ↔ NaIA)
- Procesamiento con motor mock (naia-mock.ts)
- Detección automática de filtros
- Callback a componente padre con filtros detectados

### 3. Motor Mock de NaIA (naia-mock.ts)
Sistema de derivación basado en patrones de palabras clave:
- Matriz de reglas con patrones RegEx
- Detección de: áreas, modalidades, niveles, beneficios, ciudades
- Respuestas predefinidas contextuales
- Preguntas de seguimiento opcionales
- **NO usa OpenAI/Claude/Gemini** (es puro match de patrones)

### 4. FilterPanel.tsx
Panel de filtros manuales con grupos desplegables:
- **Estudios**: programa/área, nivel académico
- **Ubicación**: país, ciudad, universidad
- **Modalidad**: presencial, virtual, híbrida
- **Beneficios**: tipo de beneficio

### 5. OfferCard.tsx
Tarjeta de oferta académica:
- Imagen/logo de universidad
- Nombre del programa + universidad/sede
- Máximo 5 campos de decisión
- **NO muestra precio** (solo en ficha de detalle)
- Botón corazón para "Mi Lista"

### 6. OfferDetailModal.tsx
Ficha de detalle bloqueante:
- Modal que cubre toda la pantalla
- Información académica completa
- Beneficios y condiciones
- Precios (solo aquí, no en tarjetas)
- Requisitos de acceso
- Acciones: "Guardar en Mi lista" / "Aplicar a beca"
- Tracking de eventos: `ficha_oferta_abierta`, `ficha_oferta_cerrada`, `intento_aplicar_oferta`

### 7. MyListContext.tsx
Contexto global de "Mi Lista":
- UNA SOLA lista (sin carpetas ni colecciones múltiples)
- Persistencia en `localStorage` (visitante anónimo)
- Tracking de eventos: `oferta_agregada_mi_lista`, `oferta_retirada_mi_lista`
- Sincronizará con Supabase al registrarse (futuro)

## 📊 Sistema de Tracking de Eventos

### Eventos Registrados

| Evento | Descripción | Datos capturados |
|--------|-------------|------------------|
| `naia_modal_abierto` | Usuario abre modal inicial | `visitante_id` |
| `intencion_busqueda_enviada` | Usuario envía búsqueda | `visitante_id`, `metadata.intencion` |
| `filtro_aplicado` | Filtro manual aplicado | `visitante_id`, `metadata.filtro`, `metadata.valor` |
| `filtro_retirado` | Filtro removido | `visitante_id`, `metadata.filtro` |
| `ficha_oferta_abierta` | Usuario abre detalle de oferta | `visitante_id`, `oferta_id`, `programa_id`, `universidad_id` |
| `ficha_oferta_cerrada` | Usuario cierra detalle | `visitante_id`, `oferta_id` |
| `oferta_agregada_mi_lista` | Oferta guardada en Mi Lista | `visitante_id`, `oferta_id` |
| `oferta_retirada_mi_lista` | Oferta quitada de Mi Lista | `visitante_id`, `oferta_id` |
| `intento_aplicar_oferta` | Click en "Aplicar a beca" | `visitante_id`, `oferta_id`, `programa_id`, `universidad_id` |

### Migración de Base de Datos

Se creó la migración SQL para agregar soporte de visitantes anónimos:

```sql
-- Archivo: supabase/migrations/20260815_add_visitante_id_to_eventos_negocio.sql
-- Agrega columna visitante_id a eventos_negocio
-- Crea FK constraint a tabla visitantes
-- Crea índice para optimizar consultas
```

**Nota**: Esta migración debe ejecutarse en Supabase antes del deploy.

## 🔑 Variables de Entorno

Ya configuradas en Vercel y `.env.local` (NO tocar):

```bash
NEXT_PUBLIC_SUPABASE_URL=<URL de Supabase>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Clave anónima>
```

## 🎨 Sistema de Diseño

### Colores (Tailwind)

```javascript
buscoedu: {
  blue: '#2563eb',
  teal: '#14b8a6',
  yellow: '#fbbf24',
  bg: '#f8fafc',
  text: '#1e293b',
  muted: '#64748b',
  border: '#e2e8f0'
}
```

### Sombra de Tarjetas

```javascript
card: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
```

## 📱 Responsive

- **Desktop** (≥768px): Layout 2 columnas (chat+filtros | resultados)
- **Mobile** (<768px): Layout vertical (chat → filtros → resultados)
- Diseño mobile-first obligatorio

## ⚠️ Prohibiciones Absolutas

### Sobre datos y privacidad:
- ❌ NO solicitar datos personales durante exploración
- ❌ NO transferir datos a universidades sin consentimiento
- ❌ NO crear oportunidades automáticamente

### Sobre presentación:
- ❌ NO mostrar precios en tarjetas (solo en ficha)
- ❌ NO mostrar cupos si no están validados
- ❌ NO mostrar más de 5 campos en tarjetas

### Sobre NaIA:
- ❌ NO conectar NaIA a OpenAI/Claude/Gemini (fase mock)
- ❌ NO aplicar filtros silenciosamente
- ❌ NO afirmar aprobación de admisión/beca

### Sobre navegación:
- ❌ NO permitir múltiples fichas abiertas simultáneamente
- ❌ NO crear comparador independiente (comparaciones solo en chat)
- ❌ NO crear múltiples listas (solo UNA "Mi Lista")

## 🗄️ Tablas de Supabase Consultadas

```
universidades          → nombre, descripción
sedes                  → nombre, ciudad, país
programas_academicos   → nombre, nivel, área, duración
modalidades            → tipo
ofertas_academicas     → nombre, descripción, vigencia, cupos
beneficios_oferta      → tipo, descripción, condiciones
visitantes             → id, fecha_primera_visita
eventos_negocio        → tipo_evento, visitante_id, oferta_id, metadata
```

## 🚦 Criterios de Aceptación

- [x] El clic en "Hablar con NaIA" abre un modal sin requerir registro
- [x] Un mensaje en el modal lleva a `/explorar` con resultados y filtros visibles
- [x] NaIA mock responde con mensaje, filtros detectados y pregunta opcional
- [x] Los filtros de NaIA y los manuales se sincronizan sin cambios silenciosos
- [x] Desktop: chat + filtros a la izquierda, resultados a la derecha (2 columnas)
- [x] Móvil: chat compacto, filtros en tags, tarjetas en lista vertical
- [x] Cada tarjeta tiene imagen/logo, no muestra precio, muestra máximo 5 campos
- [x] La ficha es bloqueante, única, sin imágenes, solo se cierra con `×`
- [x] Al cerrar la ficha se restaura la posición exacta del explorador
- [x] Existe una sola "Mi Lista", temporal para visitante anónimo
- [x] "Aplicar a beca" muestra aviso (sin completar registro ni aplicación)
- [x] Ninguna acción de exploración crea oportunidad, aplicación ni transferencia
- [x] El visitante anónimo tiene `identificador_navegacion` persistido en `localStorage`
- [x] Los eventos clave se registran en `eventos_negocio` con `visitante_id`

## 🔄 Próximos Pasos (NO implementados en esta fase)

1. **Registro y autenticación** de usuarios
2. **Persistencia de Mi Lista** en Supabase al registrarse
3. **Flujo completo de aplicación** a ofertas
4. **Integración real de NaIA** con LLM (OpenAI/Claude)
5. **Filtrado avanzado** con consultas complejas a Supabase
6. **Paginación** de resultados
7. **Imágenes reales** de universidades/sedes
8. **Datos demo completos** en Supabase

## 📝 Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Desarrollo local
npm run dev
# → http://localhost:3000

# Build producción
npm run build

# Preview URL (Abacus VM)
echo $PREVIEW_URL
# Puertos: $PREVIEW_URL-<port>.na110.preview.abacusai.app
```

## 🧭 Actualización CRM — Pipeline y Funnel (2026-09-05)

La actualización consolida la operación del Lead Center sin sustituir sus fuentes de datos actuales.

- **Pipeline y Funnel:** nueva ruta `/leadcenter/pipeline` con vistas de Panorama, Gestión y Configuración. El panel deja de enviar una etapa a una lista sin contexto; conserva el filtro de etapa dentro del módulo.
- **Tareas:** `/leadcenter/tareas` ofrece `Radar` como vista predeterminada y `Detalle` para trabajo operativo. El radar ordena por vencimiento y usa estados accesibles de tiempo, vencimiento y finalización.
- **Ficha de oportunidad:** incorpora dashboard enlazable a Persona, ruta visual de funnel, tareas contextualizadas, notas/comentarios en dos columnas, historial con altura controlada y consentimientos con scroll interno.
- **Modelo de datos:** la migración `20260905200000_funnel_salud_versionada.sql` añade versión de funnel, transiciones configurables, salud/prioridad, eventos de scoring idempotentes y fechas operativas. Debe ejecutarse en Supabase antes de activar configuraciones nuevas.

### Ejecutar migraciones y validar

1. Ejecuta las migraciones pendientes en orden cronológico, incluida `supabase/migrations/20260905200000_funnel_salud_versionada.sql`.
2. Revisa el `NOTICE` de la migración: si existen oportunidades activas duplicadas para la misma persona y oferta, resuélvelas antes de activar la unicidad.
3. Configura reglas de transición y salud desde administración antes de convertirlas en obligatorias para operación.
4. Ejecuta `npm run build` antes de desplegar.

### Corrección posterior a validación en producción

- El dashboard toma el reloj de la subetapa para el estancamiento, presenta esa señal bajo la temperatura y evita duplicar programa/oferta.
- La ruta comercial muestra etapas y subetapas; el módulo Pipeline expone las subetapas y sus conteos.
- WhatsApp opera desde **Canales** en una ventana única, centrada y minimizable; no permanece como panel fijo.
- La tarjeta duplicada de Persona fue retirada de la oportunidad: la ficha se abre desde el nombre superior.

### Cierre operativo: salud y gobierno IA

- **Reglas de estancamiento:** `/admin/funnel` administra los umbrales `Lenta` y `Estancada`, bloque recurrente y descuentos por etapa o subetapa. Ficha, Pipeline y copiloto aplican la misma regla con precedencia por subetapa.
- **Ruta comercial:** la ficha prioriza subetapas configuradas como estaciones; verde representa lo recorrido, azul el paso actual y gris lo pendiente.
- **Temperatura:** el puntaje comercial se muestra de forma uniforme en cinco niveles: Muy fría, Fría, Tibia, Caliente y Muy caliente.
- **NaIA:** las sugerencias analizan estado/subetapa, salud, actividad reciente, tareas y consentimientos. Son auditables y no ejecutan acciones automáticamente.
- **Centro de Agentes IA:** navegación y pestañas siguen la secuencia de creación/actualización: gobierno, agente, contexto, fuentes, herramientas, canales, despliegue, simulación, pruebas y publicación.

## 🐛 Troubleshooting

### "No hay datos demo en Supabase"
Las tablas de ofertas están vacías. Se necesita insertar datos demo antes de continuar.

### "Error obteniendo ofertas"
Verificar:
1. Variables de entorno configuradas
2. Conexión a Supabase
3. Permisos RLS en tablas

### Filtros no se aplican
- Los filtros NaIA y manuales se sincronizan mediante `handleFiltersDetected`
- Revisar que los valores coincidan con los datos en Supabase

### Modal no se cierra con Escape
- Verificar que el `useEffect` de manejo de teclas esté activo
- El foco debe estar en el modal o en el documento

## 📄 Licencia

Proyecto privado de BuscoEdu. Todos los derechos reservados.

---

**Versión**: 1.0.0 - Implementación BLOQUE 1-4  
**Fecha**: 2026-08-15  
**Autor**: BuscoEdu Dev Team
