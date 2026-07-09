import { useRef, useState } from 'react'
import { decryptJSON, exportCajaToCSV, type CajaRow } from '@/lib/crypto'
import { useToast } from '@/contexts/ToastContext'
import { t } from '@/locales/i18n'
import './BackupViewer.css'

type Section = 'resumen' | 'billeteras' | 'caja' | 'categorias' | 'inversiones' | 'tarjetas' | 'presupuestos'

const SECTIONS: { key: Section; labelKey: string }[] = [
  { key: 'resumen', labelKey: 'privacidad_viewer_section_resumen' },
  { key: 'billeteras', labelKey: 'privacidad_viewer_section_billeteras' },
  { key: 'caja', labelKey: 'privacidad_viewer_section_caja' },
  { key: 'categorias', labelKey: 'privacidad_viewer_section_categorias' },
  { key: 'inversiones', labelKey: 'privacidad_viewer_section_inversiones' },
  { key: 'tarjetas', labelKey: 'privacidad_viewer_section_tarjetas' },
  { key: 'presupuestos', labelKey: 'privacidad_viewer_section_presupuestos' },
]

interface BackupData {
  version?: string
  fecha_exportacion?: string
  usuario?: { nombre?: string; email?: string }
  billeteras?: any[]
  caja?: any[]
  estructuras_egresos?: any[]
  inversiones?: any[]
  tarjetas_credito?: any[]
  presupuestos_mensuales?: any[]
}

function normalizeCaja(rows: any[]): CajaRow[] {
  return rows.map((r) => ({
    fecha: String(r.fecha ?? ''),
    tipo: String(r.tipo ?? ''),
    origen: r.nombre_cuenta_historico ?? '',
    destino: '',
    ingreso: Number(r.valor_ingreso ?? 0),
    egreso: Number(r.valor_egreso ?? 0),
    detalle: String(r.detalle ?? ''),
  }))
}

export function BackupViewer() {
  const { showToast } = useToast()
  const [password, setPassword] = useState('')
  const [data, setData] = useState<BackupData | null>(null)
  const [section, setSection] = useState<Section>('resumen')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)
    if (!password) {
      setError(t('privacidad_viewer_password_label'))
      return
    }
    try {
      const text = await file.text()
      if (!text.includes('|')) {
        setError(t('privacidad_viewer_invalid_format'))
        return
      }
      const decoded = await decryptJSON(text, password)
      setData(decoded as BackupData)
      setSection('resumen')
    } catch {
      setError(t('privacidad_viewer_decrypt_error'))
    }
  }

  const handleCsv = () => {
    if (!data?.caja?.length) {
      showToast(t('privacidad_viewer_empty'), 'info')
      return
    }
    const csv = exportCajaToCSV(normalizeCaja(data.caja))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${t('privacidad_csv_filename')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const renderSection = () => {
    if (!data) return null
    if (section === 'resumen') {
      return (
        <p>
          {t('privacidad_viewer_summary', {
            fecha: data.fecha_exportacion ? new Date(data.fecha_exportacion).toLocaleString() : '—',
          })}
        </p>
      )
    }
    const rows = (data as any)[section] ?? []
    if (!rows.length) {
      return <p className="privacidad-viewer-empty">{t('privacidad_viewer_empty')}</p>
    }
    const cols = Object.keys(rows[0])
    return (
      <table className="privacidad-viewer-table">
        <thead>
          <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((r: any, i: number) => (
            <tr key={i}>
              {cols.map((c) => <td key={c}>{String(r[c] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <section className="privacidad-viewer" aria-labelledby="privacidad-viewer-title">
      <h2 id="privacidad-viewer-title">{t('privacidad_section_viewer')}</h2>
      <div className="privacidad-viewer-controls">
        <input
          ref={fileRef}
          type="file"
          accept=".backup,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
        <input
          type="password"
          placeholder={t('privacidad_viewer_password_label')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p style={{ color: '#FF6B6B', fontSize: '0.85rem' }} role="alert">{error}</p>}
      {data && (
        <>
          <div className="privacidad-viewer-tabs" role="tablist">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={section === s.key}
                className={`privacidad-viewer-tab ${section === s.key ? 'active' : ''}`}
                onClick={() => setSection(s.key)}
              >
                {t(s.labelKey)}
              </button>
            ))}
          </div>
          {renderSection()}
          {data.caja && data.caja.length > 0 && (
            <button type="button" className="privacidad-viewer-button" onClick={handleCsv}>
              {t('privacidad_viewer_csv')}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export default BackupViewer
