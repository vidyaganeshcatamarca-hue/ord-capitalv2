/**
 * The words the user has to type to confirm a destructive action.
 *
 * They are FIXED and in English, on purpose.
 *
 * The backend compares the text exactly:
 *   fn_eliminar_cuenta_usuario -> 'DELETE'
 *   fn_borrar_datos_usuario   -> 'ERASE'
 *
 * If the word were translated, the backend would be comparing a Spanish word
 * against a Portuguese one, and the user would get a silent failure with no
 * explanation. The instruction around the word IS translated; the word is
 * not. This is the same convention GitHub, AWS and Stripe use.
 *
 * The two operations have DIFFERENT words on purpose: the user who already
 * typed DELETE to schedule the account deletion must not find the data
 * deletion one keystroke away with the same word.
 */
export const DELETE_ACCOUNT_CONFIRMATION_TEXT = 'DELETE'

export const DELETE_DATA_CONFIRMATION_TEXT = 'ERASE'
