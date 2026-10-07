/**
 * Si un import relativo no trae extensión, prueba el archivo .ts.
 */
export async function resolve(specifier, context, nextResolve) {
  const relativo = specifier.startsWith('./') || specifier.startsWith('../');
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
