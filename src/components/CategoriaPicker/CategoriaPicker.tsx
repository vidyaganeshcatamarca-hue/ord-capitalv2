// src/components/CategoriaPicker/CategoriaPicker.tsx
// Selector de categoría (rubro) con jerarquía.
//
// Extraído de EditarCuarentenaModal, que lo tenía escrito inline. La regla que
// importa y que se conserva: un rubro padre CON hijos es un encabezado y no se
// puede elegir; los gastos apuntan a una subcuenta real. Los padres sin hijos sí
// son elegibles.
//
// Por qué existe: la app tenía un solo lugar donde se elegía categoría y lo hacía
// bien (hoja con árbol, iconos reales, nombres traducidos), mientras el resto usaba
// <select> planos. Con dos formas distintas de elegir lo mismo, el usuario paga la
// diferencia.
//
// Accesibilidad: se opera con botones reales, a diferencia de un <select> nativo
// cuyo desplegable no vive en el DOM.

import { useEffect, useState } from 'react'
import { CategoryIcon, isLikelyLucideName } from '@/components/CategoryIcon/CategoryIcon'
import { t } from '@/locales/i18n'
import './CategoriaPicker.css'

/** Subcuenta elegible. */
export interface CategoriaHoja {
  estructura_id: number
  /** Ya traducido por el consumidor (`t(nombre_cuenta)`). */
  nombre: string
  icono: string
}

/** Rubro de primer nivel. Si tiene hijos, es encabezado y no se elige. */
export interface CategoriaGrupo {
  estructura_id: number
  /** Ya traducido por el consumidor (`t(nombre_cuenta)`). */
  nombre_cuenta: string
  icono: string
  hijos: CategoriaHoja[]
}

interface Props {
  categorias: CategoriaGrupo[]
  /** Id seleccionado; acepta string o number porque las RPC devuelven ambos. */
  value: string | number | null
  onChange: (id: string) => void
  /** Texto del disparador cuando no hay selección. */
  placeholder?: string
  /** Título de la hoja. */
  title?: string
  /** Muestra un indicador mientras se cargan las categorías. */
  loading?: boolean
}

/** Iconos de librería no se imprimen como texto: degradan al emoji de carpeta. */
function iconoTexto(raw: string): string {
  return isLikelyLucideName(raw) ? '📁' : raw.trim()
}

export function CategoriaPicker({
  categorias,
  value,
  onChange,
  placeholder,
  title,
  loading = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const idNum = value === null || value === '' ? NaN : Number(value)

  // Al abrir, el grupo de la selección actual queda desplegado: el usuario ve
  // dónde está parado sin un toque extra.
  useEffect(() => {
    if (!open || Number.isNaN(idNum)) return
    const parent = categorias.find(g => (g.hijos ?? []).some(h => h.estructura_id === idNum))
    if (parent) setExpanded(String(parent.estructura_id))
  }, [open, idNum, categorias])

  const labelSeleccionado = (): string => {
    if (!Number.isNaN(idNum)) {
      for (const g of categorias) {
        if (g.estructura_id === idNum) return `${iconoTexto(g.icono)} ${g.nombre_cuenta}`
        const hijo = (g.hijos ?? []).find(h => h.estructura_id === idNum)
        if (hijo) return `${iconoTexto(hijo.icono)} ${hijo.nombre}`
      }
    }
    return placeholder ?? t('saneamiento_seleccionar_categoria')
  }

  const tituloHoja = title ?? t('saneamiento_categoria')

  return (
    <>
      {loading ? (
        <div className="cp-loading" role="status" aria-live="polite">
          <span className="cp-loading-dot" />
        </div>
      ) : (
        <button
          type="button"
          className="cp-trigger"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          <span className="cp-trigger-label">{labelSeleccionado()}</span>
          <span className="cp-trigger-chevron" aria-hidden="true">▼</span>
        </button>
      )}

      {open && (
        <div className="cp-overlay" onClick={() => setOpen(false)}>
          <div
            className="cp-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={tituloHoja}
            onClick={e => e.stopPropagation()}
          >
            <div className="cp-header">
              <span className="cp-title">{tituloHoja}</span>
              <button
                className="cp-close"
                onClick={() => setOpen(false)}
                aria-label={t('btn_close')}
              >
                ✕
              </button>
            </div>

            <div className="cp-tree">
              {categorias.map(g => {
                const esGrupo = (g.hijos ?? []).length > 0
                const abierto = expanded === String(g.estructura_id)
                return (
                  <div key={g.estructura_id} className="cp-group">
                    <div className="cp-row">
                      {esGrupo ? (
                        // Encabezado: un padre con hijos no es destino de gasto,
                        // pero TODA la fila despliega las subcategorías (el
                        // chevron queda como indicador, no como único botón).
                        <button
                          type="button"
                          className="cp-heading cp-heading--toggle"
                          onClick={() => setExpanded(abierto ? null : String(g.estructura_id))}
                          aria-expanded={abierto}
                        >
                          <span className="cp-icon"><CategoryIcon name={g.icono} size={16} /></span>
                          <span className="cp-name">{g.nombre_cuenta}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`cp-option${idNum === g.estructura_id ? ' is-selected' : ''}`}
                          onClick={() => { onChange(String(g.estructura_id)); setOpen(false) }}
                        >
                          <span className="cp-icon"><CategoryIcon name={g.icono} size={16} /></span>
                          <span className="cp-name">{g.nombre_cuenta}</span>
                        </button>
                      )}

                      {esGrupo && (
                        <button
                          type="button"
                          className="cp-expand"
                          onClick={() => setExpanded(abierto ? null : String(g.estructura_id))}
                          aria-label={abierto ? t('btn_collapse') : t('btn_expand')}
                          aria-expanded={abierto}
                        >
                          {abierto ? '▲' : '▼'}
                        </button>
                      )}
                    </div>

                    {esGrupo && abierto && (
                      <div className="cp-children">
                        {(g.hijos ?? []).map(h => (
                          <button
                            key={h.estructura_id}
                            type="button"
                            className={`cp-option cp-option-child${idNum === h.estructura_id ? ' is-selected' : ''}`}
                            onClick={() => { onChange(String(h.estructura_id)); setOpen(false) }}
                          >
                            <span className="cp-icon"><CategoryIcon name={h.icono} size={16} /></span>
                            <span className="cp-name">{h.nombre}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
