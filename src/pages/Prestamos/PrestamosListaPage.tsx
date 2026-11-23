import { ContextoFormatoPrestamos } from '@/components/prestamos/ContextoFormatoPrestamos'
import { PrestamoLista } from '@/components/prestamos/PrestamoLista'

/**
 * The two directions of the loans list. They share one component on purpose:
 * the difference is the copy of the quick action, not the behaviour (T24).
 */
export function PrestamosDeboPage() {
  return (
    <>
      <ContextoFormatoPrestamos />
      <PrestamoLista direccion="debo" />
    </>
  )
}

export function PrestamosMeDebenPage() {
  return (
    <>
      <ContextoFormatoPrestamos />
      <PrestamoLista direccion="me_deben" />
    </>
  )
}
