/**
 * Extensionless relative imports for the tests.
 *
 * The game's own sources are written for the bundler (`from '../config'`), which Node's ESM
 * resolver rejects outright. Registered from a test file before it imports anything under
 * `src/`, this hook retries a failed relative specifier as `.ts`, then as a directory index —
 * the same two guesses the bundler makes, and nothing else.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (!specifier.startsWith('.')) throw error;
    for (const suffix of ['.ts', '/index.ts']) {
      try {
        return await next(specifier + suffix, context);
      } catch {
        /* try the next guess, then give up with the original error */
      }
    }
    throw error;
  }
}
