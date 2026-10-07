import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'
import './ImportarExportarPage.css'

type TabKey = 'import' | 'export'
type RangeKey = 'current' | 'previous' | 'custom'

interface SelectedFile {
  name: string
  size: number
}

const RANGE_OPTIONS: Array<{ key: RangeKey; labelKey: string }> = [
  { key: 'current', labelKey: 'config_ie_export_range_current' },
  { key: 'previous', labelKey: 'config_ie_export_range_previous' },
  { key: 'custom', labelKey: 'config_ie_export_range_custom' },
]

/** Read the raw file bytes into memory. No parsing happens here (T3 owns it). */
function readFileBytes(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject({ key: 'config_ie_import_read_error' })
    reader.readAsArrayBuffer(file)
  })
}

function formatFileSize(bytes: number): string {
  const kb = bytes / 1024
  return new Intl.NumberFormat(undefined, {
    style: 'unit',
    unit: kb >= 1024 ? 'megabyte' : 'kilobyte',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(kb >= 1024 ? kb / 1024 : kb)
}

export function ImportarExportarPage() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<TabKey>('import')
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [range, setRange] = useState<RangeKey>('current')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const bytesRef = useRef<ArrayBuffer | null>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const bytes = await readFileBytes(file)
      bytesRef.current = bytes
      setSelectedFile({ name: file.name, size: file.size })
    } catch (err) {
      showToast(parseError(err), 'error')
    }
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    void handleFile(e.target.files?.[0])
  }

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    void handleFile(e.dataTransfer.files?.[0])
  }

  return (
    <main className="page config-page" aria-labelledby="import-export-title">
      <ConfigBackButton />
      <header className="config-page-header">
        <h1 id="import-export-title">{t('config_ie_title')}</h1>
        <p>{t('config_ie_desc')}</p>
      </header>

      <section className="config-section-list" aria-label={t('config_ie_title')}>
        <div className="config-ie-tabs" role="tablist" aria-label={t('config_ie_title')}>
          <button
            type="button"
            role="tab"
            id="ie-tab-import"
            aria-selected={tab === 'import'}
            aria-controls="ie-panel-import"
            className={`config-ie-tab ${tab === 'import' ? 'config-ie-tab--active' : ''}`}
            onClick={() => setTab('import')}
          >
            {t('config_ie_tab_import')}
          </button>
          <button
            type="button"
            role="tab"
            id="ie-tab-export"
            aria-selected={tab === 'export'}
            aria-controls="ie-panel-export"
            className={`config-ie-tab ${tab === 'export' ? 'config-ie-tab--active' : ''}`}
            onClick={() => setTab('export')}
          >
            {t('config_ie_tab_export')}
          </button>
        </div>

        {tab === 'import' ? (
          <article
            id="ie-panel-import"
            role="tabpanel"
            aria-labelledby="ie-tab-import"
            className="config-section-card"
          >
            <h2>{t('config_ie_tab_import')}</h2>
            <label
              className="config-ie-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".csv,.tsv,.xlsx"
                className="config-ie-file-input"
                onChange={handleInputChange}
              />
              <span className="config-ie-dropzone-icon" aria-hidden="true">📥</span>
              <span>{t('config_ie_import_filedrop_hint')}</span>
            </label>

            {selectedFile && (
              <div className="config-section-row">
                <span>{t('config_ie_import_selected')}</span>
                <span>{selectedFile.name} · {formatFileSize(selectedFile.size)}</span>
              </div>
            )}

            {/* NEXT STEP (T3): parse + mapping */}
          </article>
        ) : (
          <article
            id="ie-panel-export"
            role="tabpanel"
            aria-labelledby="ie-tab-export"
            className="config-section-card"
          >
            <h2>{t('config_ie_tab_export')}</h2>
            <p>{t('config_ie_export_title_hint')}</p>

            <div className="config-ie-range" role="radiogroup" aria-label={t('config_ie_export_title_hint')}>
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={range === opt.key}
                  className={`config-ie-range-btn ${range === opt.key ? 'config-ie-range-btn--active' : ''}`}
                  onClick={() => setRange(opt.key)}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>

            {range === 'custom' && (
              <div className="config-ie-range-dates">
                <label>
                  <span>{t('home_filter_from')}</span>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </label>
                <label>
                  <span>{t('home_filter_to')}</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </label>
              </div>
            )}

            <button type="button" className="config-section-save" disabled>
              {t('config_ie_tab_export')}
            </button>
            <p className="config-ie-hint">{t('config_ie_export_btn_disabled_hint')}</p>

            {/* NEXT STEP (T5): build workbook + download */}
          </article>
        )}
      </section>
    </main>
  )
}

export default ImportarExportarPage
