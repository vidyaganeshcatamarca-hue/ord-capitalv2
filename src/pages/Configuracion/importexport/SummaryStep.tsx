// src/pages/Configuracion/importexport/SummaryStep.tsx
// Wizard step 5 (summary) for the Importar/Exportar feature: inserted/failed/
// discarded counters, created-entity counts, failed-rows CSV download and the
// full reset ("import another file"). Extracted from ImportarExportarPage so
// the page stays within the reviewable size guard.

import { t } from '@/locales/i18n'
import { rowsToCsv } from '@/lib/importExport/csv'
import type { ImportExecutionResult } from '@/lib/importExport/execute'
import type { MappedRows } from '@/lib/importExport/schema'
import './SummaryStep.css'

/** Technical artifact name (not user copy): the re-importable failed-rows file. */
const FAILED_ROWS_FILENAME = 'ordcapital_import_fallidas.csv'

interface SummaryStepProps {
  result: ImportExecutionResult
  table: MappedRows
  discarded: number
  onReset: () => void
}

/** Blob + anchor download of the original columns plus an error column, so the
 * user can fix and re-import the failed rows. */
function downloadFailedRows(table: MappedRows, result: ImportExecutionResult): void {
  const header = [...table.headers, t('config_ie_summary_failed_error_col')]
  const dataRows = result.failures.map((failure) => {
    const source = table.rows[failure.index] ?? []
    const errorKey = failure.errorKey || 'config_ie_error_row_import_failed'
    return [...source, t(errorKey)]
  })
  const csv = rowsToCsv([header, ...dataRows])

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = FAILED_ROWS_FILENAME
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function SummaryStep({ result, table, discarded, onReset }: SummaryStepProps) {
  return (
    <div className="config-ie-summary">
      <div className="config-ie-summary-counts">
        <div className="config-ie-summary-card">
          <span className="config-ie-summary-card-value">{result.inserted}</span>
          <span className="config-ie-summary-card-label">{t('config_ie_summary_inserted')}</span>
        </div>
        <div
          className={`config-ie-summary-card ${
            result.failed > 0 ? 'config-ie-summary-card--error' : ''
          }`}
        >
          <span className="config-ie-summary-card-value">{result.failed}</span>
          <span className="config-ie-summary-card-label">{t('config_ie_summary_failed')}</span>
        </div>
        <div className="config-ie-summary-card">
          <span className="config-ie-summary-card-value">{discarded}</span>
          <span className="config-ie-summary-card-label">{t('config_ie_summary_discarded')}</span>
        </div>
        {result.excludedCount > 0 && (
          <div className="config-ie-summary-card">
            <span className="config-ie-summary-card-value">{result.excludedCount}</span>
            <span className="config-ie-summary-card-label">{t('config_ie_summary_excluded')}</span>
          </div>
        )}
      </div>

      <section className="config-ie-summary-entities">
        <h3 className="config-ie-summary-section-title">{t('config_ie_summary_entities_title')}</h3>
        <dl className="config-ie-summary-entity-list">
          <div className="config-ie-summary-entity-row">
            <dt>{t('config_ie_summary_wallets_created')}</dt>
            <dd>{result.walletsCreated}</dd>
          </div>
          <div className="config-ie-summary-entity-row">
            <dt>{t('config_ie_summary_cats_parent_created')}</dt>
            <dd>{result.parentsCreated}</dd>
          </div>
          <div className="config-ie-summary-entity-row">
            <dt>{t('config_ie_summary_cats_sub_created')}</dt>
            <dd>{result.subsCreated}</dd>
          </div>
        </dl>
      </section>

      <div className="config-ie-summary-actions">
        {result.failed > 0 && (
          <button
            type="button"
            className="config-ie-btn-ghost"
            onClick={() => downloadFailedRows(table, result)}
          >
            {t('config_ie_summary_download_failed')}
          </button>
        )}
        <button type="button" className="config-ie-btn-primary" onClick={onReset}>
          {t('config_ie_summary_retry')}
        </button>
      </div>
    </div>
  )
}

export default SummaryStep
