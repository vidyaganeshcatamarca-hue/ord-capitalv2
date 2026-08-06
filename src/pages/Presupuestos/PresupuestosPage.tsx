import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { t, parseError } from '@/locales/i18n'
import { SYSTEM_CATEGORY_NAMES } from '@/lib/categoryFilters'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import './Presupuestos.css'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface SobreDetalle {
  estructura_id: number
  nombre_categoria: string
  icono: string
  color: string
  tipo_cupo: string
  padre_id: number | null
  monto_asignado: number
  monto_gastado: number
  monto_disponible: number
  arrastre_mes_anterior: number
  monto_asignado_anterior: number
  monto_gastado_anterior: number
  estado_sobre: string
  metodo_sobregasto: string | null
  isVirtualDisponible?: boolean
}

interface ConfigPresupuesto {
  modo_presupuesto: 'base_cero' | 'anticipado'
  porcentaje_necesidades: number
  porcentaje_deseos: number
  porcentaje_ahorro: number
  porcentaje_diezmo: number
  dia_ancla_ciclo: number
}

interface SugerenciaActivacion {
  estructura_id: number
  nombre: string
  tipo_cupo: string
  monto_sugerido: number
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const formatMonto = (n: number) => {
  const abs = Math.abs(n)
  const str = Math.round(abs).toLocaleString('es-AR')
  return n < 0 ? `-$${str}` : `$${str}`
}

const getMesPeriodo = (offset: number = 0): Date => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return d
}

const formatMesLabel = (d: Date) =>
  d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())

const TIPO_CUPO_META: Record<string, { label: string; icono: string }> = {
  need: { label: 'NECESIDADES', icono: '🏠' },
  want: { label: 'DESEOS', icono: '✨' },
  investment: { label: t('budget_label_saving_investment'), icono: '💎' },
  saving: { label: t('budget_label_saving_investment'), icono: '💎' },
  tithe: { label: 'DIEZMO', icono: '🙏' },
}

const getColorBarra = (estado: string) => {
  if (estado === 'verde') return 'verde'
  if (estado === 'amarillo_precaucion') return 'amarillo'
  if (estado === 'rojo_excedido') return 'rojo'
  return 'verde'
}

