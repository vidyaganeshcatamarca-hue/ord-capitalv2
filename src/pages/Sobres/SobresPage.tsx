import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/lib/format'
import { parseError, t } from '@/locales/i18n'
import { SobreCard } from '@/components/sobres/SobreCard'
import { SobreDetail } from '@/components/sobres/SobreDetail'
import { SobreFormModal } from '@/components/sobres/SobreFormModal'
import { SobreTransferModal } from '@/components/sobres/SobreTransferModal'
import { RespaldoFisicoPanel } from '@/components/sobres/RespaldoFisicoPanel'
import type { BilleteraOperativa, Sobre, TransferMode } from '@/components/sobres/types'
import './SobresPage.css'

type Mode = 'dashboard' | 'detail' | 'backup'

interface TransferState {
  mode: TransferMode
  sobre: Sobre
  initialAmount?: number | null
}

function normalizeSobre(row: any): Sobre {
  return {
    fondo_id: Number(row.fondo_id),
    nombre: String(row.nombre ?? ''),
    saldo_actual: Number(row.saldo_actual ?? 0),
    monto_meta: Number(row.monto_meta ?? 0),
    porcentaje_progreso: Number(row.porcentaje_progreso ?? 0),
    dias_restantes: Number(row.dias_restantes ?? 0),
    estado_alerta_key: String(row.estado_alerta_key ?? 'state_in_progress'),
  }
}

function normalizeWallet(row: any): BilleteraOperativa {
  return {
    billetera_id: Number(row.billetera_id),
    nombre: String(row.nombre ?? ''),
    moneda: String(row.moneda ?? 'ARS'),
    saldo_actual: Number(row.saldo_actual ?? 0),
    es_fondo_prevision: Boolean(row.es_fondo_prevision),
    icono: row.icono ?? null,
  }
}

