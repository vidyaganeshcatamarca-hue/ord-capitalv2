// src/lib/baseCeroConfirm.ts
// La palabra que el usuario tiene que escribir para activar el modo Base Cero
// (feature: ronda 7, S6).
//
// Dueño: "para pasar a modo base cero debo escribir la palabra acepto.
// Busquemos una palabra más internacional en inglés que coincida también con lo
// que espera el modal para autorizarlo. podría ser 'BASECERO' u otra."
//
// 'ACEPTO' era español puro y no describía la acción: aceptar qué. 'BASECERO'
// nombra exactamente lo que se está activando, no lleva tildes ni caracteres
// que el teclado del teléfono no tenga, y es la misma palabra que usa el módulo
// en la barra de navegación (Base 0 / Base Cero / Base Zero). En inglés el
// módulo se llama "Zero Base", así que el token queda igual de cerca: el
// usuario escribe el nombre del modo que ve en pantalla.
//
// Vive en un módulo y no suelto en la página porque el mismo token lo usan la
// validación, el placeholder del input y los textos de los tres diccionarios
// (que lo reciben como {token}): una sola fuente, sin deriva entre ellos.

export const BASE_CERO_CONFIRM_TOKEN = 'BASECERO'

/**
 * ¿El texto escrito por el usuario autoriza la activación? Se compara sin
 * distinguir mayúsculas ni espacios de los extremos: el pedido es que escriba
 * la palabra, no que copie el formato.
 */
export function isBaseCeroConfirmToken(value: string): boolean {
  return value.trim().toUpperCase() === BASE_CERO_CONFIRM_TOKEN
}
