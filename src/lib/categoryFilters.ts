// src/lib/categoryFilters.ts
// Helpers de filtrado de categorias del sistema. La categoria "Misterio/Olvido"
// es de sistema (la crea la RPC `fn_reporte_desviacion_misterio` para registrar
// ajustes por diferencia de conciliacion) y NO debe ser seleccionable por el
// usuario en flujos de edicion ni en selectores de carga. Sigue aparecer en
// widgets de reporte (HomePage misterio widget, reportes BCG, etc.) donde es
// informacion relevante.
//
// La categoria "Inversiones" (S7) es de sistema por decision del dueno: la crea
// `fn_crear_inversion` con nombre_cuenta = 'cat_investments_portfolio' y
// tipo_cupo = 'investment'. Es EXCLUSIVA del modulo de Inversiones:
//   - no se renombra ni se edita desde el menu de Categorias;
//   - no admite subcategorias;
//   - no admite transacciones manuales (alta, edicion, cuarentena);
//   - solo se escribe a traves de las operaciones del modulo de inversiones.
// Este filtro es la primera linea de defensa del lado del cliente; el backend
// lo blinda con triggers (temp_sql/83_categoria_inversiones_bloqueada.sql).
//
// OJO: el filtro compara por NOMBRE. La fila puede llegar con el nombre en
// `nombre_cuenta` o en `nombre_categoria` (se chequean ambos). La key vieja
// 'cat_investments' sigue en la lista a proposito: hay filas creadas antes del
// renombre (migracion 84) y la ventana entre deploys debe estar cubierta.

/**
 * Lista canonica de nombres / claves i18n que identifican a las categorias
 * de sistema que el usuario no puede editar ni elegir en un movimiento.
 * Comparada siempre en lowercase, sin acentos (los nombres del RPC ya vienen
 * en formato canonico).
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
  'cat_card_diff',
  'type_adjustment_card_diff',
  // Exclusiva del modulo de Inversiones (S7). La key vigente es
  // 'cat_investments_portfolio'; la vieja sigue bloqueada mientras haya filas
  // con ella (migracion 84).
  'cat_investments_portfolio',
  'cat_investments',
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
