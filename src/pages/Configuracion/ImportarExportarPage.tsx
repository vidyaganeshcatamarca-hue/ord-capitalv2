import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import { telemetry, TELEMETRY_PRIORITY } from '@/lib/telemetry'
import {
  CANONICAL_FIELDS,
  MAPPING_GATE_FIELDS,
  SEPARATORS,
} from '@/lib/importExport/schema'
import type {
  CanonicalFieldId,
  FieldMapping,
  ImportUserPrefs,
  MappedRows,
  SepId,
  TipoSource,
} from '@/lib/importExport/schema'
import { parseUploadedFile } from '@/lib/importExport/parseWorkbook'
import {
  guessHeaderMapping,
  inferTipo,
  normalizeNombre,
  parseFecha,
  parseMonto,
  splitCuenta,
} from '@/lib/importExport/parser'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'
import './ImportarExportarPage.css'

type TabKey = 'import' | 'export'
type RangeKey = 'current' | 'previous' | 'custom'
// Wizard steps owned by this page: 'file' (pick + parse) -> 'map' (T3a).
// NEXT STEP (T3b): reconciliation adds a 'reconcile' step and entity blocks.
type WizardStep = 'file' | 'map'

interface SelectedFile {
  name: string
  size: number
}

interface PreviewCell {
  fieldId: CanonicalFieldId
  labelKey: string
  value: string
  error: boolean
}

const RANGE_OPTIONS: Array<{ key: RangeKey; labelKey: string }> = [
  { key: 'current', labelKey: 'config_ie_export_range_current' },
  { key: 'previous', labelKey: 'config_ie_export_range_previous' },
  { key: 'custom', labelKey: 'config_ie_export_range_custom' },
]

const SEPARATOR_LABEL_KEYS: Record<SepId, string> = {
  dash: 'config_ie_map_sep_dash',
  slash: 'config_ie_map_sep_slash',
  pipe: 'config_ie_map_sep_pipe',
}

// Regional prefs the wizard needs to parse dates/amounts. Defaults mirror
// RegionFormatoPage so the preview stays sane before the RPC resolves.
const DEFAULT_PREFS: ImportUserPrefs = {
  separador_miles: '.',
  separador_decimal: ',',
  formato_fecha: 'DD/MM/YYYY',
}

interface UserPrefsRow extends ImportUserPrefs {
  decimales_moneda_local?: number
}

/** Single reusable prefs READ. Same RPC RegionFormatoPage uses
 * (fn_obtener_preferencias_usuario); no writes happen here. */
async function loadImportPrefs(): Promise<ImportUserPrefs> {
  const data = await rpc<UserPrefsRow[]>('fn_obtener_preferencias_usuario')
  const row = Array.isArray(data) ? data[0] : data
  return { ...DEFAULT_PREFS, ...(row ?? {}) }
}

function labelKeyFor(fieldId: CanonicalFieldId): string {
  return CANONICAL_FIELDS.find((field) => field.id === fieldId)?.labelKey ?? fieldId
}

/** Read the raw file bytes into memory. Parsing lives in parseWorkbook.ts. */
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

/** Apply the current mapping to the first rows and surface per-cell parse
 * errors. Uses the same parser helpers the validate step will reuse. */
