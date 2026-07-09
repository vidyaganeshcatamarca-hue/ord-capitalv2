import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import './FeedView.css'

type FiltroTipo = 'todos' | 'gasto' | 'abono' | 'conciliacion'

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

const PAGE_SIZE = 15

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatFecha(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function eventoLabel(tipo: string) {
  if (tipo === 'gasto_compartido') return t('hogar_timeline_tipo_gasto')
  if (tipo === 'abono') return t('hogar_timeline_tipo_pago')
  if (tipo === 'conciliacion') return t('hogar_timeline_conciliacion_tipo')
  return tipo
}

function eventoIcon(tipo: string) {
  if (tipo === 'gasto_compartido') return '🧾'
  if (tipo === 'abono') return '💸'
  if (tipo === 'conciliacion') return '🤝'
  return '🔔'
}

interface FeedViewProps {
  eventosIniciales?: EventoHogar[]
}

export function FeedView({ eventosIniciales }: FeedViewProps) {
  const { showToast } = useToast()
  const [eventos, setEventos] = useState<EventoHogar[]>(eventosIniciales ?? [])
  const [loading, setLoading] = useState(!eventosIniciales)
  const [filtro, setFiltro] = useState<FiltroTipo>('todos')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const cargar = async (append = false) => {
    setLoading(true)
    try {
      const offset = append ? page * PAGE_SIZE : 0
      const { data, error: rpcError } = await supabase.rpc('fn_reporte_feed_compartido', {
        p_limit: PAGE_SIZE,
        p_offset: offset,
      })
      if (rpcError) throw rpcError
      const list = ((data ?? []) as any[]).map((item) => ({
        evento_id: Number(item.evento_id),
        tipo_evento: item.tipo_evento ?? '',
        fecha: item.fecha ?? '',
        monto: Number(item.monto ?? 0),
        descripcion: item.descripcion ?? null,
        rubro: item.rubro ?? null,
        pagado_por: item.pagado_por ?? null,
        direccion: item.direccion ?? null,
        nombre_proyecto: item.nombre_proyecto ?? null,
      }))
      const next = append ? [...eventos, ...list] : list
      setEventos(next)
      setHasMore(list.length === PAGE_SIZE)
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!eventosIniciales) cargar(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtrados = useMemo(() => {
    if (filtro === 'todos') return eventos
    return eventos.filter((e) => {
      if (filtro === 'gasto') return e.tipo_evento === 'gasto_compartido'
      if (filtro === 'abono') return e.tipo_evento === 'abono'
      if (filtro === 'conciliacion') return e.tipo_evento === 'conciliacion'
      return true
    })
  }, [eventos, filtro])

  const cargarMas = () => {
    const next = page + 1
    setPage(next)
    cargar(true)
  }

  return (
    <div className="familia-feed-view">
      <div className="familia-feed-filters" role="tablist">
        {(['todos', 'gasto', 'abono', 'conciliacion'] as FiltroTipo[]).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filtro === f}
            className={`familia-feed-filter-chip ${filtro === f ? 'active' : ''}`}
            onClick={() => setFiltro(f)}
          >
            {t(`familia_feed_filtro_${f}` as any)}
          </button>
        ))}
      </div>

      {filtrados.length === 0 && !loading ? (
        <p className="familia-feed-empty">{t('familia_feed_vacio')}</p>
      ) : (
        <div className="familia-feed-list-full">
          {filtrados.map((ev) => (
            <div key={`${ev.tipo_evento}-${ev.evento_id}`} className="familia-feed-item-full">
              <span className="familia-feed-item-icon" aria-hidden="true">
                {eventoIcon(ev.tipo_evento)}
              </span>
              <div className="familia-feed-item-info">
                <strong>{ev.descripcion || ev.rubro || eventoLabel(ev.tipo_evento)}</strong>
                <p>
                  {formatFecha(ev.fecha)}
                  {ev.pagado_por ? ` · ${ev.pagado_por}` : ev.nombre_proyecto ? ` · ${ev.nombre_proyecto}` : ''}
                </p>
              </div>
              <span className="familia-feed-item-amount">{formatMoney(ev.monto)}</span>
            </div>
          ))}
        </div>
      )}

      {hasMore && filtro === 'todos' && (
        <div className="familia-feed-pagination">
          <button type="button" onClick={cargarMas} disabled={loading}>
            {t('familia_feed_cargar_mas')}
          </button>
          <span>{t('familia_feed_pagina', { page: page + 1 })}</span>
        </div>
      )}
    </div>
  )
}

export default FeedView
