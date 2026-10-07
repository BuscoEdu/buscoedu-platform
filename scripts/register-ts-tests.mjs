/**
 * Permite que `node --test` resuelva imports relativos sin extensión
 * (el mismo estilo que ya usan los tests del repo).
 */
import { register } from 'node:module';

register(new URL('./resolve-ts-tests.mjs', import.meta.url).href, import.meta.url);
