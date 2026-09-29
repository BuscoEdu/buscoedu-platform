# NO MERGEAR hasta restaurar `src/lib/ofertas.ts`

Un commit intermedio dejó ese archivo en placeholder. Restaurar así:

```bash
git checkout main -- src/lib/ofertas.ts
```

Luego aplicar:

1. Import:
```ts
import { resolverIdsAliadas } from './aliadas';
```

2. Al inicio de `obtenerOfertas`, después de `const hoy = todayISO();`:
```ts
    const aliadaIds = await resolverIdsAliadas();
    if (aliadaIds.length === 0) {
      return {
        ok: true,
        ofertas: [],
        total: 0,
        page: safePage,
        pageSize: safeSize,
        hasMore: false
      };
    }
```

3. Sustituir el bloque `// Universidad` por:
```ts
    if (universidadIds !== null) {
      const cruzados = universidadIds.filter((id) => aliadaIds.includes(id));
      if (cruzados.length === 0) {
        return {
          ok: true,
          ofertas: [],
          total: 0,
          page: safePage,
          pageSize: safeSize,
          hasMore: false
        };
      }
      query = query.in('universidad_id', cruzados);
    } else {
      query = query.in('universidad_id', aliadaIds);
    }
```

Header pendiente (mismo PR o commit extra):
- PRIMARY_NAV: Encontrar opciones, NaIA, Mi lista
- Programas y Universidades en Más
- CTA teal Encontrar opciones; NaIA outline
