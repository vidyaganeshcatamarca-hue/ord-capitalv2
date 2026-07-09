import { useState } from 'react'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { useToast } from '@/contexts/ToastContext'
import { t } from '@/locales/i18n'
import { formatRecurrence, type ReminderInput } from '@/lib/reminders'
import { RecordatorioFormModal } from './RecordatorioFormModal'
import './RecordatorioList.css'

interface RecordatorioListProps {
  reminders: ReminderInput[]
  onCreate: (input: Omit<ReminderInput, 'id'>) => Promise<number>
  onUpdate: (id: number, input: Omit<ReminderInput, 'id'>) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onToggle: (id: number, activo: boolean) => Promise<void>
}

export function RecordatorioList({ reminders, onCreate, onUpdate, onDelete, onToggle }: RecordatorioListProps) {
  const { showToast } = useToast()
  const [editing, setEditing] = useState<ReminderInput | null>(null)
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ReminderInput | null>(null)

  const handleToggle = async (r: ReminderInput) => {
    try {
      await onToggle(r.id, !r.activo)
    } catch (err) {
      showToast(t('error_generic'), 'error')
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      await onDelete(pendingDelete.id)
      showToast(t('recordatorio_eliminado'), 'success')
      setPendingDelete(null)
    } catch (err) {
      showToast(t('error_generic'), 'error')
    }
  }

  return (
    <div>
      <div className="recordatorio-header">
        <h3 style={{ margin: 0, color: '#4ecdc4', fontSize: '0.95rem' }}>{t('recordatorio_section_title')}</h3>
        <button type="button" className="recordatorio-add" onClick={() => setCreating(true)}>
          + {t('recordatorio_new')}
        </button>
      </div>

      {reminders.length === 0 ? (
        <p className="recordatorio-empty">{t('recordatorio_empty')}</p>
      ) : (
        <div className="recordatorio-list">
          {reminders.map((r) => (
            <div key={r.id} className="recordatorio-row">
              <input
                type="checkbox"
                checked={r.activo}
                onChange={() => handleToggle(r)}
                aria-label={t(r.activo ? 'recordatorio_activo' : 'recordatorio_inactivo')}
              />
              <div className="recordatorio-row-info">
                <h4>{r.titulo}</h4>
                <span>{formatRecurrence(r)}</span>
              </div>
              <button type="button" onClick={() => setEditing(r)} aria-label={t('recordatorio_edit')}>
                ✏️
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(r)}
                aria-label={t('recordatorio_delete')}
                style={{ color: '#ff6b6b' }}
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <RecordatorioFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            try {
              await onCreate(input)
              showToast(t('recordatorio_creado'), 'success')
              setCreating(false)
            } catch (err) {
              showToast(t('recordatorio_error_required'), 'error')
            }
          }}
        />
      )}

      {editing && (
        <RecordatorioFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            try {
              await onUpdate(editing.id, input)
              showToast(t('recordatorio_actualizado'), 'success')
              setEditing(null)
            } catch (err) {
              showToast(t('recordatorio_error_required'), 'error')
            }
          }}
        />
      )}

      <ConfirmModal
        isOpen={pendingDelete !== null}
        type="danger"
        title={t('recordatorio_confirm_delete_title')}
        message={t('recordatorio_confirm_delete_body')}
        confirmText={t('recordatorio_delete')}
        cancelText={t('btn_cancel')}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

export default RecordatorioList
