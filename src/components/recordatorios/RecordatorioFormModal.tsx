import { useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { t } from '@/locales/i18n'
import type { ReminderInput } from '@/lib/reminders'
import './RecordatorioFormModal.css'

const DAYS: Array<{ key: 'L' | 'M' | 'X' | 'J' | 'V' | 'S' | 'D'; i18nKey: string }> = [
  { key: 'L', i18nKey: 'recordatorio_dia_l' },
  { key: 'M', i18nKey: 'recordatorio_dia_m' },
  { key: 'X', i18nKey: 'recordatorio_dia_x' },
  { key: 'J', i18nKey: 'recordatorio_dia_j' },
  { key: 'V', i18nKey: 'recordatorio_dia_v' },
  { key: 'S', i18nKey: 'recordatorio_dia_s' },
  { key: 'D', i18nKey: 'recordatorio_dia_d' },
]

interface RecordatorioFormModalProps {
  mode: 'create' | 'edit'
  initial?: ReminderInput
  onClose: () => void
  onSubmit: (input: Omit<ReminderInput, 'id'>) => Promise<void> | Promise<number | void>
}

function emptyForm(): Omit<ReminderInput, 'id'> {
  return {
    titulo: '',
    descripcion: '',
    hora: '09:00:00',
    recurrente: true,
    diasSemana: ['L', 'M', 'X', 'J', 'V'],
    fechaUnica: null,
    activo: true,
  }
}

export function RecordatorioFormModal({ mode, initial, onClose, onSubmit }: RecordatorioFormModalProps) {
  const { showToast } = useToast()
  const [form, setForm] = useState<Omit<ReminderInput, 'id'>>(() => {
    if (initial) {
      return {
        titulo: initial.titulo,
        descripcion: initial.descripcion ?? '',
        hora: initial.hora,
        recurrente: initial.recurrente,
        diasSemana: initial.diasSemana ?? [],
        fechaUnica: initial.fechaUnica ?? null,
        activo: initial.activo,
      }
    }
    return emptyForm()
  })

  const toggleDay = (key: 'L' | 'M' | 'X' | 'J' | 'V' | 'S' | 'D') => {
    setForm((f) => {
      const set = new Set(f.diasSemana ?? [])
      if (set.has(key)) set.delete(key)
      else set.add(key)
      return { ...f, diasSemana: Array.from(set) }
    })
  }

  const validate = (): string | null => {
    if (!form.titulo.trim()) return t('recordatorio_titulo_required')
    if (form.recurrente) {
      if (!form.diasSemana || form.diasSemana.length === 0) return t('recordatorio_dias_required')
    } else {
      if (!form.fechaUnica) return t('recordatorio_fecha_required')
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const error = validate()
    if (error) {
      showToast(error, 'error')
      return
    }
    const payload: Omit<ReminderInput, 'id'> = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion?.trim() || null,
      hora: form.hora,
      recurrente: form.recurrente,
      diasSemana: form.recurrente ? form.diasSemana : null,
      fechaUnica: form.recurrente ? null : form.fechaUnica,
      activo: form.activo,
    }
    await onSubmit(payload)
  }

  return (
    <div className="sobre-modal-backdrop" role="presentation">
      <form className="sobre-modal recordatorio-form" onSubmit={handleSubmit}>
        <header className="sobre-modal-header">
          <h2>{t(mode === 'create' ? 'recordatorio_modal_title_new' : 'recordatorio_modal_title_edit')}</h2>
          <button type="button" onClick={onClose}>{t('btn_close')}</button>
        </header>

        <label>
          <span>{t('recordatorio_titulo')}</span>
          <input
            type="text"
            value={form.titulo}
            onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
            maxLength={60}
            required
            className="recordatorio-input"
          />
        </label>

        <label>
          <span>{t('recordatorio_descripcion')}</span>
          <textarea
            value={form.descripcion ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            maxLength={200}
            className="recordatorio-input"
            rows={2}
          />
        </label>

        <div className="recordatorio-form-row">
          <label className="recordatorio-flex-label">
            <span>{t('recordatorio_hora')}</span>
            <input
              type="time"
              value={form.hora.slice(0, 5)}
              onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value + ':00' }))}
              required
              className="recordatorio-input"
            />
          </label>
        </div>

        {/* Botones segmentados */}
        <div className="recordatorio-segmented">
          <button
            type="button"
            className={`recordatorio-seg-btn ${form.recurrente ? 'recordatorio-seg-btn--active' : ''}`}
            onClick={() => setForm((f) => ({ ...f, recurrente: true }))}
          >
            {t('recordatorio_repetir')}
          </button>
          <button
            type="button"
            className={`recordatorio-seg-btn ${!form.recurrente ? 'recordatorio-seg-btn--active' : ''}`}
            onClick={() => setForm((f) => ({ ...f, recurrente: false }))}
          >
            {t('recordatorio_una_vez')}
          </button>
        </div>

        {form.recurrente ? (
          <div>
            <span className="recordatorio-label-text">
              {t('recordatorio_dias')}
            </span>
            <div className="recordatorio-days-container">
              {DAYS.map((d) => {
                const isActive = (form.diasSemana ?? []).includes(d.key)
                return (
                  <button
                    key={d.key}
                    type="button"
                    className={`recordatorio-day-pill ${isActive ? 'recordatorio-day-pill--active' : ''}`}
                    onClick={() => toggleDay(d.key)}
                  >
                    {t(d.i18nKey)}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <label className="recordatorio-flex-label">
            <span>{t('recordatorio_fecha')}</span>
            <input
              type="date"
              value={form.fechaUnica ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, fechaUnica: e.target.value }))}
              required
              className="recordatorio-input"
            />
          </label>
        )}

        <div className="recordatorio-form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t('btn_cancel')}
          </button>
          <button type="submit" className="primary">
            {t('recordatorio_save')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default RecordatorioFormModal
