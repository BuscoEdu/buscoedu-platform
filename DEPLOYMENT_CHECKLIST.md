# Deployment Checklist — Panel Admin BuscoEdu

## Pre-Deployment
- [ ] Todas las migraciones aplicadas en Supabase
- [ ] Usuario super_admin creado
- [ ] Variables de entorno configuradas
- [ ] Build de Next.js exitoso (`npm run build`)
- [ ] Sitio público sigue funcionando

## Deployment Steps
1. **Push a GitHub**
   - Subir la rama con los cambios del panel admin.
2. **Vercel detecta cambios**
   - Validar que Vercel tome el último commit.
3. **Build automático**
   - Confirmar que el build finalice sin errores.
4. **Deploy a producción**
   - Verificar estado `Ready` en Vercel.
5. **Probar acceso a `/admin/login`**
   - URL: `https://www.buscoedu.com/admin/login`

## Post-Deployment
- [ ] Login como super_admin funciona
- [ ] Dashboard carga métricas reales
- [ ] Al menos 1 universidad/sede/programa creados de prueba
- [ ] Sitio público NO afectado
