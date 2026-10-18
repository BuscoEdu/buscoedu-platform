/**
 * Si un import relativo no trae extensión, prueba el archivo .ts.
 */

// Raíz del repo (este archivo vive en scripts/). Sirve para traducir el alias «@/» de tsconfig.
const RAIZ_REPO = new URL('../', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  // Alias «@/…» (tsconfig paths): lo convierte en ruta absoluta del repo para que node --test
  // pueda cargar módulos como src/lib/whatsapp/catalogo-supabase.ts, que importan con «@/».
  // Para qué: probar los callers reales de obtenerOfertas (WhatsApp, Demo WApp) sin Next ni bundler.
  if (specifier.startsWith('@/')) {
    const absoluto = new URL(specifier.slice(2), RAIZ_REPO).href;
    return resolve(absoluto, context, nextResolve);
  }
  // Rutas relativas o file:// sin extensión: primero prueba «.ts» y, si no existe, la ruta tal cual.
  const relativo = specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('file://');
  const sinExtension = !/\.[a-z0-9]+$/i.test(specifier);
  if (relativo && sinExtension) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      return nextResolve(specifier, context);
    }
  }
  return nextResolve(specifier, context);
}
