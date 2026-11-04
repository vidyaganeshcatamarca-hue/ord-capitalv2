// src/lib/gastosRecurrentes.ts
// Contrato del objeto «gastos recurrentes». Espejo de las RPC de
// temp_sql/60..63 y de los requisitos R-GR-01..R-GR-46 del PRD
// (docs/varias/prd-gastos-recurrentes.md).

/**
 * Modo de recurrencia. Los cuatro primeros vienen de §33 (producto 4);
 * `unica` se aprobó después: ocurre una sola vez y no se repite, y por eso
 * guarda una fecha completa y no un par mes/día.
 */
export type ModoRecurrencia = 'semanal' | 'mensual' | 'anual' | 'unica'

/**
 * Con tarjeta solo se admite mensual (decisión del dueño): un cargo único con
 * tarjeta se carga con el modal de gasto manual, que ya existe. Ofrecerlo acá
 * serían dos caminos para lo mismo.
 */
export const MODOS_CON_TARJETA: readonly ModoRecurrencia[] = ['mensual']

/** Variabilidad del monto. `promedio_historico` promedia los últimos 3 meses del rubro. */
export type TipoVariabilidad = 'fijo' | 'promedio_historico'

/** Motivo por el que un recurrente quedó en pausa (RN-31, R-GR-37). */
export type MotivoPausa =
  | 'pausado_por_usuario'
  | 'billetera_eliminada'
  | 'categoria_movida'
  | 'subcuenta_creada'
  /** El motor lo pone solo cuando `fecha_fin` venció: la pausa no es tuya. */
  | 'vencida'
  /** El trigger de p_tarjetas_credito lo pone al borrar o archivar la tarjeta. */
  | 'tarjeta_eliminada'

/**
 * Una fecha anual se guarda como `mes * 100 + dia`.
 * 315 = 15 de marzo. El rango válido son los 366 días de un calendario real,
 * así que 230 (31 de febrero) no existe y la base lo rechaza.
 */
export type FechaAnual = number

/** Días ISO: 1 = lunes … 7 = domingo. */
export type DiaSemana = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * Un recurrente es de egreso o de ingreso, nunca de las dos.
 * Un ingreso no paga con tarjeta ni lleva categoría de egreso: cobra en una
 * billetera destino. La fuente de ingreso es opcional, como en la carga manual.
 */
export type NaturalezaRecurrente = 'egreso' | 'ingreso'

/** Fila tal como la devuelve `fn_listar_gastos_recurrentes()`. */
export interface GastoRecurrenteRow {
  recurrente_id: number
  nombre: string | null
  nombre_categoria: string | null
  icono: string | null
  monto_base: number | null
  dia_del_mes: number
  frecuencia: string
  tipo_variabilidad: TipoVariabilidad
  billetera_nombre: string | null
  /** Id real de la billetera: pausar y reactivar lo necesitan. */
  billetera_defecto_id: number | null
  estructura_egreso_id: number | null
  activo: boolean
  modo: ModoRecurrencia
  dias_semana: number[] | null
  dias_mes: number[] | null
  fechas_anio: number[] | null
  motivo_pausa: MotivoPausa | null
  pausado_at: string | null
  /** Ocurrencias pendientes en la bandeja. Se usa para avisar antes de borrar (R-GR-46). */
  ocurrencias_pendientes: number
  /** Fecha completa de la única ocurrencia (solo modo `unica`). */
  fecha_unica: string | null
  /** Fin de la vigencia; NULL = se repite para siempre. */
  fecha_fin: string | null
  /** Tarjeta con la que se paga; convive con `billetera_defecto_id` solo en NULL. */
  tarjeta_id: number | null
  tarjeta_nombre: string | null
  /** true si el monto se registrará en dólares. */
  es_usd: boolean
  /**
   * Moneda del monto, en ISO (ARS, BRL, USD…). La pone el backend según el
   * origen: la billetera elegida, o la tarjeta. No es del usuario: un mismo
   * usuario puede tener un recurrente en BRL y otro en ARS.
   */
  moneda: string | null
  naturaleza: NaturalezaRecurrente
  /** Fuente de ingreso (`p_ingresos.producto_id`). null = ingreso sin fuente. */
  estructura_ingreso_id: number | null
  ingreso_nombre: string | null
  ingreso_icono: string | null
  /** Billetera donde entra el dinero de un ingreso recurrente. */
  billetera_destino_id: number | null
  billetera_destino_nombre: string | null
}

