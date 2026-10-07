// src/pages/Configuracion/importexport/ExportPanel.tsx
// Export tab (spec §5) for the Importar/Exportar feature: range picker (current
// / previous / custom) + format choice (XLSX / CSV), one fetch of
// fn_exportar_movimientos and one download per Generate click.
//
// Data flow: RPC rows -> buildCanonicalRows (prefs-formatted) -> downloadExport
// (Capacitor share on native, Blob + anchor on web). The heavy libs (xlsx,
// @capacitor/filesystem, @capacitor/share) are dynamically imported inside
// exportFile.ts, never here.
//
// Telemetry: import_export_action {direction: 'export', format, rows} fires ONLY
// when a file was actually generated with rows > 0 (spec §6, MEDIUM). An empty
// range is a user-facing message, not an event.

import { useMemo, useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import { TELEMETRY_PRIORITY, telemetry } from '@/lib/telemetry'
import {
  buildCanonicalRows,
  downloadExport,
  exportFileName,
  resolveRangeBounds,
} from '@/lib/importExport/exportFile'
import type {
  ExportFormat,
  ExportPrefs,
  ExportRangeKey,
  ExportRpcRow,
} from '@/lib/importExport/exportFile'
import './ExportPanel.css'

const RANGE_OPTIONS: ReadonlyArray<{ key: ExportRangeKey; labelKey: string }> = [
  { key: 'current', labelKey: 'config_ie_export_range_current' },
  { key: 'previous', labelKey: 'config_ie_export_range_previous' },
  { key: 'custom', labelKey: 'config_ie_export_range_custom' },
]

const FORMAT_OPTIONS: ReadonlyArray<{ key: ExportFormat; labelKey: string }> = [
  { key: 'xlsx', labelKey: 'config_ie_export_format_xlsx' },
  { key: 'csv', labelKey: 'config_ie_export_format_csv' },
]

/** Column order of the exported file (spec §3 canonical schema). The labels are
 * the mapping-step labels, which parser.ts recognizes for fecha/tipo/monto/
 * cuenta/detalle on re-import. */
const EXPORT_COLUMN_LABEL_KEYS: readonly string[] = [
  'config_ie_map_field_fecha',
  'config_ie_map_field_tipo',
  'config_ie_map_field_monto',
  'config_ie_map_field_billetera_origen',
  'config_ie_map_field_billetera_destino',
  'config_ie_map_field_cuenta',
  'config_ie_map_field_detalle',
]

interface ExportPanelProps {
  /** Regional prefs already loaded by the page (READ ONLY). */
  prefs: ExportPrefs
}

export function ExportPanel({ prefs }: ExportPanelProps) {
  const { showToast } = useToast()
  const [range, setRange] = useState<ExportRangeKey>('current')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [busy, setBusy] = useState(false)

  const bounds = useMemo(
    () => resolveRangeBounds(range, customFrom, customTo),
    [range, customFrom, customTo]
  )

  const canGenerate = bounds !== null && !busy

  const handleGenerate = async () => {
    if (!bounds || busy) return
    setBusy(true)
    try {
      const data = await rpc<ExportRpcRow[]>('fn_exportar_movimientos', {
        p_fecha_inicio: bounds.from,
        p_fecha_fin: bounds.to,
      })
      const rpcRows = Array.isArray(data) ? data : []
      if (rpcRows.length === 0) {
        showToast(t('config_ie_export_empty'), 'info')
        return
      }

      const rows = buildCanonicalRows(rpcRows, prefs)
      const headers = EXPORT_COLUMN_LABEL_KEYS.map((key) => t(key))
      await downloadExport({
        rows,
        headers,
        format,
        filename: exportFileName(bounds.from, bounds.to, format),
        prefs,
        sheetName: t('config_ie_export_sheet_name'),
      })

      telemetry.track(
        'import_export_action',
        { direction: 'export', format, rows: rows.length },
        TELEMETRY_PRIORITY.MEDIUM
      )
      showToast(t('config_ie_export_success', { count: rows.length }), 'success')
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="config-ie-export">
      <div
        className="config-ie-range"
        role="radiogroup"
        aria-label={t('config_ie_export_title_hint')}
      >
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={range === option.key}
            className={`config-ie-range-btn ${range === option.key ? 'config-ie-range-btn--active' : ''}`}
            onClick={() => setRange(option.key)}
          >
            {t(option.labelKey)}
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
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </label>
        </div>
      )}

      <div className="config-ie-map-option">
        <span className="config-ie-map-option-label">{t('config_ie_export_format_label')}</span>
        <div
          className="config-ie-pill-group"
          role="radiogroup"
          aria-label={t('config_ie_export_format_label')}
        >
          {FORMAT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={format === option.key}
              className={`config-ie-pill ${format === option.key ? 'config-ie-pill--active' : ''}`}
              onClick={() => setFormat(option.key)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="config-section-save"
        disabled={!canGenerate}
        onClick={() => void handleGenerate()}
      >
        {t('config_ie_export_generate')}
      </button>

      {busy && <p className="config-ie-hint">{t('config_loading')}</p>}
      {range === 'custom' && bounds === null && (
        <p className="config-ie-hint">{t('config_ie_export_custom_hint')}</p>
      )}
    </div>
  )
}

export default ExportPanel
