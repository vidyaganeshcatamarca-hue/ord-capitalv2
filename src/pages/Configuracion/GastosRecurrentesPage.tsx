// src/pages/Configuracion/GastosRecurrentesPage.tsx
// Panel de gastos recurrentes. Requisito R-GR-32 (PRD §32.4).
// Sigue el patrón de src/pages/Configuracion/NotificacionesPage.tsx para el armazón
// y de src/pages/Saneamiento/SaneamientoPage.tsx para carga / error / reintento.

import { useCallback, useEffect, useState } from 'react'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { nombreVisibleRecurrente } from '@/lib/gastosRecurrentes'
import { isUserEditableCategory } from '@/lib/categoryFilters'
import { rpc } from '@/lib/supabase'
import { useGastosRecurrentes } from '@/hooks/useGastosRecurrentes'
import type {
  GastoRecurrenteInput,
  GastoRecurrenteRow,
} from '@/lib/gastosRecurrentes'
import {
  GastoRecurrenteCard,
} from '@/components/gastos-recurrentes/GastoRecurrenteCard'
import {
  GastoRecurrenteFormModal,
  type BilleteraOpcion,
  type RubroOpcion,
  type TarjetaOpcion,
} from '@/components/gastos-recurrentes/GastoRecurrenteFormModal'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'
import './GastosRecurrentesPage.css'

interface RubroArbol {
  estructura_id: number
  nombre_cuenta: string
  icono: string
  hijos?: Array<{ estructura_id: number; nombre_cuenta: string; icono: string }>
}