function buildPreviewRows(
  table: MappedRows,
  mapping: FieldMapping,
  sep: SepId,
  tipoSource: TipoSource,
  prefs: ImportUserPrefs
): PreviewCell[][] {
  const rawAt = (row: string[], fieldId: CanonicalFieldId): string => {
    const index = mapping[fieldId]
    return index === undefined ? '' : (row[index] ?? '')
  }

  return table.rows.slice(0, 3).map((row) => {
    const fechaRaw = rawAt(row, 'fecha')
    const fecha = parseFecha(fechaRaw, prefs)

    const montoRaw = rawAt(row, 'monto')
    const monto = parseMonto(montoRaw, prefs)

    const tipoRaw = rawAt(row, 'tipo')
    const tipo = inferTipo({ tipoRaw, valor: monto.valor })
    const tipoValue = tipo
      ? t(tipo === 'income' ? 'config_tipo_movimiento_ingreso' : 'config_tipo_movimiento_egreso')
      : ''
    const tipoError =
      tipoSource === 'column' ? tipoRaw !== '' && tipo === null : montoRaw !== '' && tipo === null

    const cuentaRaw = rawAt(row, 'cuenta')
    const cuenta = splitCuenta(cuentaRaw, sep)
    const cuentaValue =
      'error' in cuenta ? '' : cuenta.sub ? `${cuenta.padre} › ${cuenta.sub}` : cuenta.padre

    return [
      {
        fieldId: 'fecha',
        labelKey: labelKeyFor('fecha'),
        value: fecha ?? '',
        error: fechaRaw !== '' && fecha === null,
      },
      {
        fieldId: 'tipo',
        labelKey: labelKeyFor('tipo'),
        value: tipoValue,
        error: tipoError,
      },
      {
        fieldId: 'monto',
        labelKey: labelKeyFor('monto'),
        value: monto.valor === null ? '' : String(monto.valor),
        error: montoRaw !== '' && monto.valor === null,
      },
      {
        fieldId: 'billetera_origen',
        labelKey: labelKeyFor('billetera_origen'),
        value: normalizeNombre(rawAt(row, 'billetera_origen')),
        error: false,
      },
      {
        fieldId: 'cuenta',
        labelKey: labelKeyFor('cuenta'),
        value: cuentaValue,
        error: 'error' in cuenta,
      },
    ]
  })
}

