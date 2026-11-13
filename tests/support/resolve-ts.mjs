// Resolver hook for the OCR polling suite.
//
// `polling.ts` imports runtime values from './apiClient' without an extension,
// which the bundler resolves and Node's ESM loader does not. This hook appends
// `.ts` for relative specifiers so the suite can exercise the real module under
// `node --test` without touching the product's imports.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Fall through: let Node report the original failure.
    }
  }
  return nextResolve(specifier, context);
}