export function GastosRecurrentesPage() {
  const { items, loading, refresh, create, update, pause, resume, remove } = useGastosRecurrentes()
  const { showToast } = useToast()

  const [loadError, setLoadError] = useState<string | null>(null)
  const [rubros, setRubros] = useState<RubroOpcion[]>([])
  const [billeteras, setBilleteras] = useState<BilleteraOpcion[]>([])
  const [tarjetas, setTarjetas] = useState<TarjetaOpcion[]>([])

  // Egresos por defecto, igual que el menú Cuentas.
  const [tab, setTab] = useState<'egresos' | 'ingresos'>('egresos')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<GastoRecurrenteRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<GastoRecurrenteRow | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  /** Rubros hoja, billeteras y tarjetas para los selectores del modal. */
  const loadCatalogos = useCallback(async () => {
    try {
      const [arbol, bills, tjs] = await Promise.all([
        rpc<RubroArbol[]>('fn_obtener_arbol_categorias').catch(() => [] as RubroArbol[]),
        rpc<BilleteraOpcion[]>('fn_obtener_billeteras_activas').catch(() => [] as BilleteraOpcion[]),
        // Mismo origen que el modal de movimiento manual: solo las activas.
        rpc<TarjetaOpcion[]>('fn_reporte_mapa_tarjetas').catch(() => [] as TarjetaOpcion[]),
      ])
      // Mismo criterio que EditarCuarentenaModal: se conserva la jerarquía
      // (padre con hijos = encabezado, no elegible) y se traduce el nombre,
      // porque las categorías semilla guardan una clave i18n como nombre.
      // Las categorías de SISTEMA (misterio/olvido, inversiones) no se ofrecen:
      // no son destinos de un gasto recurrente del usuario.
      const grupos: RubroOpcion[] = (arbol ?? [])
        .filter(padre => isUserEditableCategory(padre))
        .map(padre => {
          const iconoPadre = String(padre.icono ?? '').trim() || '📁'
          const hijos = (padre.hijos ?? [])
            .filter(hijo => isUserEditableCategory(hijo))
            .map(hijo => ({
              estructura_id: hijo.estructura_id,
              nombre: t(hijo.nombre_cuenta),
              icono: String(hijo.icono ?? '').trim() || iconoPadre,
            }))
          return {
            estructura_id: padre.estructura_id,
            nombre_cuenta: t(padre.nombre_cuenta),
            icono: iconoPadre,
            hijos,
            // Un padre que venía con hijos y se quedó sin ninguno por el filtro
            // NO se puede volver un rubro elegible: se descarta entero.
            descartar: (padre.hijos ?? []).length > 0 && hijos.length === 0,
          }
        })
        .filter(grupo => !grupo.descartar)
        .map(grupo => ({
          estructura_id: grupo.estructura_id,
          nombre_cuenta: grupo.nombre_cuenta,
          icono: grupo.icono,
          hijos: grupo.hijos,
        }))
      setRubros(grupos)
      setBilleteras(bills ?? [])
      setTarjetas(tjs ?? [])
    } catch {
      // Los selectores quedan vacíos; el modal lo informa al validar.
    }
  }, [])

  useEffect(() => {
    void loadCatalogos()
  }, [loadCatalogos])

  const cargar = useCallback(async () => {
    setLoadError(null)
    try {
      await refresh()
    } catch (err) {
      const msg = parseError(err)
      setLoadError(msg)
      showToast(msg, 'error')
    }
  }, [refresh, showToast])

  useEffect(() => {
    void cargar()
    // cargar depende de refresh, que es estable
  }, [cargar])

  const abrirAlta = () => {
    setEditing(null)
    setFormError(null)
    setFormOpen(true)
  }

  const abrirEdicion = (item: GastoRecurrenteRow) => {
    setEditing(item)
    setFormError(null)
    setFormOpen(true)
  }

  const handleSubmit = async (input: GastoRecurrenteInput) => {
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        await update(editing.recurrente_id, input)
        showToast(t('recurrentes_toast_actualizado'), 'success')
      } else {
        await create(input)
        showToast(t('recurrentes_toast_creado'), 'success')
      }
      setFormOpen(false)
      setEditing(null)
    } catch (err) {
      setFormError(parseError(err))
    } finally {
      setSaving(false)
    }
  }

  const handlePause = async (item: GastoRecurrenteRow) => {
    setBusyId(item.recurrente_id)
    try {
      await pause(item.recurrente_id)
      showToast(t('recurrentes_toast_pausado'), 'success')
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleResume = async (item: GastoRecurrenteRow) => {
    setBusyId(item.recurrente_id)
    try {
      await resume(item.recurrente_id)
      showToast(t('recurrentes_toast_reactivado'), 'success')
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  /** R-GR-46: el conteo se muestra ANTES de borrar y se confirma DESPUÉS. */
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    const objetivo = pendingDelete
    setPendingDelete(null)
    setBusyId(objetivo.recurrente_id)
    try {
      const perdidas = await remove(objetivo.recurrente_id)
      showToast(t('recurrentes_toast_borrado', { count: perdidas }), 'success')
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    // `config-page` es la clase que usan las demás pantallas de Ajustes: aporta el
    // padding 24/16, el alineado superior y el margen del sidebar en escritorio.
    <main className="page config-page recur-page" aria-labelledby="recur-page-title">
      <ConfigBackButton />

      <header className="config-page-header">
        <h1 id="recur-page-title">{t('recurrentes_title')}</h1>
        <p>{t('recurrentes_subtitle')}</p>
      </header>

      <div className="recur-tabs" role="tablist" aria-label={t('recurrentes_title')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'egresos'}
          className={`recur-tab${tab === 'egresos' ? ' is-active' : ''}`}
          onClick={() => setTab('egresos')}
        >
          {t('recurrentes_tab_egresos')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'ingresos'}
          className={`recur-tab${tab === 'ingresos' ? ' is-active' : ''}`}
          onClick={() => setTab('ingresos')}
        >
          {t('recurrentes_tab_ingresos')}
        </button>
      </div>

      <div className="recur-toolbar">
        <span className="recur-count">
          {tab === 'egresos' ? t(items.length === 1 ? 'recurrentes_count_one' : 'recurrentes_count_other', { count: items.length }) : ''}
        </span>
        {tab === 'egresos' && (
          <button type="button" className="btn btn-primary" onClick={abrirAlta}>
            + {t('recurrentes_nuevo_egreso')}
          </button>
        )}
      </div>

      {tab === 'ingresos' && (
        <div className="recur-state recur-state--empty">
          <span className="recur-badge-soon">{t('recurrentes_ingresos_pronto')}</span>
          <p className="recur-empty-icon" aria-hidden="true">💵</p>
          <p>{t('recurrentes_ingresos_vacio')}</p>
        </div>
      )}

      {tab === 'egresos' && loading && (
        <div className="recur-state">
          <div className="spinner" />
          <p>{t('recurrentes_cargando')}</p>
        </div>
      )}

      {tab === 'egresos' && !loading && loadError && (
        <div className="recur-state recur-state--error">
          <p>⚠️ {loadError}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void cargar()}>
            {t('recurrentes_reintentar')}
          </button>
        </div>
      )}

      {tab === 'egresos' && !loading && !loadError && items.length === 0 && (
        <div className="recur-state recur-state--empty">
          <p className="recur-empty-icon" aria-hidden="true">🔁</p>
          <p>{t('recurrentes_vacio')}</p>
          <button type="button" className="btn btn-primary" onClick={abrirAlta}>
            + {t('recurrentes_nuevo_egreso')}
          </button>
        </div>
      )}

      {tab === 'egresos' && !loading && !loadError && items.length > 0 && (
        <div className="recur-list">
          {items.map(item => (
            <GastoRecurrenteCard
              key={item.recurrente_id}
              item={item}
              busy={busyId === item.recurrente_id}
              onEdit={abrirEdicion}
              onPause={handlePause}
              onResume={handleResume}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      {formOpen && (
        <GastoRecurrenteFormModal
          mode={editing ? 'edit' : 'create'}
          initial={editing}
          rubros={rubros}
          billeteras={billeteras}
          tarjetas={tarjetas}
          saving={saving}
          error={formError}
          onClose={() => { setFormOpen(false); setEditing(null) }}
          onSubmit={input => void handleSubmit(input)}
        />
      )}

      <ConfirmModal
        isOpen={pendingDelete !== null}
        type="danger"
        title={t('recurrentes_borrar_titulo')}
        message={t('recurrentes_borrar_cuerpo', {
          nombre: pendingDelete ? nombreVisibleRecurrente(pendingDelete, t) : '',
        })}
        confirmText={t('recurrentes_borrar')}
        cancelText={t('btn_cancel')}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </main>
  )
}