/** Payload de alta y edición: los mismos campos, sin el id. */
export interface GastoRecurrenteInput {
  /** Ausente = egreso (compatibilidad con el bundle viejo). */
  naturaleza?: NaturalezaRecurrente
  /** Solo ingreso: fuente opcional y billetera donde entra la plata. */
  estructura_ingreso_id?: number | null
  billetera_destino_id?: number | null
  estructura_egreso_id: number | null
  nombre_custom: string | null
  monto_base: number
  tipo_variabilidad: TipoVariabilidad
  billetera_defecto_id: number | null
  modo: ModoRecurrencia
  dias_semana: number[] | null
  dias_mes: number[] | null
  fechas_anio: number[] | null
  /**
   * Solo lo usan las filas viejas. La fase 2 del esquema elimina `dia_del_mes` y
   * `frecuencia`; mientras existan, las RPC las mantienen sincronizadas.
   */
  dia_del_mes?: number | null
  frecuencia?: string | null
  /** Solo modo `unica`: fecha completa de la ocurrencia. */
  fecha_unica?: string | null
  /** Vigencia: NULL = se repite para siempre. */
  fecha_fin?: string | null
  /** Origen tarjeta: mutuamente excluyente con `billetera_defecto_id`. */
  tarjeta_id?: number | null
  /** Dólares: solo con tarjeta. */
  es_usd?: boolean
}

/** Reglas de forma que comparte el editor y que la base vuelve a validar. */
export const RECURRENCIA_LIMITES = {
  diasSemanaMin: 1,
  /** Sin tope práctico: se pueden elegir los 7 días de la semana. */
  diasSemanaMax: 7,
  diasMesMin: 1,
  /** Sin tope práctico: se pueden elegir los 31 días del mes. */
  diasMesMax: 31,
  fechasAnioMin: 1,
} as const

/** `315` -> `{ mes: 3, dia: 15 }`. */
export function parseFechaAnual(valor: FechaAnual): { mes: number; dia: number } {
  return { mes: Math.floor(valor / 100), dia: valor % 100 }
}

/** `{ mes: 3, dia: 15 }` -> `315`. */
export function buildFechaAnual(mes: number, dia: number): FechaAnual {
  return mes * 100 + dia
}

/** Días que tiene un mes, sin depender de la zona horaria del navegador. */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate()
}

/**
 * Recorte aprobado en §33 (producto 5): un día 31 en un mes corto cae el último
 * día de ese mes, tanto en el generador como en el calendario (R-GR-25).
 */
export function recortarDia(dia: number, anio: number, mes: number): number {
  return Math.min(dia, diasDelMes(anio, mes))
}

/**
 * Fechas de ocurrencia de un recurrente dentro de un mes, sin repetir.
 * El `Set` es lo que garantiza que elegir 30 y 31 en febrero dé UNA sola fecha
 * el día 28 (RN-36, D-18).
 */
export function fechasDelMes(
  fila: Pick<GastoRecurrenteRow, 'modo' | 'dias_semana' | 'dias_mes' | 'fechas_anio' | 'dia_del_mes'>,
  anio: number,
  mes: number,
): number[] {
  const ultimo = diasDelMes(anio, mes)
  const dias = new Set<number>()

  if (fila.modo === 'mensual') {
    const fuente = fila.dias_mes ?? (fila.dia_del_mes ? [fila.dia_del_mes] : [])
    for (const d of fuente) dias.add(recortarDia(d, anio, mes))
  } else if (fila.modo === 'anual') {
    for (const f of fila.fechas_anio ?? []) {
      const { mes: m, dia } = parseFechaAnual(f)
      if (m === mes) dias.add(recortarDia(dia, anio, mes))
    }
  } else {
    // semanal: todos los días del mes que caen en alguno de los días elegidos
    const elegidos = new Set(fila.dias_semana ?? [])
    for (let d = 1; d <= ultimo; d += 1) {
      const iso = new Date(anio, mes - 1, d).getDay() || 7
      if (elegidos.has(iso)) dias.add(d)
    }
  }

  return [...dias].sort((a, b) => a - b)
}

type Traductor = (key: string, params?: Record<string, any>) => string

/**
 * Nombre visible de un recurrente, en un solo lugar para que la tarjeta y los
 * dialogos no divergan.
 *
 * La RPC devuelve `nombre = COALESCE(nombre_custom, nombre_cuenta)` y NO devuelve
 * `nombre_custom`. El nombre del catalogo semilla es una clave i18n
 * (`cat_home_cleaning`), asi que cuando `nombre` y `nombre_categoria` coinciden no
 * hay nombre propio y hay que traducir. Sin esto la UI muestra la clave cruda.
 */
/**
 * «2026-11-15» -> «15 de noviembre 2026» con la clave i18n que ya existe.
 * Comparte el formato con las fechas anuales para no introducir otro.
 */
export function fechaVisible(iso: string, traducir: Traductor): string {
  const [anio, mes, dia] = iso.split('-').map(Number)
  return `${traducir('recurrentes_fecha_corta', { dia, mes: traducir(`recurrentes_mes_${mes}`) })} ${anio}`
}

export function nombreVisibleRecurrente(
  item: Pick<GastoRecurrenteRow, 'nombre' | 'nombre_categoria'>,
  traducir: Traductor,
): string {
  if (item.nombre != null && item.nombre !== item.nombre_categoria) return item.nombre
  if (item.nombre_categoria) return traducir(item.nombre_categoria)
  return traducir('recurrentes_sin_nombre')
}
