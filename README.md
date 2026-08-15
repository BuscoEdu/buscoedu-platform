# BuscoEdu - Plataforma de Orientación Educativa

## 🎯 Descripción

BuscoEdu (www.buscoedu.com) es una plataforma de orientación educativa neutral que conecta personas con ofertas académicas (becas, descuentos, programas universitarios). **BuscoEdu NO es una universidad**, no garantiza admisión, no asigna becas. Solo orienta.

**NaIA** es la asesora virtual de BuscoEdu que ayuda a las personas a expresar lo que buscan, transforma esa intención en filtros de búsqueda visibles, explica resultados y acompaña la exploración.

## 📚 Stack Técnico

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