const getPctBarra = (gastado: number, asignado: number) => {
  if (asignado <= 0) return gastado > 0 ? 100 : 0
  return Math.min(Math.round((gastado / asignado) * 100), 100)
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export function PresupuestosPage() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [returnToConfig, setReturnToConfig] = useState(false)

  // Estado de datos
  const [saldoAsignar, setSaldoAsignar] = useState<number | null>(null)
  const [sobres, setSobres] = useState<SobreDetalle[]>([])
  const [config, setConfig] = useState<ConfigPresupuesto | null>(null)
  const [loading, setLoading] = useState(true)

  // Mes seleccionado (offset respecto a hoy, 0 = mes actual)
  const [mesOffset, setMesOffset] = useState(0)
  const [showMesDropdown, setShowMesDropdown] = useState(false)

  // Acordeones abiertos
  const [acordeonesAbiertos, setAcordeonesAbiertos] = useState<Set<string>>(
    new Set(['need', 'want', 'investment', 'saving', 'tithe'])
  )

  // Modales
  const [sobreSeleccionado, setSobreSeleccionado] = useState<SobreDetalle | null>(null)
  const [showAsignarSheet, setShowAsignarSheet] = useState(false)
  const [showTransferirModal, setShowTransferirModal] = useState(false)
  const [showReglasModal, setShowReglasModal] = useState(false)
  const [showBaseCeroModal, setShowBaseCeroModal] = useState(false)

  // Estado Asignar Sheet
  const [montoManual, setMontoManual] = useState('')
  const [mostrando, setMostrando] = useState<'opciones' | 'monto'>('opciones')
  const montoRef = useRef<HTMLInputElement>(null)

  // Estado Transferir
  const [origenSeleccionado, setOrigenSeleccionado] = useState<SobreDetalle | null>(null)
  const [montoTransferir, setMontoTransferir] = useState('')
  const [loadingTransferir, setLoadingTransferir] = useState(false)

  // Estado Reglas de Oro
  const [reglasForm, setReglasForm] = useState({
    necesidades: 50, deseos: 30, ahorro: 20, diezmo: 0, diaAncla: 1
  })
  const [modoForm, setModoForm] = useState<'base_cero' | 'anticipado'>('anticipado')
  const [loadingReglas, setLoadingReglas] = useState(false)

  // Estado Activar Base Cero
  const [acepto, setAcepto] = useState('')
  const [paso, setPaso] = useState<1 | 2>(1)
  const [sugerencias, setSugerencias] = useState<SugerenciaActivacion[]>([])
  const [liquidezActivacion, setLiquidezActivacion] = useState(0)
  const [montosEditados, setMontosEditados] = useState<Record<number, string>>({})
  const [loadingActivar, setLoadingActivar] = useState(false)



  const [hasInitializedOffset, setHasInitializedOffset] = useState(false)

  const mesPeriodo = getMesPeriodo(mesOffset)
  const mesPeriodoStr = mesPeriodo.toISOString().slice(0, 10)

  const diaAncla = config?.dia_ancla_ciclo ? Number(config.dia_ancla_ciclo) : 1
  const activeOffset = new Date().getDate() < diaAncla ? -1 : 0

  const getLabelForOffset = (offset: number) => {
    if (offset === activeOffset) return `✅ Ciclo Actual`
    if (offset === activeOffset - 1) return `Ciclo Anterior`
    if (offset === activeOffset - 2) return `Doble Anterior`
    return `Ciclo Actual`
  }

  useEffect(() => {
    if (searchParams.get('openConfig') !== '1') return
    setReturnToConfig(searchParams.get('returnTo') === 'configuracion')
    setShowReglasModal(true)
    navigate('/presupuesto', { replace: true })
  }, [navigate, searchParams])

  const closeBudgetSettings = () => {
    setShowReglasModal(false)
    setShowBaseCeroModal(false)
    if (returnToConfig) {
      setReturnToConfig(false)
      navigate('/configuracion')
    }
  }

  // ─── CARGA INICIAL ────────────────────────────────────────────────────────

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [rSaldo, rSobres, rConfig] = await Promise.all([
        supabase.rpc('fn_obtener_saldo_a_asignar', { p_mes_periodo: mesPeriodoStr }),
        supabase.rpc('fn_reporte_sobres_detalle', { p_mes_periodo: mesPeriodoStr }),
        supabase.rpc('fn_obtener_config_presupuesto'),
      ])

      if (rSaldo.error) throw rSaldo.error
      if (rSobres.error) throw rSobres.error

      setSaldoAsignar(Number(rSaldo.data ?? 0))
      const sobresFiltrados = ((rSobres.data ?? []) as SobreDetalle[]).filter(
        s => {
          const nombreLower = (s.nombre_categoria || '').toLowerCase().trim();
          return !SYSTEM_CATEGORY_NAMES.includes(nombreLower as (typeof SYSTEM_CATEGORY_NAMES)[number]);
        }
      )
      setSobres(sobresFiltrados)

      if (!rConfig.error && rConfig.data) {
        // fn_obtener_config_presupuesto retorna TABLE → data es array, tomar primer elemento
        const rawData = rConfig.data as ConfigPresupuesto[]
        const cfg = Array.isArray(rawData) ? rawData[0] : rawData as unknown as ConfigPresupuesto
        if (cfg) {
          setConfig(cfg)
          const ancla = Number(cfg.dia_ancla_ciclo ?? 1)
          if (!hasInitializedOffset) {
            const today = new Date()
            if (today.getDate() < ancla) {
              setMesOffset(-1)
            }
            setHasInitializedOffset(true)
          }
          setReglasForm({
            necesidades: Number(cfg.porcentaje_necesidades ?? 50),
            deseos: Number(cfg.porcentaje_deseos ?? 30),
            ahorro: Number(cfg.porcentaje_ahorro ?? 20),
            diezmo: Number(cfg.porcentaje_diezmo ?? 0),
            diaAncla: ancla,
          })
          setModoForm(cfg.modo_presupuesto ?? 'anticipado')
        }
      }
    } catch (err: any) {
      console.error('Error cargando presupuestos:', err)
      showToast('Error al cargar presupuestos', 'error')
    } finally {
      setLoading(false)
    }
  }, [mesPeriodoStr])

  useEffect(() => {
    cargarDatos()
    const handleSuccess = () => {
      cargarDatos()
    }
    window.addEventListener('movement-added', handleSuccess)
    return () => {
      window.removeEventListener('movement-added', handleSuccess)
    }
  }, [cargarDatos])

  // ─── LÓGICA DE ACORDEONES ─────────────────────────────────────────────────

  const toggleAcordeon = (tipo: string) => {
    setAcordeonesAbiertos(prev => {
      const next = new Set(prev)
      if (next.has(tipo)) next.delete(tipo)
      else next.add(tipo)
      return next
    })
  }

  // ─── AGRUPACIÓN DE SOBRES ─────────────────────────────────────────────────

  const gruposOrdenados = (() => {
    const mapa: Record<string, SobreDetalle[]> = {}
    for (const s of sobres) {
      // Si estamos en Base Cero y el sobre está en rojo (déficit), no lo mostramos abajo (se muestra arriba en prioridad)
      if (config?.modo_presupuesto === 'base_cero' && s.monto_disponible < 0) {
        continue
      }
      const tipo = s.tipo_cupo || 'other'
      // Unificar investment y saving bajo la misma clave
      const key = (tipo === 'saving' || tipo === 'investment') ? 'investment' : tipo
      if (!mapa[key]) mapa[key] = []
      mapa[key].push(s)
    }
    // Orden: need → want → investment → tithe
    const orden = ['need', 'want', 'investment', 'tithe']
    return orden.filter(k => mapa[k]).map(k => ({ tipo: k, items: mapa[k] }))
  })()

  // ─── HEADER DISPONIBLE ────────────────────────────────────────────────────

  const getEstadoDisponible = () => {
    if (config?.modo_presupuesto === 'anticipado') return 'estado-anticipado'
    if (saldoAsignar === null) return 'estado-positivo'
    if (saldoAsignar > 0) return 'estado-positivo'
    if (saldoAsignar === 0) return 'estado-cero'
    return 'estado-negativo'
  }

  const getLabelDisponible = () => {
    if (config?.modo_presupuesto === 'anticipado') return t('budget_projection_month')
    if (saldoAsignar === 0) return t('budget_zero_base_reached')
    if (saldoAsignar !== null && saldoAsignar < 0) return t('budget_over_allocation')
    return 'DISPONIBLE PARA ASIGNAR'
  }

  const getSubtextoDisponible = () => {
    if (config?.modo_presupuesto === 'anticipado') return t('budget_subtexto_anticipado')
    if (saldoAsignar !== null && saldoAsignar < 0) return t('budget_over_allocation_desc')
    if (saldoAsignar === 0) return 'Cada peso tiene un destino asignado'
    if (saldoAsignar !== null && saldoAsignar > 0) return 'Dinero esperando destino'
    return ''
  }

  // ─── ASIGNAR PRESUPUESTO ─────────────────────────────────────────────────

  const handleAbrirAsignar = (sobre: SobreDetalle) => {
    setSobreSeleccionado(sobre)
    setMostrando('opciones')
    setMontoManual('')
    setShowAsignarSheet(true)
  }

  const ejecutarAsignacion = async (monto: number) => {
    if (!sobreSeleccionado) return
    if (isNaN(monto) || monto <= 0) {
      showToast(t('error_invalid_amount'), 'error')
      return
    }
    try {
      const { error } = await supabase.rpc('fn_asignar_presupuesto', {
        p_estructura_egreso_id: sobreSeleccionado.estructura_id,
        p_monto_asignado: monto,
        p_mes_periodo: mesPeriodoStr,
      })
      if (error) throw error
      showToast(`$${Math.round(monto).toLocaleString('es-AR')} ${t('toast_assigned_to')} ${t(sobreSeleccionado.nombre_categoria)}`, 'success')
      setShowAsignarSheet(false)
      setSobreSeleccionado(null)
      await cargarDatos()
    } catch (err: any) {
      const msg = err?.message?.includes('error_budget_insufficient_base_zero')
        ? t('budget_error_exceeds_available', { amount: formatMonto(saldoAsignar ?? 0) })
        : 'Error al asignar presupuesto'
      showToast(msg, 'error')
    }
  }

  const handleLlenarHueco = async () => {
    if (!sobreSeleccionado) return
    // En modo anticipado, el "hueco" se mide contra asignado - gastado (sin arrastre).
    const disponibleEfectivo = config?.modo_presupuesto === 'anticipado'
      ? Number(sobreSeleccionado.monto_asignado ?? 0) - Number(sobreSeleccionado.monto_gastado ?? 0)
      : Number(sobreSeleccionado.monto_disponible ?? 0)
    if (disponibleEfectivo >= 0) return
    let monto = Math.abs(disponibleEfectivo)

    // En base_cero, no podemos asignar más de lo que tenemos disponible globalmente
    if (config?.modo_presupuesto === 'base_cero' && saldoAsignar !== null) {
      monto = Math.min(monto, Math.max(0, saldoAsignar))
    }
    
    if (monto <= 0) {
      showToast(t('budget_error_insufficient_funds'), 'error')
      return
    }
    
    // El backend REEMPLAZA el límite, por lo que debemos sumar el monto al límite actual.
    const nuevoLimite = Number(sobreSeleccionado.monto_asignado ?? 0) + monto;
    await ejecutarAsignacion(nuevoLimite)
  }

  const handleAsignarTodo = async () => {
    if (!sobreSeleccionado || saldoAsignar === null) return
    const nuevoLimite = Number(sobreSeleccionado.monto_asignado ?? 0) + saldoAsignar;
    await ejecutarAsignacion(nuevoLimite)
  }

  const handleMontoManualConfirmar = async () => {
    const montoAAgregar = parseFloat(montoManual.replace(/\./g, '').replace(',', '.'))
    if (isNaN(montoAAgregar) || montoAAgregar <= 0) {
      showToast(t('error_invalid_amount'), 'error')
      return
    }
    const nuevoLimite = Number(sobreSeleccionado?.monto_asignado ?? 0) + montoAAgregar;
    await ejecutarAsignacion(nuevoLimite)
  }

  // ─── TRANSFERIR ENTRE SOBRES ──────────────────────────────────────────────

  const sobresConDisponible = sobres.filter(s =>
    s.estructura_id !== sobreSeleccionado?.estructura_id &&
    s.monto_disponible > 0
  )

  const fuentesDisponibles = useMemo(() => {
    return [
      ...(saldoAsignar !== null && saldoAsignar > 0 ? [{
        estructura_id: -999,
        nombre_categoria: 'Disponible para Asignar',
        icono: '💰',
        color: '',
        tipo_cupo: '',
        padre_id: null,
        monto_asignado: 0,
        monto_gastado: 0,
        monto_disponible: saldoAsignar,
        arrastre_mes_anterior: 0,
        monto_asignado_anterior: 0,
        monto_gastado_anterior: 0,
        estado_sobre: '',
        metodo_sobregasto: null,
        isVirtualDisponible: true
      } as SobreDetalle] : []),
      ...sobresConDisponible
    ]
  }, [sobresConDisponible, saldoAsignar])

  const handleTransferir = async () => {
    if (!origenSeleccionado || !sobreSeleccionado) return
    const monto = parseFloat(montoTransferir.replace(/\./g, '').replace(',', '.'))
    if (isNaN(monto) || monto <= 0) {
      showToast(t('error_invalid_amount'), 'error')
      return
    }

    // Validar en cliente que no deje el origen en negativo
    if (origenSeleccionado.isVirtualDisponible) {
      if (monto > (saldoAsignar ?? 0)) {
        showToast(t('budget_error_exceeds_available_simple'), 'error')
        return
      }
    } else {
      // En modo anticipado, no se arrastra el saldo disponible del mes anterior.
      const disponibleEfectivo = config?.modo_presupuesto === 'anticipado'
        ? Number(origenSeleccionado.monto_asignado ?? 0) - Number(origenSeleccionado.monto_gastado ?? 0)
        : Number(origenSeleccionado.monto_disponible ?? 0)
      if (monto > disponibleEfectivo) {
        showToast(t('budget_error_transfer_exceeds'), 'error')
        return
      }
    }

    setLoadingTransferir(true)
    try {
      if (origenSeleccionado.isVirtualDisponible) {
        const nuevoLimite = Number(sobreSeleccionado.monto_asignado ?? 0) + monto
        const { error } = await supabase.rpc('fn_asignar_presupuesto', {
          p_estructura_egreso_id: sobreSeleccionado.estructura_id,
          p_monto_asignado: nuevoLimite,
          p_mes_periodo: mesPeriodoStr,
        })
        if (error) throw error
        showToast(t('budget_success_deficit_covered'), 'success')
      } else {
        const { error } = await supabase.rpc('fn_transferir_entre_sobres', {
          p_origen_id: origenSeleccionado.estructura_id,
          p_destino_id: sobreSeleccionado.estructura_id,
          p_monto: monto,
          p_mes_periodo: mesPeriodoStr,
        })
        if (error) throw error
      }
      
      const nuevoDeficit = sobreSeleccionado.monto_disponible + monto
      if (nuevoDeficit >= 0) {
        setShowTransferirModal(false)
        setShowAsignarSheet(false)
        setSobreSeleccionado(null)
        setOrigenSeleccionado(null)
        setMontoTransferir('')
      } else {
        setSobreSeleccionado(prev => prev ? {
          ...prev,
          monto_disponible: nuevoDeficit,
          monto_asignado: prev.monto_asignado + monto
        } : null)
        setOrigenSeleccionado(null)
        setMontoTransferir(String(Math.round(Math.abs(nuevoDeficit))))
      }
      await cargarDatos()
    } catch (err: any) {
      const msg = err?.message?.includes('error_insufficient_funds_in_envelope')
        ? 'Fondos insuficientes en el sobre de origen'
        : 'Error al transferir entre sobres'
      showToast(msg, 'error')
    } finally {
      setLoadingTransferir(false)
    }
  }

  const handleAbrirTransferenciaDirecta = (sobre: SobreDetalle) => {
    setSobreSeleccionado(sobre)
    setOrigenSeleccionado(null)
    setMontoTransferir('')
    if (sobre.monto_disponible < 0) {
      setMontoTransferir(String(Math.abs(sobre.monto_disponible)))
    }
    setShowTransferirModal(true)
  }

  const sobresExcedidos = useMemo(() => {
    if (config?.modo_presupuesto !== 'base_cero') return []
    return sobres.filter(s => s.monto_disponible < 0)
  }, [sobres, config])

  useEffect(() => {
    if (showTransferirModal && fuentesDisponibles.length === 1 && !origenSeleccionado && sobreSeleccionado) {
      setOrigenSeleccionado(fuentesDisponibles[0])
      setMontoTransferir(String(Math.round(Math.min(Math.abs(sobreSeleccionado.monto_disponible), fuentesDisponibles[0].monto_disponible))))
    }
  }, [showTransferirModal, fuentesDisponibles, origenSeleccionado, sobreSeleccionado])

  // ─── GUARDAR REGLAS DE ORO ────────────────────────────────────────────────

  const sumaReglas = reglasForm.necesidades + reglasForm.deseos + reglasForm.ahorro + reglasForm.diezmo
  const reglasValidas = Math.abs(sumaReglas - 100) < 0.01

  const handleGuardarReglas = async () => {
    if (!reglasValidas) {
      showToast('Los porcentajes deben sumar 100%', 'error')
      return
    }
    if (reglasForm.diaAncla < 1 || reglasForm.diaAncla > 31) {
      showToast(t('budget_error_invalid_anchor_day'), 'error')
      return
    }
    setLoadingReglas(true)
    try {
      // Guardar reglas de oro
      const { error: errReglas } = await supabase.rpc('fn_configurar_reglas_oro', {
        p_pct_necesidades: reglasForm.necesidades,
        p_pct_deseos: reglasForm.deseos,
        p_pct_ahorro: reglasForm.ahorro,
        p_pct_diezmo: reglasForm.diezmo,
        p_dia_ancla_ciclo: reglasForm.diaAncla,
      })
      if (errReglas) throw errReglas

      // Si cambia el modo (y no va a Base Cero por primera vez), actualizar
      const modoActual = config?.modo_presupuesto ?? 'anticipado'
      if (modoForm !== modoActual) {
        if (modoForm === 'base_cero') {
          // Mostrar modal de contrato en lugar de guardar directo
          setShowReglasModal(false)
          setShowBaseCeroModal(true)
          return
        } else {
          const { error: errModo } = await supabase.rpc('fn_configurar_modo_presupuesto', { p_modo: modoForm })
          if (errModo) throw errModo
          window.dispatchEvent(new CustomEvent('budget-mode-changed'))
        }
      }

      showToast(t('toast_golden_rules_success'), 'success')
      setShowReglasModal(false)
      await cargarDatos()
      if (returnToConfig) {
        setReturnToConfig(false)
        navigate('/configuracion')
      }
    } catch (err: any) {
      const errStr = String(err?.message || '') + ' ' + JSON.stringify(err);
      if (errStr.includes('error_base_cero_locked')) {
        showToast(t('error_base_cero_locked'), 'error')
      } else {
        showToast(t('toast_golden_rules_error'), 'error')
      }
    } finally {
      setLoadingReglas(false)
    }
  }

  // ─── ACTIVAR BASE CERO ────────────────────────────────────────────────────

  const handleAbrirBaseCero = async () => {
    setPaso(1)
    setAcepto('')
    setSugerencias([])
    setMontosEditados({})
    setShowBaseCeroModal(true)
  }

  const handlePasar2 = async () => {
    if (acepto.trim().toUpperCase() !== 'ACEPTO') {
      showToast(t('toast_write_accept_confirm'), 'error')
      return
    }
    try {
      const { data, error } = await supabase.rpc('fn_sugerir_distribucion_activacion')
      if (error) throw error
      const d = data as { liquidez_actual: number; sugerencias: SugerenciaActivacion[] }
      setLiquidezActivacion(Number(d.liquidez_actual ?? 0))
      const sugerenciasFiltradas = (d.sugerencias ?? []).filter(s => {
        const nombreLower = (s.nombre || '').toLowerCase().trim();
        return !SYSTEM_CATEGORY_NAMES.includes(nombreLower as (typeof SYSTEM_CATEGORY_NAMES)[number]);
      })
      setSugerencias(sugerenciasFiltradas)
      const iniciales: Record<number, string> = {}
      for (const s of sugerenciasFiltradas) {
        iniciales[s.estructura_id] = '' // Dejar vacío para que sea sugerencia visual y no asignación forzada
      }
      setMontosEditados(iniciales)
      setPaso(2)
    } catch {
      showToast('Error al obtener sugerencias', 'error')
    }
  }

  const handleConfirmarActivacion = async (skipSuggestions = false) => {
    setLoadingActivar(true)
    try {
      // 1. Cambiar modo
      const { error: errModo } = await supabase.rpc('fn_configurar_modo_presupuesto', { p_modo: 'base_cero' })
      if (errModo) throw errModo
      window.dispatchEvent(new CustomEvent('budget-mode-changed'))

      // 2. Asignar cada sugerencia
      if (!skipSuggestions) {
        for (const s of sugerencias) {
          const monto = parseFloat(montosEditados[s.estructura_id] || '0')
          if (monto > 0) {
            const { error } = await supabase.rpc('fn_asignar_presupuesto', {
              p_estructura_egreso_id: s.estructura_id,
              p_monto_asignado: monto,
              p_mes_periodo: mesPeriodoStr,
            })
            if (error) console.warn('Error asignando:', s.nombre, error.message)
          }
        }
      }

      showToast(t('budget_success_base_cero_activated'), 'success')
      setShowBaseCeroModal(false)
      await cargarDatos()
      if (returnToConfig) {
        setReturnToConfig(false)
        navigate('/configuracion')
      }
    } catch {
      showToast('Error al activar Modo Base Cero', 'error')
    } finally {
      setLoadingActivar(false)
    }
  }



  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="page presupuestos-page">

      {/* ── HEADER ── */}
      <div className="presupuestos-header">
        <h1>Presupuestos</h1>
        <div className="mes-selector">
          <button
            className="mes-selector-btn"
            onClick={() => setShowMesDropdown(v => !v)}
          >
            {getLabelForOffset(mesOffset)}
            <span className="chevron">▾</span>
          </button>
          {showMesDropdown && (
            <>
              <div className="mes-dropdown-overlay" onClick={() => setShowMesDropdown(false)} />
              <div className="mes-dropdown">
                {[0, 1, 2].map(d => {
                  const off = activeOffset - d;
                  return (
                    <div
                      key={off}
                      className={`mes-dropdown-item${mesOffset === off ? ' activo' : ''}`}
                      onClick={() => { setMesOffset(off); setShowMesDropdown(false) }}
                    >
                      {getLabelForOffset(off)}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
        <div className="header-actions">
          <button
            className="btn-icon"
            title="Reglas de Oro"
            onClick={() => setShowReglasModal(true)}
          >⚙️</button>
        </div>
      </div>

      {/* ── STICKY DISPONIBLE ── */}
      <div className={`disponible-header ${getEstadoDisponible()}`}>
        <div className="disponible-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {getLabelDisponible()}
          {config?.modo_presupuesto === 'anticipado' && (
            <InfoBubble
              text={t('budget_info_proyeccion', {
                pct_nec: String(config?.porcentaje_necesidades ?? 50),
                pct_des: String(config?.porcentaje_deseos ?? 30),
                pct_aho: String(config?.porcentaje_ahorro ?? 20),
              })}
            />
          )}
        </div>
        <div className="disponible-monto">
          {saldoAsignar !== null ? formatMonto(saldoAsignar) : '—'}
        </div>
        <div className="disponible-subtexto">{getSubtextoDisponible()}</div>
        {config?.modo_presupuesto === 'anticipado' && (
          <div style={{ marginTop: 8 }}>
            <button
              className="btn-modo-disciplina"
              onClick={handleAbrirBaseCero}
            >
              🔒 Activar Modo Disciplina
            </button>
          </div>
        )}
      </div>

      {/* ── CONTENIDO ── */}
      <div className="presupuestos-scroll">
        {loading ? (
          <div className="presupuestos-loading"><div className="spinner" /></div>
        ) : sobres.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {sobresExcedidos.length > 0 && (
              <div className="sobres-excedidos-alerta">
                <div className="alerta-header">
                  <span className="alerta-icon">⚠️</span>
                  <div className="alerta-text">
                    <h4>{t('budget_exceeded_envelopes_title')}</h4>
                    <p>{t('budget_exceeded_envelopes_desc')}</p>
                  </div>
                </div>
                <div className="alerta-items">
                  {sobresExcedidos.map(sobre => (
                    <div key={sobre.estructura_id} className="alerta-sobre-row">
                      <div className="sobre-info">
                        <span className="sobre-icono"><CategoryIcon name={sobre.icono} size={20} /></span>
                        <span className="sobre-nombre">{t(sobre.nombre_categoria)}</span>
                      </div>
                      <div className="sobre-detalles-derecha">
                        <span className="sobre-monto negativo">
                          {formatMonto(sobre.monto_disponible)}
                        </span>
                        <button
                          type="button"
                          className="btn-cubrir-deficit"
                          onClick={() => handleAbrirTransferenciaDirecta(sobre)}
                        >
                          {t('btn_cubrir_deficit')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {gruposOrdenados.map(({ tipo, items }) => (
              <GrupoAcordeon
                key={tipo}
                tipo={tipo}
                items={items}
                abierto={acordeonesAbiertos.has(tipo)}
                onToggle={() => toggleAcordeon(tipo)}
                onAsignar={handleAbrirAsignar}
                modoPresupuesto={config?.modo_presupuesto}
              />
            ))}

            <div className="presupuestos-footer-tip">
              <span className="tip-icono">💡</span>
              <span>{t('budget_footer_tip_text')}</span>
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          MODAL: BOTTOM SHEET ASIGNAR
          ══════════════════════════════════════════════════════════ */}
      {showAsignarSheet && sobreSeleccionado && (
        <div className="modal-overlay" onClick={() => setShowAsignarSheet(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-titulo">{t('budget_modal_titulo_asignar')}</div>

            <div className="asignar-sheet-sobre">
              <span style={{
                width: 32, height: 32, borderRadius: 8,
                background: sobreSeleccionado.color || 'var(--mint, #00B127)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CategoryIcon name={sobreSeleccionado.icono} size={18} />
              </span>
              <div>
                <div className="asignar-sheet-sobre-nombre">{t(sobreSeleccionado.nombre_categoria)}</div>
                <div className="asignar-sheet-sobre-saldo">
                  {t('assigned')}: {formatMonto(sobreSeleccionado.monto_asignado)} ·{' '}
                  {t('spent')}: {formatMonto(sobreSeleccionado.monto_gastado)}
                </div>
              </div>
            </div>

            {mostrando === 'opciones' ? (
              <div className="asignar-opciones">
                {config?.modo_presupuesto !== 'anticipado' && (
                  <div className="asignar-opcion" onClick={handleLlenarHueco}>
                    <span className="asignar-opcion-icono">💰</span>
                    <div className="asignar-opcion-texto">
                      <h4>{t('budget_opcion_llenar_hueco_title')}</h4>
                      <p>{t('budget_opcion_llenar_hueco_desc')}</p>
                    </div>
                  </div>
                )}

                <div className="asignar-opcion" onClick={() => {
                  setMostrando('monto')
                  setTimeout(() => montoRef.current?.focus(), 100)
                }}>
                  <span className="asignar-opcion-icono">⌨️</span>
                  <div className="asignar-opcion-texto">
                    <h4>{t('budget_opcion_ingresar_monto_title')}</h4>
                    <p>{t('budget_opcion_ingresar_monto_desc')}</p>
                  </div>
                </div>

                <div className="asignar-opcion" onClick={handleAsignarTodo}>
                  <span className="asignar-opcion-icono">💸</span>
                  <div className="asignar-opcion-texto">
                    <h4>{t('budget_opcion_asignar_todo_title')}</h4>
                    <p>{t('budget_opcion_asignar_todo_desc', { monto: formatMonto(saldoAsignar ?? 0) })}</p>
                  </div>
                </div>

                {config?.modo_presupuesto !== 'anticipado' && (
                  <div className="asignar-opcion" onClick={() => {
                    setShowAsignarSheet(false)
                    setOrigenSeleccionado(null)
                    setMontoTransferir('')
                    setShowTransferirModal(true)
                  }}>
                    <span className="asignar-opcion-icono">↔️</span>
                    <div className="asignar-opcion-texto">
                      <h4>{t('budget_opcion_cubrir_sobre_title')}</h4>
                      <p>{t('budget_opcion_cubrir_sobre_desc')}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="asignar-monto-inline">
                <input
                  ref={montoRef}
                  className="asignar-monto-input"
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={montoManual}
                  onChange={e => setMontoManual(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleMontoManualConfirmar()}
                  onFocus={e => {
                    if (montoManual === '0') {
                      setMontoManual('')
                    } else {
                      e.target.select()
                    }
                  }}
                />
                <button
                  className="btn-confirmar-monto"
                  onClick={handleMontoManualConfirmar}
                  disabled={!montoManual || parseFloat(montoManual) <= 0}
                >
                  {t('budget_btn_assign')}
                </button>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <button className="btn-cancelar" style={{ width: '100%' }}
                onClick={() => setShowAsignarSheet(false)}>
                {t('btn_cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL: TRANSFERIR ENTRE SOBRES
          ══════════════════════════════════════════════════════════ */}
      {showTransferirModal && sobreSeleccionado && (
        <div className="modal-overlay centrado" onClick={() => setShowTransferirModal(false)}>
          <div className="modal-sheet centrado-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-titulo">{t('budget_opcion_cubrir_sobre_title')}</div>
            <div className="modal-subtitulo">
              {t('budget_label_destination')}: <strong>{t(sobreSeleccionado.nombre_categoria)}</strong>
              {sobreSeleccionado.monto_disponible < 0 && (
                <> · {t('budget_label_current_deficit')}: <span style={{ color: '#FF6B6B' }}>{formatMonto(sobreSeleccionado.monto_disponible)}</span></>
              )}
            </div>

            <div style={{ fontSize: 'calc(12px * var(--font-scale))', color: '#A0A0A0', marginBottom: 8 }}>
              {t('budget_label_transfer_source')}
            </div>

            {fuentesDisponibles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#A0A0A0', fontSize: 'calc(13px * var(--font-scale))' }}>
                {t('budget_label_transfer_no_envelopes')}
              </div>
            ) : (
              <div className="transferir-lista-sobres">
                {fuentesDisponibles.map(s => (
                  <div
                    key={s.estructura_id}
                    className={`transferir-sobre-item${origenSeleccionado?.estructura_id === s.estructura_id ? ' seleccionado' : ''}`}
                    onClick={() => {
                      setOrigenSeleccionado(s)
                      setMontoTransferir(String(Math.round(Math.min(Math.abs(sobreSeleccionado.monto_disponible), s.monto_disponible))))
                    }}
                  >
                    <span className="transferir-sobre-nombre">
                      <CategoryIcon name={s.icono} size={18} /> {t(s.nombre_categoria)}
                    </span>
                    <span className="transferir-sobre-disponible">
                      {formatMonto(s.monto_disponible)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {origenSeleccionado && (
              <div className="transferir-monto-section">
                <div className="transferir-monto-label">{t('budget_label_transfer_amount')}</div>
                <div className="asignar-monto-inline">
                  <input
                    className="asignar-monto-input"
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={montoTransferir}
                    onChange={e => setMontoTransferir(e.target.value)}
                    onFocus={e => {
                      if (montoTransferir === '0') {
                        setMontoTransferir('')
                      } else {
                        e.target.select()
                      }
                    }}
                  />
                  <button
                    className="btn-confirmar-monto"
                    onClick={() => setMontoTransferir(String(Math.round(Math.min(Math.abs(sobreSeleccionado.monto_disponible), origenSeleccionado.monto_disponible))))}
                    style={{ fontSize: 'calc(11px * var(--font-scale))', padding: '10px 10px' }}
                  >
                    {t('budget_btn_all_deficit')}
                  </button>
                </div>
              </div>
            )}

            <div className="modal-btns">
              <button className="btn-cancelar" onClick={() => setShowTransferirModal(false)}>
                {t('btn_cancel')}
              </button>
              <button
                className="btn-primario"
                onClick={handleTransferir}
                disabled={!origenSeleccionado || !montoTransferir || loadingTransferir}
              >
                {loadingTransferir ? t('budget_btn_transferring') : t('budget_btn_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL: REGLAS DE ORO
          ══════════════════════════════════════════════════════════ */}
      {showReglasModal && (
        <div className="modal-overlay centrado" onClick={closeBudgetSettings}>
          <div className="modal-sheet centrado-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-titulo">⚙️ {t('budget_modal_title_golden_rules')}</div>
            <div className="modal-subtitulo">{t('budget_label_ideal_distribution')}</div>

            {/* Modo */}
            <div className="modo-toggle-section">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <InfoBubble text={t('budget_info_modo_anticipado')} />
                <button
                  className={`modo-toggle-btn${modoForm === 'anticipado' ? ' activo' : ''}`}
                  onClick={() => setModoForm('anticipado')}
                >
                  🕊️ Anticipado
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <InfoBubble text={t('budget_info_modo_base_cero')} />
                <button
                  className={`modo-toggle-btn${modoForm === 'base_cero' ? ' activo' : ''}`}
                  onClick={() => setModoForm('base_cero')}
                >
                  🔒 Base Cero
                </button>
              </div>
            </div>

            {/* Sliders */}
            <div className="reglas-slider-grupo">
              {([
                { key: 'necesidades', emoji: '🏠', label: 'Necesidades' },
                { key: 'deseos', emoji: '✨', label: 'Deseos' },
                { key: 'ahorro', emoji: '💎', label: t('budget_rule_ahorro') },
                { key: 'diezmo', emoji: '🙏', label: 'Diezmo' },
              ] as const).map(({ key, emoji, label }) => (
                <div className="regla-item" key={key}>
                  <div className="regla-item-header">
                    <span className="regla-item-label">{emoji} {label}</span>
                    <input
                      className="regla-pct-input"
                      type="number"
                      min={0} max={100}
                      value={reglasForm[key]}
                      onChange={e => setReglasForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                    />
                  </div>
                  <input
                    type="range"
                    className="regla-slider"
                    min={0} max={100} step={1}
                    value={reglasForm[key]}
                    onChange={e => setReglasForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                  />
                </div>
              ))}
            </div>

            {/* Suma */}
            <div className={`reglas-suma-display ${reglasValidas ? 'ok' : 'error'}`}>
              {reglasValidas
                ? t('budget_rules_total_perfect')
                : `⚠️ Total: ${sumaReglas.toFixed(0)}% — Debe ser exactamente 100%`}
            </div>

            {/* Día ancla */}
            <div className="dia-ancla-section">
              <div className="dia-ancla-label">{t("budget_golden_rules_anchor_day")}</div>
              <input
                className="dia-ancla-input"
                type="number"
                min={1} max={31}
                value={reglasForm.diaAncla}
                onChange={e => setReglasForm(f => ({ ...f, diaAncla: Number(e.target.value) }))}
              />
            </div>

            <div className="modal-btns">
              <button className="btn-cancelar" onClick={closeBudgetSettings}>
                Cancelar
              </button>
              <button
                className="btn-primario"
                onClick={handleGuardarReglas}
                disabled={!reglasValidas || loadingReglas}
              >
                {loadingReglas ? 'Guardando...' : 'Guardar Reglas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL: ACTIVAR BASE CERO
          ══════════════════════════════════════════════════════════ */}
      {showBaseCeroModal && (
        <div className="modal-overlay centrado" onClick={() => !loadingActivar && closeBudgetSettings()}>
          <div className="modal-sheet centrado-modal" onClick={e => e.stopPropagation()}>
            {paso === 1 ? (
              <>
                <div className="modal-titulo">🔒 Activar Modo Disciplina de Hierro</div>
                <div className="modal-subtitulo">{t("budget_golden_rules_modal_subtitle")}</div>

                <div className="contrato-lista">
                  <div className="contrato-item">
                    <span className="contrato-item-icono">⚠️</span>
                    {t("budget_golden_rules_modal_point1")}
                  </div>
                  <div className="contrato-item">
                    <span className="contrato-item-icono">⚠️</span>
                    {t("budget_golden_rules_modal_point2")}
                  </div>
                  <div className="contrato-item">
                    <span className="contrato-item-icono">⚠️</span>
                    {t("budget_golden_rules_modal_point3")}
                  </div>
                </div>

                <div className="contrato-acepto-section">
                  <div className="contrato-acepto-label">{t('activate_base_cero_confirm_prompt')}</div>
                  <input
                    className={`contrato-acepto-input${acepto.toUpperCase() === 'ACEPTO' ? ' valido' : ''}`}
                    type="text"
                    placeholder="ACEPTO"
                    value={acepto}
                    onChange={e => setAcepto(e.target.value)}
                  />
                </div>

                <div className="modal-btns">
                  <button className="btn-cancelar" onClick={closeBudgetSettings}>
                    Cancelar
                  </button>
                  <button
                    className="btn-primario peligro"
                    onClick={handlePasar2}
                    disabled={acepto.trim().toUpperCase() !== 'ACEPTO'}
                  >
                    Activar Disciplina
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-titulo">{t('budget_golden_rules_modal_sug_title')}</div>
                <div className="sugerencia-liquidez-info">
                  {t('budget_golden_rules_modal_liquidity_info', { monto: formatMonto(liquidezActivacion) })}
                </div>

                <div className="disclaimer-tip">
                  <span>💡</span>
                  <span>{t('budget_golden_rules_modal_disclaimer_text')}</span>
                </div>

                {sugerencias.length === 0 ? (
                  <div style={{ color: 'var(--color-text-muted)', fontSize: 'calc(13px * var(--font-scale))', textAlign: 'center', padding: '20px 0' }}>
                    {t('budget_golden_rules_modal_no_categories')}
                  </div>
                ) : (
                  <div className="sugerencias-lista">
                    {sugerencias.map(s => (
                      <div key={s.estructura_id} className="sugerencia-item">
                        <span className="sugerencia-nombre">
                          <CategoryIcon name={TIPO_CUPO_META[s.tipo_cupo]?.icono ?? '📦'} size={18} /> {t(s.nombre)}
                        </span>
                        <div className="sugerencia-monto">
                          <input
                            className="sugerencia-monto-input"
                            type="number"
                            value={montosEditados[s.estructura_id] ?? ''}
                            onChange={e => setMontosEditados(prev => ({
                              ...prev, [s.estructura_id]: e.target.value
                            }))}
                            onFocus={e => e.target.select()}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="modal-btns">
                  <button className="btn-cancelar" onClick={() => handleConfirmarActivacion(true)} disabled={loadingActivar}>
                    {t('btn_configure_later')}
                  </button>
                  <button
                    className="btn-primario"
                    onClick={() => handleConfirmarActivacion(false)}
                    disabled={loadingActivar}
                  >
                    {loadingActivar ? t('budget_btn_activating') : t('budget_btn_confirm_and_assign')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}


    </div>
  )
}

// ─── SUB-COMPONENTE: GRUPO ACORDEÓN ───────────────────────────────────────────

interface GrupoProps {
  tipo: string
  items: SobreDetalle[]
  abierto: boolean
  onToggle: () => void
  onAsignar: (s: SobreDetalle) => void
  modoPresupuesto?: 'base_cero' | 'anticipado'
}

function GrupoAcordeon({ tipo, items, abierto, onToggle, onAsignar, modoPresupuesto }: GrupoProps) {
  const meta = TIPO_CUPO_META[tipo] ?? { label: tipo.toUpperCase(), icono: '📦' }
  const totalAsignado = items.reduce((s, i) => s + Number(i.monto_asignado ?? 0), 0)

  return (
    <div className="acord-grupo">
      <div className="acord-grupo-header" onClick={onToggle}>
        <div className="acord-grupo-left">
          <span className="acord-grupo-icono"><CategoryIcon name={meta.icono} size={18} /></span>
          <span className="acord-grupo-titulo">{meta.label}</span>
        </div>
        <div className="acord-grupo-right">
          <span className="acord-grupo-total">
            {totalAsignado > 0 ? `$${Math.round(totalAsignado).toLocaleString('es-AR')}` : '—'}
          </span>
          <span className={`acord-chevron${abierto ? ' abierto' : ''}`}>▶</span>
        </div>
      </div>

      <div className={`acord-grupo-body${abierto ? ' abierto' : ''}`}>
        <div className="acord-separador" />
        {items.map((sobre, i) => (
          <FilaSobre
            key={sobre.estructura_id}
            sobre={sobre}
            isLast={i === items.length - 1}
            onAsignar={() => onAsignar(sobre)}
            modoPresupuesto={modoPresupuesto}
          />
        ))}
      </div>
    </div>
  )
}

// ─── SUB-COMPONENTE: FILA SOBRE ───────────────────────────────────────────────

interface FilaSobreProps {
  sobre: SobreDetalle
  isLast: boolean
  onAsignar: () => void
  modoPresupuesto?: 'base_cero' | 'anticipado'
}

function FilaSobre({ sobre, isLast, onAsignar, modoPresupuesto }: FilaSobreProps) {
  const pct = getPctBarra(Number(sobre.monto_gastado), Number(sobre.monto_asignado))
  const colorBarra = getColorBarra(sobre.estado_sobre)
  const sinDatos = sobre.estado_sobre === 'sin_movimiento'
  // En modo anticipado, el "disponible" del sobre NO arrastra el saldo del mes
  // anterior: cada mes arranca en 0 y se computa como asignado - gastado.
  // En base_cero, el arrastre si forma parte del disponible.
  const disponibleEfectivo = modoPresupuesto === 'anticipado'
    ? Number(sobre.monto_asignado ?? 0) - Number(sobre.monto_gastado ?? 0)
    : Number(sobre.monto_disponible ?? 0)
  const arrastre = Number(sobre.arrastre_mes_anterior ?? 0)

  const colorDisponible = () => {
    if (disponibleEfectivo < 0) return 'rojo'
    if (disponibleEfectivo === 0 && sobre.monto_asignado > 0) return 'neutro'
    if (sobre.estado_sobre === 'amarillo_precaucion') return 'amarillo'
    return 'verde'
  }

  return (
    <div className={`sobre-fila${sinDatos ? ' sin-datos' : ''}`} style={isLast ? { borderBottom: 'none' } : {}}>
      {/* Botón asignar */}
      <button className="sobre-btn-asignar" onClick={e => { e.stopPropagation(); onAsignar() }}>
        + Asignar
      </button>

      {/* Nombre */}
      <div className="sobre-fila-top">
        <div className="sobre-nombre">
          <span
            className="sobre-icono-circulo"
            style={{ background: sobre.color || 'var(--mint, #00B127)' }}
          >
            <CategoryIcon name={sobre.icono} size={18} />
          </span>
          <span>{t(sobre.nombre_categoria)}</span>
        </div>
        <span className={`sobre-disponible ${colorDisponible()}`} style={{ marginRight: 80 }}>
          {disponibleEfectivo >= 0 ? `$${Math.round(disponibleEfectivo).toLocaleString('es-AR')}` : `-$${Math.round(Math.abs(disponibleEfectivo)).toLocaleString('es-AR')}`}
        </span>
      </div>

      {/* Barra */}
      {!sinDatos && (
        <div className="sobre-barra-wrap">
          <div
            className={`sobre-barra-fill ${colorBarra}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Stats */}
      <div className="sobre-stats">
        <span className="sobre-stat">
          <span className="sobre-stat-label">Asig: </span>
          <span className="sobre-stat-val">${Math.round(Number(sobre.monto_asignado)).toLocaleString('es-AR')}</span>
        </span>
        <span className="sobre-stat">
          <span className="sobre-stat-label">Gast: </span>
          <span className="sobre-stat-val">${Math.round(Number(sobre.monto_gastado)).toLocaleString('es-AR')}</span>
        </span>
        {!sinDatos && (
          <span className="sobre-stat">
            <span className="sobre-stat-label">Avance: </span>
            <span className="sobre-stat-val">{pct}%</span>
          </span>
        )}
      </div>

      {/* Arrastre badge (solo base_cero, donde el arrastre es real) */}
      {modoPresupuesto !== 'anticipado' && arrastre > 0 && (
        <div className="sobre-arrastre-badge">
          ⚠️ {t('budget_carryover_warning')}: -{`$${Math.round(arrastre).toLocaleString('es-AR')}`}
        </div>
      )}

      {/* Bloque informativo modo anticipado: mientras el mes nuevo no tenga
          asignacion, mostrar el asignado y gastado del mes anterior para que
          el usuario pueda decidir cuanto asignar este mes. Se oculta en
          cuanto ya hay asignacion para el mes nuevo. Misma tipografia y
          tamano que los stats de la fila (Asig/Gast/Avance) para que no
          rompa la jerarquia visual de la tarjeta. */}
      {modoPresupuesto === 'anticipado' && Number(sobre.monto_asignado ?? 0) === 0 && (
        <div className="sobre-stats">
          <span className="sobre-stat">
            <span className="sobre-stat-label">📊 {t('budget_prev_month_assigned')}: </span>
            <span className="sobre-stat-val">${Math.round(Number(sobre.monto_asignado_anterior ?? 0)).toLocaleString('es-AR')}</span>
          </span>
          <span className="sobre-stat">
            <span className="sobre-stat-label">🧾 {t('budget_prev_month_spent')}: </span>
            <span className="sobre-stat-val">${Math.round(Number(sobre.monto_gastado_anterior ?? 0)).toLocaleString('es-AR')}</span>
          </span>
        </div>
      )}
    </div>
  )
}

// ─── INFO BUBBLE ─────────────────────────────────────────────────────────────

function InfoBubble({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className="info-bubble-btn"
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        aria-label={t("aria_label_info")}
      >
        i
      </button>
      {open && (
        <div className="info-bubble-overlay" onClick={() => setOpen(false)}>
          <div className="info-bubble-popup" onClick={e => e.stopPropagation()}>
            <div className="info-bubble-icon">💡</div>
            <div className="info-bubble-text">{text}</div>
            <button className="info-bubble-close" onClick={() => setOpen(false)}>{t("btn_understood")}</button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="presupuestos-empty">
      <div className="empty-icono">💰</div>
      <h3>{t("budget_empty_state_title")}</h3>
      <p>
        {t("budget_empty_state_desc1")}
        en la sección de <strong>{t("menu_categorias")}</strong> para empezar a presupuestar.
      </p>
    </div>
  )
}