export function SobresPage() {
  const { showToast } = useToast()
  const [mode, setMode] = useState<Mode>('dashboard')
  const [sobres, setSobres] = useState<Sobre[]>([])
  const [billeteras, setBilleteras] = useState<BilleteraOperativa[]>([])
  const [selected, setSelected] = useState<Sobre | null>(null)
  const [formTarget, setFormTarget] = useState<Sobre | null | 'new'>(null)
  const [transfer, setTransfer] = useState<TransferState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [fondosRes, billeterasRes] = await Promise.all([
        supabase.rpc('fn_reporte_estado_fondos_prevision'),
        supabase.rpc('fn_obtener_billeteras_activas'),
      ])
      if (fondosRes.error) throw fondosRes.error
      if (billeterasRes.error) throw billeterasRes.error

      const baseSobres = Array.isArray(fondosRes.data) ? fondosRes.data.map(normalizeSobre) : []
      const enriched = await Promise.all(baseSobres.map(async (sobre) => {
        const { data, error: cuotaError } = await supabase.rpc('fn_calcular_cuota_sobre', { p_billetera_id: sobre.fondo_id })
        if (cuotaError || !Array.isArray(data) || data.length === 0) return sobre
        const row = data[0]
        return {
          ...sobre,
          cuota_sugerida: Number(row.cuota_sugerida ?? 0),
          monto_faltante: Number(row.monto_faltante ?? 0),
          meses_restantes: Number(row.meses_restantes ?? 0),
        }
      }))
      setSobres(enriched)
      setBilleteras((Array.isArray(billeterasRes.data) ? billeterasRes.data : []).map(normalizeWallet))

      setSelected((current) => {
        if (!current) return null
        return enriched.find((sobre) => sobre.fondo_id === current.fondo_id) ?? null
      })
    } catch (err) {
      const message = parseError(err) || t('error_generic')
      setError(message)
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const operativas = useMemo(() => billeteras.filter((wallet) => !wallet.es_fondo_prevision), [billeteras])
  const totalSaved = useMemo(() => sobres.reduce((sum, sobre) => sum + sobre.saldo_actual, 0), [sobres])

  const handleSelect = (sobre: Sobre) => {
    setSelected(sobre)
    setMode('detail')
    haptics.light()
  }

  const handleArchive = async (sobre: Sobre) => {
    try {
      const { error: archiveError } = await supabase.rpc('fn_archivar_fondo_prevision', { p_billetera_id: sobre.fondo_id })
      if (archiveError) throw archiveError
      showToast(t('sobres_archived'), 'success')
      haptics.success()
      await loadData()
    } catch (err) {
      showToast(parseError(err), 'error')
      haptics.error()
    }
  }

  if (loading) {
    return (
      <main className="page sobres-page sobres-page--center" aria-busy="true">
        <div className="sobres-spinner" aria-hidden="true" />
        <p>{t('loading')}</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page sobres-page sobres-page--center" role="alert">
        <p>{error}</p>
        <button type="button" className="sobres-primary" onClick={loadData}>{t('health_retry')}</button>
      </main>
    )
  }

  return (
    <main className="page sobres-page">
      <header className="sobres-header">
        <div>
          <p className="sobres-kicker">{t('menu_sobres')}</p>
          <h1>{t('sobres_title')}</h1>
          <p>{t('sobres_subtitle')}</p>
        </div>
        <div className="sobres-header-actions">
          <button type="button" className="sobres-secondary" onClick={() => setMode(mode === 'backup' ? 'dashboard' : 'backup')}>{t('sobres_backup_title')}</button>
          <button type="button" className="sobres-primary" onClick={() => setFormTarget('new')}>{t('sobres_new')}</button>
        </div>
      </header>

      <section className="sobres-summary" aria-label={t('sobres_title')}>
        <article>
          <span>{t('sobres_total_saved')}</span>
          <strong>{formatCurrency(totalSaved)}</strong>
        </article>
        <article>
          <span>{t('sobres_active_goals')}</span>
          <strong>{sobres.length}</strong>
        </article>
      </section>

      {mode === 'backup' ? (
        <RespaldoFisicoPanel sobres={sobres} billeteras={operativas} onSuccess={loadData} />
      ) : mode === 'detail' && selected ? (
        <SobreDetail
          sobre={selected}
          onBack={() => setMode('dashboard')}
          onProvision={(sobre) => setTransfer({ mode: 'provision', sobre, initialAmount: sobre.cuota_sugerida })}
          onRescue={(sobre) => setTransfer({ mode: 'rescue', sobre })}
          onEdit={(sobre) => setFormTarget(sobre)}
        />
      ) : sobres.length === 0 ? (
        <section className="sobres-empty">
          <h2>{t('sobres_empty_title')}</h2>
          <p>{t('sobres_empty_text')}</p>
          <button type="button" className="sobres-primary" onClick={() => setFormTarget('new')}>{t('sobres_new')}</button>
        </section>
      ) : (
        <section className="sobres-list">
          {sobres.map((sobre) => (
            <SobreCard
              key={sobre.fondo_id}
              sobre={sobre}
              onSelect={handleSelect}
              onProvision={(item) => setTransfer({ mode: 'provision', sobre: item, initialAmount: item.cuota_sugerida })}
              onRescue={(item) => setTransfer({ mode: 'rescue', sobre: item })}
              onEdit={(item) => setFormTarget(item)}
              onArchive={handleArchive}
            />
          ))}
        </section>
      )}

      <SobreFormModal
        isOpen={formTarget !== null}
        sobre={formTarget === 'new' ? null : formTarget}
        onClose={() => setFormTarget(null)}
        onSuccess={loadData}
      />
      <SobreTransferModal
        isOpen={transfer !== null}
        mode={transfer?.mode ?? 'provision'}
        sobre={transfer?.sobre ?? null}
        billeteras={operativas}
        initialAmount={transfer?.initialAmount}
        onClose={() => setTransfer(null)}
        onSuccess={loadData}
      />
    </main>
  )
}

export default SobresPage
