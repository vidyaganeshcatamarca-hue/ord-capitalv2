import { useEffect, useState } from 'react'
import { t } from '@/locales/i18n'
import { getStoredMes, setStoredMes, formatMesCorto } from '@/lib/bcgUtils'
import './BCGSelectMes.css'

interface BCGSelectMesProps {
  value: string | null
  onChange: (mes: string | null) => void
}

function buildOptions(): string[] {
  const opts: string[] = []
  const today = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    opts.push(key)
  }
  return opts
}

export function BCGSelectMes({ value, onChange }: BCGSelectMesProps) {
  const [internal, setInternal] = useState<string | null>(value ?? getStoredMes())

  useEffect(() => {
    if (internal) setStoredMes(internal)
    onChange(internal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internal])

  const options = buildOptions()

  return (
    <div className="bcg-select-mes">
      <label className="bcg-select-mes-label">{t('bcg_seleccionar_mes')}</label>
      <select
        value={internal ?? ''}
        onChange={(e) => setInternal(e.target.value || null)}
        className="bcg-select-mes-input"
      >
        <option value="">{t('bcg_mes_actual')}</option>
        {options.map((opt) => {
          const [y, m] = opt.split('-').map(Number)
          const d = new Date(y, m - 1, 1)
          return (
            <option key={opt} value={opt}>
              {formatMesCorto(d)}
            </option>
          )
        })}
      </select>
    </div>
  )
}

export default BCGSelectMes
