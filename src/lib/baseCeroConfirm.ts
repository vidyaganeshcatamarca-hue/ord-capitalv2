// src/lib/baseCeroConfirm.ts
// La palabra que el usuario tiene que escribir para activar el modo Base Cero
// (feature: ronda 7, S6).
//
// Dueño: "para pasar a modo base cero debo escribir la palabra acepto.
// Busquemos una palabra más internacional en inglés que coincida también con lo
// que espera el modal para autorizarlo. podría ser 'BASECERO' u otra. Proponé."
// y después de ver la propuesta: "CERO me gusta más".
//
// 'ACEPTO' era español puro y no describía la acción: aceptar qué. 'CERO' es el
// concepto mismo del modo — arrancar de cero —, tiene cuatro letras, no lleva
// tildes ni caracteres que el teclado del teléfono no tenga, y se lee igual en
// español, portugués e inglés (cero / zero). El modal ya dice "Modo Base Cero"
// en el título, así que la palabra a escribir es la que el usuario está viendo.
//
// Vive en un módulo y no suelto en la página porque el mismo token lo usan la
// validación, el placeholder del input y los textos de los tres diccionarios
// (que lo reciben como {token}): una sola fuente, sin deriva entre ellos.

export const BASE_CERO_CONFIRM_TOKEN = 'CERO'

/**
 * ¿El texto escrito por el usuario autoriza la activación? Se compara sin
 * distinguir mayúsculas ni espacios de los extremos: el pedido es que escriba
 * la palabra, no que copie el formato.
 */
export function isBaseCeroConfirmToken(value: string): boolean {
  return value.trim().toUpperCase() === BASE_CERO_CONFIRM_TOKEN
}
