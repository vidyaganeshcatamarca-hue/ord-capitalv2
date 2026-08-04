import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useHogar } from '@/contexts/HogarContext'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { SaldarBalanceModal } from '@/components/SaldarBalanceModal/SaldarBalanceModal'
import { DetalleBalanceModal } from '@/components/DetalleBalanceModal/DetalleBalanceModal'
import { ProyectoFormModal } from '@/components/ProyectoFormModal/ProyectoFormModal'
import { AportarProyectoModal } from '@/components/AportarProyectoModal/AportarProyectoModal'
import { ConfigHogar } from '@/components/ConfigHogar/ConfigHogar'
import { FeedView } from '@/components/familia/FeedView'
import { ProyectoIcon } from '@/components/ProyectoIcon'
import './FamiliaPage.css'

type FamiliaTab = 'dashboard' | 'actividad' | 'proyectos' | 'config'

interface BalanceHogar {
  deudor_nombre: string | null
  acreedor_nombre: string | null
  monto_deuda: number
}

interface EventoHogar {
  evento_id: number
  tipo_evento: string
  fecha: string
  monto: number
  descripcion: string | null
  rubro: string | null
  pagado_por: string | null
  direccion: string | null
  nombre_proyecto: string | null
}

interface ProyectoHogar {
  proyecto_id: number
  nombre_proyecto: string
  icono: string
  presupuesto_meta: number
  fecha_objetivo: string | null
  total_aportado: number
  porcentaje_progreso: number
  aportes_creador: number
  aportes_invitado: number
  dias_restantes: number | null
  estado_alerta_key: string
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

const getEventoLabel = (tipoEvento: string) => {
  if (tipoEvento === 'gasto_compartido') return t('hogar_timeline_tipo_gasto')
  if (tipoEvento === 'conciliacion') return t('hogar_timeline_conciliacion_tipo')
  if (tipoEvento === 'abono') return t('hogar_timeline_tipo_pago')
  return t('hogar_timeline_tipo_gasto')
}

export function FamiliaPage() {
  const { estado, loading: loadingHogar } = useHogar()
  const { showToast } = useToast()

  const [activeTab, setActiveTab] = useState<FamiliaTab>('dashboard')
  const [balances, setBalances] = useState<BalanceHogar[]>([])
  const [feed, setFeed] = useState<EventoHogar[]>([])
  const [proyectos, setProyectos] = useState<ProyectoHogar[]>([])
  const [loading, setLoading] = useState(true)
  const [showSaldar, setShowSaldar] = useState(false)
  const [showDetalle, setShowDetalle] = useState(false)
  const [showProyectoForm, setShowProyectoForm] = useState(false)
  const [proyectoAportar, setProyectoAportar] = useState<ProyectoHogar | null>(null)

  const cargarDatos = useCallback(async () => {
    if (!estado?.tiene_pareja) {
      setBalances([])
      setFeed([])
      setProyectos([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [rBalances, rFeed, rProyectos] = await Promise.all([
        supabase.rpc('fn_reporte_hogar_balances'),
        supabase.rpc('fn_reporte_hogar_feed'),
        supabase.rpc('fn_reporte_proyectos_compartidos'),
      ])

      if (rBalances.error) throw rBalances.error
      if (rFeed.error) throw rFeed.error
      if (rProyectos.error) throw rProyectos.error

      setBalances(((rBalances.data ?? []) as any[]).map((item) => ({
        deudor_nombre: item.deudor_nombre ?? null,
        acreedor_nombre: item.acreedor_nombre ?? null,
        monto_deuda: Number(item.monto_deuda ?? 0),
      })))
      setFeed(((rFeed.data ?? []) as any[]).map((item) => ({
        evento_id: Number(item.evento_id),
        tipo_evento: item.tipo_evento ?? '',
        fecha: item.fecha ?? '',
        monto: Number(item.monto ?? 0),
        descripcion: item.descripcion ?? null,
        rubro: item.rubro ?? null,
        pagado_por: item.pagado_por ?? null,
        direccion: item.direccion ?? null,
        nombre_proyecto: item.nombre_proyecto ?? null,
      })))
      setProyectos(((rProyectos.data ?? []) as any[]).map((item) => ({
        proyecto_id: Number(item.proyecto_id),
        nombre_proyecto: item.nombre_proyecto ?? '',
        icono: item.icono ?? '🎯',
        presupuesto_meta: Number(item.presupuesto_meta ?? 0),
        fecha_objetivo: item.fecha_objetivo ?? null,
        total_aportado: Number(item.total_aportado ?? 0),
        porcentaje_progreso: Number(item.porcentaje_progreso ?? 0),
        aportes_creador: Number(item.aportes_creador ?? 0),
        aportes_invitado: Number(item.aportes_invitado ?? 0),
        dias_restantes: item.dias_restantes !== null ? Number(item.dias_restantes) : null,
        estado_alerta_key: item.estado_alerta_key ?? 'no_date',
      })))
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [estado?.tiene_pareja, showToast])

  useEffect(() => {
    cargarDatos()
    window.addEventListener('movement-added', cargarDatos)
    return () => window.removeEventListener('movement-added', cargarDatos)
  }, [cargarDatos])

  const balancePrincipal = balances[0]
  const isLoading = loadingHogar || loading

  return (
    <div className="page familia-page fade-in">
      <header className="familia-header">
        <div>
          <span className="familia-kicker">{t('familia_kicker')}</span>
          <h1 className="font-display">{t('familia_title')}</h1>
          <p>{t('familia_subtitle')}</p>
        </div>
      </header>

      <nav className="familia-tabs" aria-label={t('familia_tabs_label')}>
        {(['dashboard', 'actividad', 'proyectos', 'config'] as FamiliaTab[]).map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {t(`familia_tab_${tab}`)}
          </button>
        ))}
      </nav>

      {isLoading ? (
        <div className="familia-loading"><div className="spinner" /></div>
      ) : !estado?.tiene_pareja ? (
        <section className="familia-empty-card">
          <span className="familia-empty-icon">👥</span>
          <h2>{t('hogar_crear_invitacion')}</h2>
          <p>{t('hogar_balance_deshabilitado')}</p>
        </section>
      ) : activeTab === 'dashboard' ? (
        <section className="familia-grid">
          <article className="familia-card familia-balance-card">
            <span className="familia-card-label">{t('hogar_saldar_deuda_actual')}</span>
            {balancePrincipal && balancePrincipal.monto_deuda > 0 ? (
              <>
                <strong>{formatMoney(balancePrincipal.monto_deuda)}</strong>
                <p>{t('familia_balance_line', {
                  deudor: balancePrincipal.deudor_nombre || t('familia_integrante_generico'),
                  acreedor: balancePrincipal.acreedor_nombre || t('familia_integrante_generico'),
                })}</p>
                <button className="btn btn-primary" onClick={() => setShowSaldar(true)}>
                  {t('hogar_btn_saldar')}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowDetalle(true)}>
                  {t('familia_detalle_btn')}
                </button>
              </>
            ) : (
              <>
                <strong>{t('hogar_sin_deuda_titulo')}</strong>
                <p>{t('hogar_balance_equitativo')}</p>
              </>
            )}
          </article>

          <article className="familia-card familia-feed-card">
            <div className="familia-card-header">
              <span className="familia-card-label">{t('familia_feed_title')}</span>
            </div>
            {feed.length === 0 ? (
              <p className="familia-muted">{t('hogar_timeline_sin_eventos')}</p>
            ) : (
              <div className="familia-feed-list">
                {feed.slice(0, 8).map((evento) => (
                  <div key={`${evento.tipo_evento}-${evento.evento_id}`} className="familia-feed-item">
                    <span className="familia-feed-dot" />
                    <div>
                      <strong>{evento.descripcion || evento.rubro || getEventoLabel(evento.tipo_evento)}</strong>
                      <p>{evento.pagado_por ? t('hogar_timeline_pagado_por', { nombre: evento.pagado_por }) : evento.nombre_proyecto}</p>
                    </div>
                    <span className="familia-feed-amount">{formatMoney(evento.monto)}</span>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      ) : activeTab === 'actividad' ? (
        <FeedView eventosIniciales={feed} />
      ) : activeTab === 'proyectos' ? (
        <section className="familia-card">
          <div className="familia-card-header">
            <span className="familia-card-label">{t('familia_tab_proyectos')}</span>
            <button className="btn btn-secondary" onClick={() => setShowProyectoForm(true)}>
              {t('proyecto_crear_nuevo')}
            </button>
          </div>
          {proyectos.length === 0 ? (
            <p className="familia-muted">{t('familia_proyectos_empty')}</p>
          ) : (
            <div className="familia-proyectos-list">
              {proyectos.map((proyecto) => {
                const semaforoClass = `familia-proyecto-semaforo familia-proyecto-semaforo-${proyecto.estado_alerta_key}`
                return (
                  <div key={proyecto.proyecto_id} className="familia-proyecto-item">
                    <div className="familia-proyecto-head">
                      <ProyectoIcon name={proyecto.icono} size={18} className="familia-proyecto-icon" aria-hidden="true" />
                      <div className="familia-proyecto-title">
                        <strong>{proyecto.nombre_proyecto}</strong>
                        <p>
                          {formatMoney(proyecto.total_aportado)} / {formatMoney(proyecto.presupuesto_meta)}
                        </p>
                        <p className="familia-proyecto-aportes">
                          {t('hogar_integrantes_creador')}: {formatMoney(proyecto.aportes_creador)} ·{' '}
                          {t('hogar_integrantes_invitado')}: {formatMoney(proyecto.aportes_invitado)}
                        </p>
                      </div>
                      <span className={semaforoClass} aria-hidden="true" />
                    </div>
                    <div className="familia-progress">
                      <span style={{ width: `${Math.min(proyecto.porcentaje_progreso, 100)}%` }} />
                    </div>
                    <div className="familia-proyecto-foot">
                      <span className="familia-proyecto-fecha">
                        {proyecto.dias_restantes !== null
                          ? t('proyecto_dias_restantes', { dias: proyecto.dias_restantes })
                          : t('proyecto_sin_fecha')}
                      </span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setProyectoAportar(proyecto)}
                      >
                        {t('proyecto_aportar_btn')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      ) : (
        <ConfigHogar onChange={() => cargarDatos()} />
      )}

      {showSaldar && balancePrincipal && (
        <SaldarBalanceModal
          isOpen={showSaldar}
          onClose={() => setShowSaldar(false)}
          onSuccess={() => cargarDatos()}
          montoDeuda={balancePrincipal.monto_deuda}
          deudorNombre={balancePrincipal.deudor_nombre}
          acreedorNombre={balancePrincipal.acreedor_nombre}
        />
      )}

      {showDetalle && (
        <DetalleBalanceModal
          isOpen={showDetalle}
          onClose={() => setShowDetalle(false)}
        />
      )}

      <ProyectoFormModal
        isOpen={showProyectoForm}
        onClose={() => setShowProyectoForm(false)}
        onSuccess={() => cargarDatos()}
      />

      {proyectoAportar && (
        <AportarProyectoModal
          isOpen={!!proyectoAportar}
          onClose={() => setProyectoAportar(null)}
          onSuccess={() => cargarDatos()}
          proyectoId={proyectoAportar.proyecto_id}
          proyectoNombre={proyectoAportar.nombre_proyecto}
        />
      )}
    </div>
  )
}
