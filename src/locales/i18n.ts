import * as es from './es';

const locales: Record<string, any> = {
  es
};

let currentLang = 'es';

/**
 * Establece el idioma actual del traductor.
 */
export function setLanguage(lang: string) {
  if (locales[lang]) {
    currentLang = lang;
  }
}

/**
 * Traduce una clave buscando dinámicamente en todas las secciones del archivo de locales activo.
 * Si la clave tiene parámetros con formato {param_name}, serán reemplazados por los valores correspondientes.
 * 
 * @param key Clave de traducción (ej. 'error_unauthorized', 'cat_mystery')
 * @param params Parámetros opcionales para formatear en la cadena traducida
 */
export function t(key: string, params?: Record<string, any>): string {
  const dict = locales[currentLang] || es;
  
  // Buscar en todos los sub-objetos exportados (errors, success, category_keys, etc.)
  for (const section of Object.values(dict)) {
    if (section && typeof section === 'object' && key in section) {
      let value = (section as any)[key];
      if (typeof value === 'string') {
        if (params) {
          value = value.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
        }
        return value;
      }
    }
  }
  
  // Fallback si no se encuentra en el archivo:
  // Si la clave tiene formato cat_... intentamos embellecerla un poco o retornamos la clave
  return key;
}

/**
 * Parsea y traduce errores provenientes de la base de datos (con formato JSON de clave y params)
 * o texto plano de error, devolviendo el mensaje localizado correspondiente.
 */
export function parseError(err: any): string {
  if (!err) return '';
  let msg = typeof err === 'string' ? err : err.message || JSON.stringify(err);
  
  // Si no parece ser un JSON, verificar si es una frase legible de error
  if (!msg.startsWith('{')) {
    // Si no contiene espacios y es razonablemente corta, intentamos traducirla
    if (!msg.includes(' ') && msg.length < 50) {
      return t(msg);
    }
    return msg;
  }

  try {
    const parsed = JSON.parse(msg);
    if (parsed && parsed.key) {
      return t(parsed.key, parsed.params);
    }
  } catch (e) {
    // No es un JSON estructurado
  }
  return t(msg);
}
