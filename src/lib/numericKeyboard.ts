// src/lib/numericKeyboard.ts
// Contrato del Enter del teclado numerico del telefono (feature: ronda 7, S1).
//
// En Android el teclado numerico muestra "IR" (Go) en la esquina inferior
// derecha, y esa tecla es el Enter del formulario: el navegador dispara la
// sumision implicita y el modal se guarda y se cierra. El dueño lo reporto en
// el modulo de inversiones: "toco IR y me graba, no tiene que hacer eso, tiene
// que funcionar como un OK, dejar el valor puesto y pasar el foco a ningun
// lado". O sea: el valor queda escrito, el teclado se cierra y el usuario
// decide donde seguir; guardar es SOLO el boton Guardar.
//
// Se resuelve en dos capas, porque una sola no alcanza en todos los WebView:
//   1. `enterKeyHint="done"` cambia la etiqueta del teclado a "Listo"/"Done"
//      en vez de "IR"/"Go" (el teclado nativo ya no promete que confirma).
//   2. Este handler cancela el Enter y saca el foco, que es lo que corta la
//      sumision implicita del form cuando la tecla ya se apreto.
// Las dos van juntas en cada input; ver NUMERIC_INPUT_ENTER_PROPS abajo para
// no repetir el par y para que un input nuevo no se olvide de una de las dos.

import type { KeyboardEvent } from 'react'

/**
 * Cancela el Enter del teclado (o del teclado fisico) y saca el foco del
 * input: deja el valor escrito y no dispara ninguna accion del modal.
 */
export function keepValueOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== 'Enter') return
  event.preventDefault()
  event.currentTarget.blur()
}

/**
 * Props que todo input de carga de valores dentro de un modal con form tiene
 * que llevar. Se esparcen: `<input {...NUMERIC_INPUT_ENTER_PROPS} />`.
 *
 * `done` y no `next`: el pedido es que el foco no vaya a ningun lado, asi que
 * el teclado no debe prometer un salto al campo siguiente.
 */
export const NUMERIC_INPUT_ENTER_PROPS = {
  enterKeyHint: 'done',
  onKeyDown: keepValueOnEnter,
} as const
