import { ContextoFormatoPrestamos } from '@/components/prestamos/ContextoFormatoPrestamos'
import { PrestamosCalendario } from '@/components/prestamos/PrestamosCalendario'

/** Loan section of the calendar (S20). Sibling of Saneamiento, never a sub-view of it. */
export function PrestamosCalendarioPage() {
  return (
    <>
      <ContextoFormatoPrestamos />
      <PrestamosCalendario />
    </>
  )
}

export default PrestamosCalendarioPage
