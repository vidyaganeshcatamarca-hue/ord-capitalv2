import { useCallback, useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { CarteraWidget, type InversionResumen } from '@/components/inversiones/CarteraWidget'
import { RendimientoRealWidget, type RendimientoData } from '@/components/inversiones/RendimientoRealWidget'
import { NuevaInversionModal, type BilleteraResumen } from '@/components/inversiones/NuevaInversionModal'
import { ActualizarValorModal } from '@/components/inversiones/ActualizarValorModal'
import { LiquidarInversionModal } from '@/components/inversiones/LiquidarInversionModal'
import { DetalleInversionView } from '@/components/inversiones/DetalleInversionView'
import { TrackRecordView } from '@/components/inversiones/TrackRecordView'
import { DistribucionView } from '@/components/inversiones/DistribucionView'
import { ConfigInflacionView } from '@/components/inversiones/ConfigInflacionView'
import './InversionesPage.css'

export type ActiveTab = 'cartera' | 'track' | 'distribucion' | 'inflacion'
export type PageMode = 'dashboard' | 'detail'

export interface Inversion extends InversionResumen {
  nombre_activo: string
  tipo_activo: 'plazo_fijo' | 'variable' | string
  monto_invertido_original: number
  valor_actual_teorico: number
  rendimiento_nominal: number
  rendimiento_real: number | null
  dias_desde_conciliacion: number
  estado_semaforo_key: 'green' | 'yellow' | 'red' | string
  estado_inversion: string
  tasa_anual_tna: number
  moneda: string
  fecha_inicio: string
  ultima_conciliacion: string
  monto_liquidado: number
}

export type RendimientoVsInflacion = RendimientoData

interface PatrimonioInversiones {
  total_pesos: number
  total_dolares: number
}

type WalletRpcRow = BilleteraResumen & {
  saldo_actual?: number | null
}

const EMPTY_RENDIMIENTO: RendimientoVsInflacion = {
  total_actual: 0,
  total_original: 0,
  rendimiento_nominal: 0,
  rendimiento_real: null,
  inflacion_disponible: false,
  mensaje_key: 'msg_configure_inflation',
  fuente_inflacion: 'desactivado',
}

function normalizeInversion(row: Partial<InversionResumen> & { monto_liquidado?: number | null }): Inversion {
  return {
    inversion_id: Number(row.inversion_id ?? 0),
    nombre_activo: row.nombre_activo || t('msg_no_investments'),
    tipo_activo: row.tipo_activo || 'otro',
    monto_invertido_original: Number(row.monto_invertido_original ?? 0),
    valor_actual_teorico: Number(row.valor_actual_teorico ?? 0),
    rendimiento_nominal: Number(row.rendimiento_nominal ?? 0),
    rendimiento_real: row.rendimiento_real === null || row.rendimiento_real === undefined
      ? null
      : Number(row.rendimiento_real),
    dias_desde_conciliacion: Number(row.dias_desde_conciliacion ?? 0),
    estado_semaforo_key: row.estado_semaforo_key || 'green',
    estado_inversion: row.estado_inversion || 'activa',
    tasa_anual_tna: Number(row.tasa_anual_tna ?? 0),
    moneda: row.moneda || 'ARS',
    fecha_inicio: row.fecha_inicio || '',
    ultima_conciliacion: row.ultima_conciliacion || '',
    monto_liquidado: Number(row.monto_liquidado ?? 0),
  }
}

function normalizePatrimonio(row: Partial<PatrimonioInversiones> | null): PatrimonioInversiones {
  return {
    total_pesos: Number(row?.total_pesos ?? 0),
    total_dolares: Number(row?.total_dolares ?? 0),
  }
}

function normalizeRendimiento(row: Partial<RendimientoVsInflacion> | null): RendimientoVsInflacion {
  return {
    total_actual: Number(row?.total_actual ?? 0),
    total_original: Number(row?.total_original ?? 0),
    rendimiento_nominal: Number(row?.rendimiento_nominal ?? 0),
    rendimiento_real: row?.rendimiento_real === null || row?.rendimiento_real === undefined
      ? null
      : Number(row.rendimiento_real),
    inflacion_disponible: Boolean(row?.inflacion_disponible),
    mensaje_key: row?.mensaje_key || 'msg_configure_inflation',
    fuente_inflacion: row?.fuente_inflacion || 'desactivado',
  }
}

function normalizeWallet(row: WalletRpcRow): BilleteraResumen {
  return {
    billetera_id: Number(row.billetera_id),
    nombre: row.nombre,
    saldo: Number(row.saldo ?? row.saldo_actual ?? 0),
    moneda: row.moneda,
  }
}

export function InversionesPage() {
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<ActiveTab>('cartera')
  const [mode, setMode] = useState<PageMode>('dashboard')
  const [selectedInversionId, setSelectedInversionId] = useState<number | null>(null)
  const [inversiones, setInversiones] = useState<Inversion[]>([])
  const [patrimonio, setPatrimonio] = useState<PatrimonioInversiones | null>(null)
  const [rendimiento, setRendimiento] = useState<RendimientoVsInflacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNueva, setShowNueva] = useState(false)
  const [updateTarget, setUpdateTarget] = useState<Inversion | null>(null)
  const [liquidateTarget, setLiquidateTarget] = useState<Inversion | null>(null)
  const [billeteras, setBilleteras] = useState<BilleteraResumen[]>([])
  const [detailRefreshKey, setDetailRefreshKey] = useState(0)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [carteraRes, patrimonioRes, rendimientoRes] = await Promise.all([
        rpc<Inversion[]>('fn_reporte_cartera_inversiones'),
        rpc<PatrimonioInversiones>('fn_reporte_patrimonio_inversiones', { p_cotizacion_usd: 1 }),
        rpc<RendimientoVsInflacion>('fn_reporte_rendimiento_vs_inflacion'),
      ])

      setInversiones((carteraRes || []).map(normalizeInversion))
      setPatrimonio(normalizePatrimonio(patrimonioRes))
      setRendimiento(normalizeRendimiento(rendimientoRes))
    } catch (err) {
      const message = parseError(err) || t('error_generic')
      setError(message)
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const loadBilleteras = useCallback(async () => {
    try {
      let data: WalletRpcRow[]
      try {
        data = await rpc<WalletRpcRow[]>('fn_obtener_billeteras_ordenadas_por_uso')
      } catch {
        data = await rpc<WalletRpcRow[]>('fn_obtener_billeteras_activas')
      }
      setBilleteras((data || []).map(normalizeWallet))
    } catch {
      setBilleteras([])
    }
  }, [])

  useEffect(() => {
    Promise.all([loadData(), loadBilleteras()])
  }, [loadData, loadBilleteras])

  const findInversion = (inversionId: number) =>
    inversiones.find((inv) => inv.inversion_id === inversionId) || null

  const handleSelect = (inversionId: number) => {
    setSelectedInversionId(inversionId)
    setMode('detail')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBack = () => {
    setMode('dashboard')
    setSelectedInversionId(null)
  }

  const handleUpdateValue = (inversionId: number) => {
    setUpdateTarget(findInversion(inversionId))
  }

  const handleLiquidate = (inversionId: number) => {
    setLiquidateTarget(findInversion(inversionId))
  }

  const handleNuevaSuccess = async () => {
    setShowNueva(false)
    await loadData()
  }

  const handleUpdateSuccess = async () => {
    setUpdateTarget(null)
    await loadData()
    setDetailRefreshKey((value) => value + 1)
  }

  const handleLiquidateSuccess = async () => {
    const liquidatedId = liquidateTarget?.inversion_id ?? null
    setLiquidateTarget(null)
    await loadData()
    if (selectedInversionId !== null && selectedInversionId === liquidatedId) {
      handleBack()
    }
  }

  const renderActiveTab = () => {
    if (mode === 'detail' && selectedInversionId !== null) {
      return (
        <DetalleInversionView
          key={`${selectedInversionId}-${detailRefreshKey}`}
          inversionId={selectedInversionId}
          onBack={handleBack}
          onUpdateValue={handleUpdateValue}
          onLiquidate={handleLiquidate}
        />
      )
    }

    if (activeTab === 'track') return <TrackRecordView />
    if (activeTab === 'distribucion') return <DistribucionView />
    if (activeTab === 'inflacion') return <ConfigInflacionView onSaved={loadData} />

    return (
      <CarteraWidget
        inversiones={inversiones}
        loading={loading}
        onNew={() => setShowNueva(true)}
        onSelect={handleSelect}
        onUpdateValue={handleUpdateValue}
        onLiquidate={handleLiquidate}
      />
    )
  }

  const selectTab = (tab: ActiveTab) => {
    setActiveTab(tab)
    setMode('dashboard')
    setSelectedInversionId(null)
  }

  if (loading && !rendimiento && !patrimonio && inversiones.length === 0) {
    return (
      <main className="inversiones-page page inversiones-page--loading" aria-busy="true">
        <div className="inversiones-spinner" aria-hidden="true" />
        <p>{t('loading')}</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="inversiones-page page inversiones-error" role="alert">
        <p>{t('error_generic')}</p>
        <button type="button" className="btn btn-secondary" onClick={loadData}>
          {t('btn_retry')}
        </button>
      </main>
    )
  }

  return (
    <main className="inversiones-page page">
      <RendimientoRealWidget
        totalPesos={patrimonio?.total_pesos ?? 0}
        totalDolares={patrimonio?.total_dolares ?? 0}
        rendimiento={rendimiento ?? EMPTY_RENDIMIENTO}
        loading={loading}
        onConfigureInflation={() => selectTab('inflacion')}
      />

      <section className="inversiones-toolbar">
        <button type="button" className="btn btn-primary font-semibold" onClick={() => setShowNueva(true)}>
          {t('btn_new')}
        </button>
      </section>

      <nav className="inversiones-tabs" role="tablist" aria-label={t('subtitle')}>
        {([
          ['cartera', 'tab_cartera'],
          ['track', 'tab_track_record'],
          ['distribucion', 'tab_distribucion'],
          ['inflacion', 'tab_inflacion'],
        ] as const).map(([tab, labelKey]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mode === 'dashboard' && activeTab === tab}
            className={
              mode === 'dashboard' && activeTab === tab
                ? 'inversiones-tab inversiones-tab--active'
                : 'inversiones-tab'
            }
            onClick={() => selectTab(tab)}
          >
            {t(labelKey)}
          </button>
        ))}
      </nav>

      <section className="inversiones-content">
        {renderActiveTab()}
      </section>

      <NuevaInversionModal
        isOpen={showNueva}
        onClose={() => setShowNueva(false)}
        onSuccess={handleNuevaSuccess}
        billeteras={billeteras}
      />
      <ActualizarValorModal
        isOpen={Boolean(updateTarget)}
        onClose={() => setUpdateTarget(null)}
        onSuccess={handleUpdateSuccess}
        inversion={updateTarget}
      />
      <LiquidarInversionModal
        isOpen={Boolean(liquidateTarget)}
        onClose={() => setLiquidateTarget(null)}
        onSuccess={handleLiquidateSuccess}
        inversion={liquidateTarget}
        billeteras={billeteras}
      />
    </main>
  )
}

export default InversionesPage
