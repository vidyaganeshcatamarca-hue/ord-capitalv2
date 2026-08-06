import React, { useState, useRef, useEffect } from 'react'
import { WalletIcon } from '@/components/WalletIcon'
import { CategoryIcon } from '@/components/CategoryIcon'
import { ChevronDown, X } from 'lucide-react'
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

  // Prevent background scrolling when centered modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const selectedWallet = wallets.find(w => w.billetera_id === selectedWalletId)
  const selectedTarjeta = tarjetas.find(tc => tc.tarjeta_id === selectedTarjetaId)

  const fmt = (val: number, moneda: string) => {
    if (formatMonto) return formatMonto(val.toString(), moneda)
    return `${val.toLocaleString('es-AR')} ${moneda}`
  }

  return (
    <div className={className} style={{ width: '100%', ...style }}>
      {/* Trigger Input Box */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
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

      {/* Centered Modal Overlay */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999999,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              maxHeight: '80vh',
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-2)'
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 'calc(15px * var(--font-scale))', color: 'var(--text)' }}>
                {placeholder || t('movement_select_origin_or_card')}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content / Scrollable List */}
            <div style={{ overflowY: 'auto', padding: '10px 12px 14px 12px' }}>
              {/* Section: Billeteras */}
              {wallets.length > 0 && (
                <div style={{ fontSize: 'calc(12px * var(--font-scale))', fontWeight: 700, color: 'var(--text-2)', padding: '6px 10px 6px 10px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
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
                      padding: '12px 14px',
                      margin: '4px 0',
                      background: isSelected ? 'var(--surface-3)' : 'var(--surface-2)',
                      border: isSelected ? '1.5px solid var(--mint)' : '1px solid var(--border)',
                      borderRadius: '10px',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'var(--surface-1)',
                        border: '1px solid var(--border)',
                        color: isSelected ? 'var(--mint)' : 'var(--text)'
                      }}>
                        <WalletIcon name={b.icono} size={20} />
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, fontSize: 'calc(14px * var(--font-scale))' }}>{t(b.nombre)}</span>
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
                  <div style={{ fontSize: 'calc(12px * var(--font-scale))', fontWeight: 700, color: 'var(--text-2)', padding: '12px 10px 6px 10px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
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
                          padding: '12px 14px',
                          margin: '4px 0',
                          background: isSelected ? 'var(--surface-3)' : 'var(--surface-2)',
                          border: isSelected ? '1.5px solid var(--amber)' : '1px solid var(--border)',
                          borderRadius: '10px',
                          color: 'var(--text)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'var(--surface-1)',
                            border: '1px solid var(--border)',
                            color: 'var(--amber)'
                          }}>
                            <CategoryIcon name="CreditCard" size={20} />
                          </span>
                          <span style={{ fontWeight: 600, fontSize: 'calc(14px * var(--font-scale))' }}>{tc.nombre_tarjeta}</span>
                        </div>
                        <span style={{ fontSize: 'calc(12px * var(--font-scale))', color: 'var(--text-3)' }}>
                          Crédito ARS
                        </span>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
