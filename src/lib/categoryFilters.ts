// src/lib/categoryFilters.ts
// Helpers de filtrado de categorias del sistema. La categoria "Misterio/Olvido"
// es de sistema (la crea la RPC `fn_reporte_desviacion_misterio` para registrar
// ajustes por diferencia de conciliacion) y NO debe ser seleccionable por el
// usuario en flujos de edicion ni en selectores de carga. Sigue aparecer en
// widgets de reporte (HomePage misterio widget, reportes BCG, etc.) donde es
// informacion relevante.

/**
 * Lista canonica de nombres / claves i18n que identifican a la categoria
 * de sistema "Misterio/Olvido". Comparada siempre en lowercase, sin
 * acentos (los nombres del RPC ya vienen en formato canonico).
 */
export const SYSTEM_CATEGORY_NAMES: readonly string[] = [
  'misterio/olvido',
  'misterio/olvido/devolucion',
  'misterio',
  'olvido',
  'mystery',
  'cat_misterio',
  'cat_mystery',
  'no_detail',
  'type_adjustment_mystery',
] as const

/**
 * Determina si una categoria puede ser seleccionada/editada por el usuario.
 * Recibe cualquier objeto con un campo `nombre_cuenta` o `nombre_categoria`
 * (compatibilidad con los distintos shapes que devuelve el backend).
 */
function isSystemName(raw: unknown): boolean {
  if (raw == null) return false
  const normalized = String(raw).trim().toLowerCase()
  if (!normalized) return false
  return SYSTEM_CATEGORY_NAMES.includes(normalized)
}

export function isUserEditableCategory(
  c: { nombre_cuenta?: string | null; nombre_categoria?: string | null } | null | undefined
): boolean {
  if (!c) return false
  // Si CUALQUIERA de los nombres coincide con un nombre de sistema, no es
  // editable. Esto cubre los casos donde el backend devuelve un nombre en
  // un campo y una clave i18n en otro (o solo uno de los dos).
  if (isSystemName(c.nombre_cuenta)) return false
  if (isSystemName(c.nombre_categoria)) return false
  return true
}

/**
 * Filtra un array de categorias dejando solo las editables. Conserva el tipo
 * generico para que el caller no pierda informacion.
 */
export function filterUserEditableCategories<
  T extends { nombre_cuenta?: string | null; nombre_categoria?: string | null }
>(arr: readonly T[] | null | undefined): T[] {
  if (!arr) return []
  return arr.filter(isUserEditableCategory)
}
