import { PrestamoLista } from '@/components/prestamos/PrestamoLista'

/**
 * The two directions of the loans list. They share one component on purpose:
 * the difference is the copy of the quick action, not the behaviour (T24).
 */
export function PrestamosDeboPage() {
  return <PrestamoLista direccion="debo" />
}

export function PrestamosMeDebenPage() {
  return <PrestamoLista direccion="me_deben" />
}
