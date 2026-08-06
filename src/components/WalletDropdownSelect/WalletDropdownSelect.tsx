import React, { useState, useRef, useEffect } from 'react'
import { WalletIcon } from '@/components/WalletIcon'
import { CategoryIcon } from '@/components/CategoryIcon'
import { ChevronDown } from 'lucide-react'
import { t } from '@/locales/i18n'

export interface WalletOptionItem {
  billetera_id: number
  nombre: string
  icono?: string | null
  moneda: string
  saldo_actual: number
  es_fondo_prevision?: boolean
}

export interface CreditCardOptionItem {
  tarjeta_id: number
  nombre_tarjeta: string
  color?: string
}

interface WalletDropdownSelectProps {
  wallets: WalletOptionItem[]
  selectedWalletId: number | null
  onSelectWallet: (id: number) => void
  tarjetas?: CreditCardOptionItem[]
  selectedTarjetaId?: number | null
  onSelectTarjeta?: (id: number) => void
  placeholder?: string
  formatMonto?: (val: string, moneda: string) => string
  style?: React.CSSProperties
  className?: string
}

export function WalletDropdownSelect({
  wallets,
  selectedWalletId,
  onSelectWallet,
  tarjetas = [],
  selectedTarjetaId = null,
  onSelectTarjeta,
  placeholder,
  formatMonto,
  style,
  className
}: WalletDropdownSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: Event) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isOpen])

  const selectedWallet = wallets.find(w => w.billetera_id === selectedWalletId)
  const selectedTarjeta = tarjetas.find(tc => tc.tarjeta_id === selectedTarjetaId)

  const fmt = (val: number, moneda: string) => {
    if (formatMonto) return formatMonto(val.toString(), moneda)
    return `${val.toLocaleString('es-AR')} ${moneda}`
  }

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative', width: '100%', ...style }}>
      {/* Trigger Input Box */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '12px 14px',
          background: 'var(--surface-2)',
          border: isOpen ? '1.5px solid var(--mint)' : '1px solid var(--border)',
          borderRadius: '12px',
          color: 'var(--text)',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          textAlign: 'left',
          transition: 'border-color 0.2s ease, background-color 0.2s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedWallet ? (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--mint)' }}>
                <WalletIcon name={selectedWallet.icono} size={20} />
              </span>
              <span style={{ fontWeight: 600, fontSize: 'calc(14px * var(--font-scale))' }}>
                {t(selectedWallet.nombre)}
              </span>
              <span style={{ fontSize: 'calc(12px * var(--font-scale))', color: selectedWallet.saldo_actual >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                ({fmt(selectedWallet.saldo_actual, selectedWallet.moneda)})
              </span>
            </>
          ) : selectedTarjeta ? (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--amber)' }}>
                <CategoryIcon name="CreditCard" size={20} />
              </span>
              <span style={{ fontWeight: 600, fontSize: 'calc(14px * var(--font-scale))' }}>
                {selectedTarjeta.nombre_tarjeta}
              </span>
              <span style={{ fontSize: 'calc(12px * var(--font-scale))', color: 'var(--text-3)' }}>
                (Crédito ARS)
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-3)', fontSize: 'calc(14px * var(--font-scale))' }}>
              {placeholder || t('movement_select_origin_or_card')}
            </span>
          )}
        </div>

        <ChevronDown
          size={18}
          style={{
            color: 'var(--text-2)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0
          }}
        />
      </button>

      {/* Floating Dropdown List */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'var(--surface-1, #2D2D2D)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
            maxHeight: '260px',
            overflowY: 'auto',
            padding: '6px'
          }}
        >
          {/* Section: Billeteras */}
          {wallets.length > 0 && (
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', padding: '6px 10px 4px 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {t('label_source_wallet')}
            </div>
          )}

          {wallets.map(b => {
            const isSelected = selectedWalletId === b.billetera_id && !selectedTarjetaId
            return (
              <button
                key={`b_${b.billetera_id}`}
                type="button"
                onClick={() => {
                  onSelectWallet(b.billetera_id)
                  setIsOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '10px 12px',
                  margin: '2px 0',
                  background: isSelected ? 'rgba(78, 205, 196, 0.12)' : 'transparent',
                  border: isSelected ? '1px solid var(--mint)' : '1px solid transparent',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: 'var(--surface-3)', color: isSelected ? 'var(--mint)' : 'var(--text)' }}>
                    <WalletIcon name={b.icono} size={18} />
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600, fontSize: 'calc(13px * var(--font-scale))' }}>{t(b.nombre)}</span>
                    <span style={{ fontSize: 'calc(11px * var(--font-scale))', color: 'var(--text-3)' }}>{b.moneda}</span>
                  </div>
                </div>
                <span style={{ fontSize: 'calc(13px * var(--font-scale))', fontWeight: 600, color: b.saldo_actual >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                  {fmt(b.saldo_actual, b.moneda)}
                </span>
              </button>
            )
          })}

          {/* Section: Tarjetas de crédito (si existen) */}
          {tarjetas.length > 0 && (
            <>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', padding: '10px 10px 4px 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t('group_credit_cards')}
              </div>
              {tarjetas.map(tc => {
                const isSelected = selectedTarjetaId === tc.tarjeta_id
                return (
                  <button
                    key={`t_${tc.tarjeta_id}`}
                    type="button"
                    onClick={() => {
                      if (onSelectTarjeta) onSelectTarjeta(tc.tarjeta_id)
                      setIsOpen(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '10px 12px',
                      margin: '2px 0',
                      background: isSelected ? 'rgba(255, 230, 109, 0.12)' : 'transparent',
                      border: isSelected ? '1px solid var(--amber)' : '1px solid transparent',
                      borderRadius: '8px',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: 'var(--surface-3)', color: 'var(--amber)' }}>
                        <CategoryIcon name="CreditCard" size={18} />
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 'calc(13px * var(--font-scale))' }}>{tc.nombre_tarjeta}</span>
                    </div>
                    <span style={{ fontSize: 'calc(11px * var(--font-scale))', color: 'var(--text-3)' }}>
                      Crédito ARS
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
