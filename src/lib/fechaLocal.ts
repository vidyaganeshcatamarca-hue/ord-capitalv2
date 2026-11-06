// src/lib/fechaLocal.ts
// El «hoy» del usuario, en SU zona horaria, en el formato que esperan las RPC
// (YYYY-MM-DD).
//
// No se usa toISOString(): eso devuelve el día en UTC, y a las 22:00 de
// Argentina ya es el día siguiente. La programación de los recurrentes se
// piensa en el día del usuario; UTC queda para la telemetría, que sí quiere el
// reloj del servidor.

export function fechaLocalISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