export function ImportarExportarPage() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<TabKey>('import')
  const [step, setStep] = useState<WizardStep>('file')
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [table, setTable] = useState<MappedRows | null>(null)
  const [mapping, setMapping] = useState<FieldMapping>({})
  const [sep, setSep] = useState<SepId>('dash')
  const [tipoSource, setTipoSource] = useState<TipoSource>('column')
  const [prefs, setPrefs] = useState<ImportUserPrefs>(DEFAULT_PREFS)
  const [parsing, setParsing] = useState(false)
  const [range, setRange] = useState<RangeKey>('current')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const bytesRef = useRef<ArrayBuffer | null>(null)

  // One prefs fetch for the whole page (read-only).
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const loaded = await loadImportPrefs()
        if (!cancelled) setPrefs(loaded)
      } catch (err) {
        if (!cancelled) showToast(parseError(err), 'error')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setParsing(true)
    try {
      const bytes = await readFileBytes(file)
      const parsed = await parseUploadedFile(file.name, bytes)
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        showToast(t('config_ie_error_empty_file'), 'error')
        return
      }
      bytesRef.current = bytes
      setSelectedFile({ name: file.name, size: file.size })
      setTable(parsed)
      setMapping(guessHeaderMapping(parsed.headers).mapping)
      setSep('dash')
      setTipoSource('column')
      setStep('map')
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setParsing(false)
    }
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so picking the same file again (after Volver) still fires change.
    e.target.value = ''
    void handleFile(file)
  }

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    void handleFile(e.dataTransfer.files?.[0])
  }

  const updateMapping = (fieldId: CanonicalFieldId, raw: string) => {
    setMapping((prev) => {
      const next: FieldMapping = { ...prev }
      if (raw === '') {
        delete next[fieldId]
        return next
      }
      const index = Number(raw)
      // A header can only serve one field: steal it from any previous owner.
      for (const key of Object.keys(next) as CanonicalFieldId[]) {
        if (key !== fieldId && next[key] === index) delete next[key]
      }
      next[fieldId] = index
      return next
    })
  }

  const fieldIdForIndex = (index: number): CanonicalFieldId | undefined =>
    (Object.keys(mapping) as CanonicalFieldId[]).find((key) => mapping[key] === index)

  const gateRequired = useMemo(() => {
    const set = new Set<CanonicalFieldId>(MAPPING_GATE_FIELDS)
    if (tipoSource === 'column') set.add('tipo')
    return set
  }, [tipoSource])

  const canContinue = useMemo(
    () => Array.from(gateRequired).every((fieldId) => mapping[fieldId] !== undefined),
    [gateRequired, mapping]
  )

  const previewRows = useMemo(
    () => (table ? buildPreviewRows(table, mapping, sep, tipoSource, prefs) : []),
    [table, mapping, sep, tipoSource, prefs]
  )

  const handleContinue = () => {
    if (!canContinue) return
    const fieldsMapped = CANONICAL_FIELDS.reduce(
      (count, field) => count + (mapping[field.id] !== undefined ? 1 : 0),
      0
    )
    telemetry.track(
      'import_mapping_completed',
      { fields_mapped: fieldsMapped, sep, tipo_source: tipoSource },
      TELEMETRY_PRIORITY.LOW
    )
    // NEXT STEP (T3b): reconciliation — per-row status + NEW entity blocks.
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
            <h2>{step === 'map' ? t('config_ie_map_title') : t('config_ie_tab_import')}</h2>

            {step === 'file' ? (
              <>
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

                {parsing && <p className="config-ie-hint">{t('config_loading')}</p>}

                {selectedFile && (
                  <div className="config-section-row">
                    <span>{t('config_ie_import_selected')}</span>
                    <span>
                      {selectedFile.name} · {formatFileSize(selectedFile.size)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              table && (
                <>
                  <p className="config-ie-hint">{t('config_ie_map_columns_hint')}</p>

                  <div className="config-ie-map-grid">
                    {CANONICAL_FIELDS.map((field) => (
                      <div className="config-ie-map-row" key={field.id}>
                        <label className="config-ie-map-label" htmlFor={`ie-map-${field.id}`}>
                          <span>{t(field.labelKey)}</span>
                          {gateRequired.has(field.id) && (
                            <span className="config-ie-map-required" aria-hidden="true">*</span>
                          )}
                        </label>
                        <select
                          id={`ie-map-${field.id}`}
                          className="config-ie-map-select"
                          value={mapping[field.id] ?? ''}
                          onChange={(e) => updateMapping(field.id, e.target.value)}
                        >
                          <option value="">{t('config_ie_map_unassigned')}</option>
                          {table.headers.map((header, index) => {
                            const owner = fieldIdForIndex(index)
                            if (owner !== undefined && owner !== field.id) return null
                            return (
                              <option key={index} value={index}>
                                {header || t('config_ie_map_empty_header', { index: index + 1 })}
                              </option>
                            )
                          })}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="config-ie-map-options">
                    <div className="config-ie-map-option">
                      <span className="config-ie-map-option-label">{t('config_ie_map_sep_label')}</span>
                      <div
                        className="config-ie-pill-group"
                        role="radiogroup"
                        aria-label={t('config_ie_map_sep_label')}
                      >
                        {SEPARATORS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            role="radio"
                            aria-checked={sep === item.id}
                            className={`config-ie-pill ${sep === item.id ? 'config-ie-pill--active' : ''}`}
                            onClick={() => setSep(item.id)}
                          >
                            {t(SEPARATOR_LABEL_KEYS[item.id])}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="config-ie-map-option">
                      <span className="config-ie-map-option-label">{t('config_ie_map_tipo_label')}</span>
                      <div
                        className="config-ie-pill-group"
                        role="radiogroup"
                        aria-label={t('config_ie_map_tipo_label')}
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={tipoSource === 'column'}
                          className={`config-ie-pill ${tipoSource === 'column' ? 'config-ie-pill--active' : ''}`}
                          onClick={() => setTipoSource('column')}
                        >
                          {t('config_ie_map_tipo_columna')}
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={tipoSource === 'sign'}
                          className={`config-ie-pill ${tipoSource === 'sign' ? 'config-ie-pill--active' : ''}`}
                          onClick={() => setTipoSource('sign')}
                        >
                          {t('config_ie_map_tipo_signo')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {previewRows.length > 0 && (
                    <div className="config-ie-preview">
                      <h3 className="config-ie-preview-title">{t('config_ie_map_preview')}</h3>
                      <div className="config-ie-preview-scroll">
                        <table className="config-ie-preview-table">
                          <thead>
                            <tr>
                              {previewRows[0].map((cell) => (
                                <th key={cell.fieldId} scope="col">
                                  {t(cell.labelKey)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((row, rowIndex) => (
                              <tr key={rowIndex}>
                                {row.map((cell) => (
                                  <td
                                    key={cell.fieldId}
                                    className={
                                      cell.error ? 'config-ie-preview-cell--error' : undefined
                                    }
                                  >
                                    {cell.error ? t('config_ie_map_preview_error') : cell.value || '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="config-ie-actions">
                    <button
                      type="button"
                      className="config-ie-btn-ghost"
                      onClick={() => setStep('file')}
                    >
                      {t('config_ie_btn_back')}
                    </button>
                    <button
                      type="button"
                      className="config-ie-btn-primary"
                      disabled={!canContinue}
                      onClick={handleContinue}
                    >
                      {t('config_ie_btn_continue')}
                    </button>
                  </div>
                </>
              )
            )}
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
