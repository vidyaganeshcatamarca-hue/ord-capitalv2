import * as es from './es.js';

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
 * Soporta dos formatos:
 *  1. Plano: 'error_unauthorized' -> busca la key exacta en todas las secciones
 *  2. Anidado con punto: 'wallets.btn_add_cuenta' -> busca primero la key
 *     completa (por si la seccion tiene un objeto "wallets" y dentro una
 *     "btn_add_cuenta"); si no la encuentra, intenta resolverla como
 *     `seccion.key` (es decir, "wallets" como seccion, "btn_add_cuenta"
 *     como key dentro de esa seccion). Esto permite usar prefijos en los
 *     call sites sin obligar a refactorizar es.ts a una estructura
 *     anidada cuando los traductores ya estan organizados por seccion
 *     plana.
 * Si la clave tiene parámetros con formato {param_name}, serán reemplazados por los valores correspondientes.
 *
 * @param key Clave de traducción (ej. 'error_unauthorized', 'wallets.btn_add_cuenta')
 * @param params Parámetros opcionales para formatear en la cadena traducida
 */
export function t(key: string, params?: Record<string, any>): string {
  const dict = locales[currentLang] || es;
  const sections = Object.values(dict).filter(
    (s): s is Record<string, any> => !!s && typeof s === 'object' && !Array.isArray(s)
  );

  const format = (raw: string): string => {
    if (!params) return raw
    return raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
  };

  // 1) Busqueda plana: la key coincide exacta con algun campo de cualquier seccion.
  for (const section of sections) {
    if (key in section) {
      const value = (section as any)[key]
      if (typeof value === 'string') return format(value)
    }
  }

  // 2) Busqueda anidada: 'wallets.btn_add_cuenta' -> primer segmento es
  //    nombre de seccion, resto es la key dentro de esa seccion. Asi no
  //    hace falta mover las traducciones a objetos anidados en es.ts.
  const dotIdx = key.indexOf('.')
  if (dotIdx > 0 && dotIdx < key.length - 1) {
    const sectionName = key.slice(0, dotIdx)
    const innerKey = key.slice(dotIdx + 1)
    const section = (dict as Record<string, any>)[sectionName]
    if (section && typeof section === 'object' && innerKey in section) {
      const value = (section as any)[innerKey]
      if (typeof value === 'string') return format(value)
    }
  }

  // Fallback si no se encuentra en el archivo:
  // Si se proveyó un defaultValue en params se retorna, de lo contrario se retorna la clave
  return params?.defaultValue || key;
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
