/**
 * AddMovementModal — Fase 2
 * Flujo de registro en pasos: Categoría → Monto → Cuenta → Fecha → Detalles → Confirmar
 * Refactor del formulario plano original a un Bottom Sheet por pasos.
 */
import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { useHogar } from '@/contexts/HogarContext'
import { rpc } from '@/lib/supabase'
import { CalculatorKeypad } from '@/components/CalculatorKeypad/CalculatorKeypad'
import { safeEval } from '@/utils/math'
import { t, parseError } from '@/locales/i18n'
import { SubcuentaModal } from '@/components/SubcuentaModal/SubcuentaModal'
import { AudioRecorderModal } from '@/components/saneamiento/AudioRecorderModal'
import { InitialBalanceModal } from '@/components/InitialBalanceModal/InitialBalanceModal'
import './AddMovementModal.css'

// ─── Tipos ──────────────────────────────────────────────────────────────────
type TipoMovimiento = 'expense' | 'income' | 'transfer'

interface Billetera {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
  es_fondo_prevision: boolean
  saldo_inicial_pendiente?: boolean
  icono: string
}

interface Hijo {
  estructura_id: number
  nombre_cuenta: string
  icono: string
  color?: string
  utilidad_placer?: number
  flexibilidad_recorte?: number
  es_hormiga?: boolean
}

interface Rubro {
  estructura_id: number
  nombre_cuenta: string
  icono: string
  color: string
  tipo_cupo: string
  hijos: Hijo[]
}

interface CatIngreso {
  producto_id: number
  nombre: string
  icono: string
  color: string
  es_pasivo: boolean
}

interface CategoriaSeleccionada {
  estructura_id: number | null
  nombre: string
  icono: string
  color: string
  es_padre: boolean
}

interface ProyectoHogar {
  proyecto_id: number
  nombre_proyecto: string
  icono: string
  presupuesto_meta: number
  total_aportado: number
  porcentaje_progreso: number
}

type Paso = 'tipo' | 'categoria' | 'monto' | 'cuenta' | 'fecha' | 'detalles'

const TIPO_CONFIG = {
  expense:  { label: t('type_expense', { defaultValue: 'Gasto' }),         emoji: '➖', color: 'var(--coral)', btnLabel: t('btn_add_expense', { defaultValue: 'Registrar Gasto' }) },
  income:   { label: t('type_income', { defaultValue: 'Ingreso' }),        emoji: '➕', color: 'var(--mint)',  btnLabel: t('btn_add_income', { defaultValue: 'Registrar Ingreso' }) },
  transfer: { label: t('type_transfer', { defaultValue: 'Transferencia' }),  emoji: '↔️', color: 'var(--blue)', btnLabel: t('btn_confirm_transfer', { defaultValue: 'Confirmar Transferencia' }) },
}

const FECHA_CHIPS = [
  { label: t('home_filter_period_today', { defaultValue: 'Hoy' }),        offset: 0 },
  { label: t('home_filter_shortcut_yesterday', { defaultValue: 'Ayer' }),       offset: 1 },
  { label: t('movement_days_ago_2'), offset: 2 },
]

function toLocalDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMonto(val: string, moneda: string) {
  const n = parseFloat(val) || 0
  return moneda === 'USD'
    ? `U$S ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

interface CuotasSelectorProps {
  cuotas: number
  setCuotas: (val: number) => void
  montoNum: number
  monedaOrigen: string
  formatMonto: (val: string, moneda: string) => string
}

function CuotasSelector({ cuotas, setCuotas, montoNum, monedaOrigen, formatMonto }: CuotasSelectorProps) {
  const presets = [1, 2, 3, 6, 9, 12, 18, 24]
  const isPreset = presets.includes(cuotas)

  return (
    <div className="cuotas-selector-container">
      <div className="cuotas-presets-row">
        {presets.map(p => (
          <button
            key={p}
            type="button"
            className={`cuotas-preset-btn ${cuotas === p ? 'active' : ''}`}
            onClick={() => setCuotas(p)}
          >
            {p}
          </button>
        ))}
        <div className="cuotas-manual-wrapper">
          <input
            type="number"
            min="1"
            max="120"
            className={`cuotas-manual-input ${!isPreset ? 'active' : ''}`}
            value={isPreset ? '' : cuotas}
            onChange={e => {
              const val = parseInt(e.target.value)
              if (!isNaN(val) && val > 0) {
                setCuotas(val)
              } else if (e.target.value === '') {
                setCuotas(1)
              }
            }}
            placeholder="Otro"
            inputMode="numeric"
          />
        </div>
      </div>
      {cuotas > 1 && montoNum > 0 && (
        <div className="cuotas-info-text">
          {cuotas} cuotas de <strong>{formatMonto((montoNum / cuotas).toString(), monedaOrigen)}</strong>
        </div>
      )}
    </div>
  )
}

interface ProyectosSelectorProps {
  proyectos: ProyectoHogar[]
  proyectoSeleccionadoId: number | null
  selectProyecto: (id: number | null) => void
}

function ProyectosSelector({ proyectos, proyectoSeleccionadoId, selectProyecto }: ProyectosSelectorProps) {
  if (proyectos.length === 0) return null
  return (
    <div className="proyectos-selector-container">
      <label className="step-label">{t('familia.proyecto_label')}</label>
      <div className="proyectos-pills-row">
        <button
          type="button"
          className={`proyecto-pill ${proyectoSeleccionadoId === null ? 'active' : ''}`}
          onClick={() => selectProyecto(null)}
        >
          🏠 {t('familia.proyecto_sin_proyecto')}
        </button>
        {proyectos.map(p => (
          <button
            key={p.proyecto_id}
            type="button"
            className={`proyecto-pill ${proyectoSeleccionadoId === p.proyecto_id ? 'active' : ''}`}
            onClick={() => selectProyecto(p.proyecto_id)}
          >
            <span style={{ marginRight: '6px' }}>{p.icono}</span>{p.nombre_proyecto}
          </button>
        ))}
      </div>
    </div>
  )
}

interface CompartidoToggleProps {
  checked: boolean
  onChange: (val: boolean) => void
  tienePareja: boolean
  proyectoSeleccionadoId: number | null
  onClearProyecto: () => void
}

function CompartidoToggle({ checked, onChange, tienePareja, proyectoSeleccionadoId, onClearProyecto }: CompartidoToggleProps) {
  if (!tienePareja) return null
  return (
    <div className="compartido-toggle-container">
      <label className="compartido-toggle-row">
        <div className="compartido-toggle-text">
          <span className="compartido-toggle-label">👥 {t('familia.compartido_toggle_label')}</span>
          <span className="compartido-toggle-help">
            {proyectoSeleccionadoId !== null
              ? t('familia.compartido_toggle_help')
              : t('familia.compartido_toggle_help')}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          className={`compartido-switch ${checked ? 'active' : ''}`}
          onClick={() => {
            const next = !checked
            onChange(next)
            if (!next) {
              // Si se apaga el toggle, limpiar el proyecto también
              onClearProyecto()
            }
          }}
        >
          <span className="compartido-switch-knob" />
        </button>
      </label>
    </div>
  )
}

// ─── Componente Principal ────────────────────────────────────────────────────
interface AddMovementModalProps {
  onClose: () => void
  onSuccess: () => void
  defaultTipo?: TipoMovimiento
  initialBilleteraId?: number
}

export function AddMovementModal({ onClose, onSuccess, defaultTipo = 'expense', initialBilleteraId }: AddMovementModalProps) {
  const { showToast } = useToast()

  // ── Estado global del formulario ──
  const [tipo, setTipo] = useState<TipoMovimiento>(defaultTipo)
  const [monto, setMonto] = useState('0')
  const [billeteraOrigenId, setBilleteraOrigenId] = useState<number | null>(null)
  const [origenTipo, setOrigenTipo] = useState<'billetera' | 'tarjeta'>('billetera')
  const [tarjetaId, setTarjetaId] = useState<number | null>(null)
  const [cuotas, setCuotas] = useState<number>(1)
  const [esUsd, setEsUsd] = useState(false)
  const [cotizacionUsd, setCotizacionUsd] = useState(1)
  const [billeteraDestinoId, setBilleteraDestinoId] = useState<number | null>(null)
  const [categoriaEgreso, setCategoriaEgreso] = useState<CategoriaSeleccionada | null>(null)
  const [categoriaIngreso, setCategoriaIngreso] = useState<CatIngreso | null>(null)
  const [fecha, setFecha] = useState(() => toLocalDate(0))
  const [nota, setNota] = useState('')
  const [detallesAbiertos, setDetallesAbiertos] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showAudioRecorder, setShowAudioRecorder] = useState(false)
  const [showInitialBalanceModal, setShowInitialBalanceModal] = useState(false)
  const [initialBalanceBilletera, setInitialBalanceBilletera] = useState<Billetera | null>(null)

  // ── Fase 4: Modo Familiar ──
  const { estado: hogarEstado } = useHogar()
  const [proyectosHogar, setProyectosHogar] = useState<ProyectoHogar[]>([])
  const [proyectoSeleccionadoId, setProyectoSeleccionadoId] = useState<number | null>(null)
  const [esCompartido, setEsCompartido] = useState(false)

  // ── Paso actual ──
  const [paso, setPaso] = useState<Paso>('categoria')
  const [frecuentesRecientes, setFrecuentesRecientes] = useState<CategoriaSeleccionada[]>([])
  const [showCalculator, setShowCalculator] = useState(true)
  const [mobileShowAllCat, setMobileShowAllCat] = useState(false)

  // ── Datos remotos ──
  const [billeteras, setBilleteras] = useState<Billetera[]>([])
  const [tarjetas, setTarjetas] = useState<any[]>([])
  const [rubros, setRubros] = useState<Rubro[]>([])
  const [catIngresos, setCatIngresos] = useState<CatIngreso[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const isMobile = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(max-width: 767px)')
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia('(max-width: 767px)').matches
  )

  // Auto-scroll the amount input to the rightmost side as user types calculations
  useEffect(() => {
    const timer = setTimeout(() => {
      const inputs = document.querySelectorAll('.monto-input-box-field')
      inputs.forEach(input => {
        if (input instanceof HTMLInputElement) {
          input.scrollLeft = input.scrollWidth
        }
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [monto])

  useEffect(() => {
    if (isMobile || loadingData) return
    const timer = window.setTimeout(() => {
      amountInputRef.current?.focus()
      amountInputRef.current?.select()
    }, 50)
    return () => window.clearTimeout(timer)
  }, [isMobile, loadingData, tipo])

  // ── UI helpers ──
  const [queryCat, setQueryCat] = useState('')
  const [expandedRubros, setExpandedRubros] = useState<Record<number, boolean>>({})
  const [showAllCat, setShowAllCat] = useState(false)
  const [fechaPersonalizada, setFechaPersonalizada] = useState(false)
  const inputFechaRef = useRef<HTMLInputElement>(null)
  const selectOrigenRef = useRef<HTMLSelectElement>(null)
  const amountInputRef = useRef<HTMLInputElement>(null)

  // ── Creación rápida de subcategoría ──
  const [showNewSubcatModal, setShowNewSubcatModal] = useState(false)
  const [newSubcatParent, setNewSubcatParent] = useState<Rubro | null>(null)

let cachedBilleteras: Billetera[] | null = null;
let cachedRubros: Rubro[] | null = null;
let cachedCatIngresos: CatIngreso[] | null = null;
let cachedTarjetas: any[] | null = null;
let cachedUsd: number | null = null;
let cachedProyectosHogar: ProyectoHogar[] | null = null;

  const normalizedCategoryQuery = queryCat.trim().toLowerCase()
  const filteredRubrosDesktop = rubros
    .filter((rubro) => {
      if (!normalizedCategoryQuery) return true
      const rubroName = t(rubro.nombre_cuenta).toLowerCase()
      if (rubroName.includes(normalizedCategoryQuery)) return true
      return (rubro.hijos ?? []).some((hijo) => {
        const childName = t(hijo.nombre_cuenta).toLowerCase()
        const combinedName = `${rubroName} ${childName}`
        return childName.includes(normalizedCategoryQuery) || combinedName.includes(normalizedCategoryQuery)
      })
    })
    .map((rubro) => ({
      ...rubro,
      hijos: [...(rubro.hijos ?? [])].sort((a, b) =>
        t(a.nombre_cuenta).localeCompare(t(b.nombre_cuenta), 'es', { sensitivity: 'base' })
      ),
    }))
  
  // NUNCA mostrar el cartel de cargando, como pidió el usuario.
  const remoteSectionLoading = false

  const reloadCategorias = async () => {
    try {
      const rubr = await rpc<Rubro[]>('fn_obtener_arbol_categorias')
      cachedRubros = rubr ?? []
      setRubros(cachedRubros)
    } catch (e) {
      console.error('Error reloading categories:', e)
    }
  }

  const reloadBilleteras = async () => {
    try {
      const bill = await rpc<Billetera[]>('fn_obtener_billeteras_ordenadas_por_uso').catch(
        () => rpc<Billetera[]>('fn_obtener_billeteras_activas').catch(() => [])
      )
      cachedBilleteras = bill ?? []
      setBilleteras(cachedBilleteras)
    } catch (e) {
      console.error('Error reloading billeteras:', e)
    }
  }

  const openNewSubcatModal = (parent: Rubro) => {
    setNewSubcatParent(parent)
    setShowNewSubcatModal(true)
  }

  // ── Carga inicial en paralelo con Caché en Memoria ──
  useEffect(() => {
    let alive = true
    ;(async () => {
      // Usar caché de inmediato si existe para que sea instantáneo
      if (cachedBilleteras) setBilleteras(cachedBilleteras)
      if (cachedRubros) setRubros(cachedRubros)
      if (cachedCatIngresos) setCatIngresos(cachedCatIngresos)
      if (cachedTarjetas) setTarjetas(cachedTarjetas)
      if (cachedUsd !== null) setCotizacionUsd(cachedUsd)
      if (cachedProyectosHogar && hogarEstado?.tiene_pareja) setProyectosHogar(cachedProyectosHogar)

      if (!cachedBilleteras) setLoadingData(true)
      
      try {
        const [bill, rubr, ingrCat, tarj, resUsd] = await Promise.all([
          rpc<Billetera[]>('fn_obtener_billeteras_ordenadas_por_uso').catch(
            () => rpc<Billetera[]>('fn_obtener_billeteras_activas').catch(() => [])
          ),
          rpc<Rubro[]>('fn_obtener_arbol_categorias').catch(() => []),
          rpc<CatIngreso[]>('fn_listar_categorias_ingreso').catch(() => []),
          rpc<any[]>('fn_reporte_mapa_tarjetas').catch(() => []),
          rpc<number>('fn_obtener_cotizacion_usd').catch(() => 1),
        ])
        if (!alive) return
        cachedBilleteras = bill ?? []
        cachedRubros = rubr ?? []
        cachedCatIngresos = ingrCat ?? []
        cachedTarjetas = tarj ?? []
        cachedUsd = resUsd ?? 1
        
        setBilleteras(cachedBilleteras)
        setRubros(cachedRubros)
        setCatIngresos(cachedCatIngresos)
        setTarjetas(cachedTarjetas)
        setCotizacionUsd(cachedUsd)

        // Si el usuario tiene hogar + pareja, cargar proyectos compartidos disponibles
        if (hogarEstado?.tiene_pareja) {
          try {
            const proyectos = await rpc<ProyectoHogar[]>('fn_reporte_proyectos_hogar')
            cachedProyectosHogar = proyectos ?? []
            setProyectosHogar(cachedProyectosHogar)
          } catch (e) {
            console.error('Error cargando proyectos del hogar:', e)
            cachedProyectosHogar = []
            setProyectosHogar([])
          }
        }

        // Preseleccionar la billetera inicial si se provee
        if (initialBilleteraId) {
          setBilleteraOrigenId(initialBilleteraId)
          if (defaultTipo === 'transfer') {
            const dest = (bill ?? []).find(b => b.billetera_id !== initialBilleteraId)
            if (dest) setBilleteraDestinoId(dest.billetera_id)
          }
        } else {
          // Preseleccionar la primera billetera operativa
          const primera = (bill ?? []).find(b => !b.es_fondo_prevision) ?? (bill ?? [])[0]
          if (primera) setBilleteraOrigenId(primera.billetera_id)
        }
      } finally {
        if (alive) setLoadingData(false)
      }
    })()
    return () => { alive = false }
  }, [hogarEstado?.tiene_pareja])

  // ── Cargar categorías frecuentes para móvil (desde la DB) ──
  useEffect(() => {
    if (rubros.length === 0) return

    const loadRecents = async () => {
      try {
        const data = await rpc<any[]>('fn_reporte_movimientos_recientes', {
          p_limit: 20,
          p_offset: 0,
          p_filtro_tipo: 'expense',
          p_fecha_inicio: '2000-01-01',
          p_fecha_fin: '2100-01-01'
        })
        
        if (data && data.length > 0) {
          const uniqueCats: CategoriaSeleccionada[] = []
          const seenIds = new Set<number>()
          
          for (const m of data) {
            let found: CategoriaSeleccionada | null = null
            for (const r of rubros) {
              if (r.nombre_cuenta === m.nombre_categoria) {
                found = {
                  estructura_id: r.estructura_id,
                  nombre: t(r.nombre_cuenta),
                  icono: r.icono,
                  color: r.color,
                  es_padre: true
                }
                break
              }
              if (r.hijos && r.hijos.length > 0) {
                const h = r.hijos.find(hijo => hijo.nombre_cuenta === m.nombre_categoria)
                if (h) {
                  found = {
                    estructura_id: h.estructura_id,
                    nombre: `${t(r.nombre_cuenta)} › ${t(h.nombre_cuenta)}`,
                    icono: h.icono || r.icono,
                    color: r.color,
                    es_padre: false
                  }
                  break
                }
              }
            }
            
            if (found && !seenIds.has(found.estructura_id!)) {
              seenIds.add(found.estructura_id!)
              uniqueCats.push(found)
              if (uniqueCats.length >= 5) break
            }
          }
          
          if (uniqueCats.length > 0) {
            setFrecuentesRecientes(uniqueCats)
            return
          }
        }
      } catch (err) {
        console.error('Error fetching recent movements for mobile favorites:', err)
      }

      // Fallback: top 5 from tree
      const fallbackList: CategoriaSeleccionada[] = []
      for (const r of rubros) {
        if (r.hijos && r.hijos.length > 0) {
          for (const h of r.hijos) {
            fallbackList.push({
              estructura_id: h.estructura_id,
              nombre: `${t(r.nombre_cuenta)} › ${t(h.nombre_cuenta)}`,
              icono: h.icono,
              color: r.color,
              es_padre: false
            })
          }
        } else {
          fallbackList.push({
            estructura_id: r.estructura_id,
            nombre: t(r.nombre_cuenta),
            icono: r.icono,
            color: r.color,
            es_padre: true
          })
        }
      }
      setFrecuentesRecientes(fallbackList.slice(0, 8))
    }

    loadRecents()
  }, [rubros])

  // ── Cuando cambia tipo, resetear categoría y paso ──
  const handleChangeTipo = useCallback((newTipo: TipoMovimiento) => {
    setTipo(newTipo)
    setCategoriaEgreso(null)
    setCategoriaIngreso(null)
    setMonto('0')
    setBilleteraDestinoId(null)
    setCuotas(1)
    if (newTipo === 'income' || newTipo === 'transfer') {
      setOrigenTipo('billetera')
      setTarjetaId(null)
    }
    // Transfer e Income saltan la selección de categoría
    setPaso(newTipo === 'expense' ? 'categoria' : 'monto')
  }, [])

  // ── Filtros de billeteras ──
  const numericMonto = parseFloat(monto) || 0
  const origenOptions = billeteras.filter(b => {
    if (tipo === 'expense') {
      return !b.es_fondo_prevision && b.saldo_actual >= numericMonto
    }
    return true
  })
  const monedaOrigen = origenTipo === 'billetera' 
    ? (billeteras.find(b => b.billetera_id === billeteraOrigenId)?.moneda ?? 'ARS')
    : 'ARS'
  const destinoOptions = billeteras.filter(b =>
    b.moneda === monedaOrigen && b.billetera_id !== billeteraOrigenId
  )

  // ── 8 frecuentes: tomadas directamente de los movimientos recientes de la DB ──
  const frecuentes: CategoriaSeleccionada[] = frecuentesRecientes.slice(0, 8)
  const frecuentesMobile: CategoriaSeleccionada[] = frecuentesRecientes.slice(0, 5)

  // ── Selección de categoría egreso ──
  const selectCatEgreso = useCallback((cat: CategoriaSeleccionada, rubro?: Rubro, forceParent = false) => {
    // Si es padre con hijos y no se fuerza la categoría padre, buscar el "[Sin Detalle]" hijo o usar el primero
    let finalCat = cat
    if (!forceParent && cat.es_padre && rubro && rubro.hijos.length > 0) {
      const sinDetalle = rubro.hijos.find(h => h.nombre_cuenta.toLowerCase().includes('sin detalle') || h.nombre_cuenta.toLowerCase().includes('[sin'))
      const hijo = sinDetalle ?? rubro.hijos[0]
      finalCat = { estructura_id: hijo.estructura_id, nombre: `${t(rubro.nombre_cuenta)} › ${t(hijo.nombre_cuenta)}`, icono: hijo.icono, color: rubro.color, es_padre: false }
    }
    setCategoriaEgreso(finalCat)
    // Excluyente con proyecto compartido
    if (proyectoSeleccionadoId !== null) setProyectoSeleccionadoId(null)
    setShowAllCat(false)
    setQueryCat('')
    setPaso('monto')
  }, [proyectoSeleccionadoId])

  // ── Selección de proyecto compartido (excluyente con categoriaEgreso) ──
  const selectProyecto = useCallback((proyectoId: number | null) => {
    setProyectoSeleccionadoId(proyectoId)
    if (proyectoId !== null) {
      // Si elige un proyecto, suelta la categoría (el proyecto es destino en sí mismo)
      setCategoriaEgreso(null)
      setEsCompartido(true)
    } else {
      // Si deselecciona proyecto y el toggle estaba ON, mantenlo (puede ser gasto compartido general)
      // El usuario decidirá explícitamente.
    }
  }, [])

  const handleMobileCategoryChange = useCallback((val: string) => {
    if (!val) {
      setCategoriaEgreso(null)
      return
    }
    const [type, idStr] = val.split(':')
    const id = parseInt(idStr)
    if (type === 'parent') {
      const rubro = rubros.find(r => r.estructura_id === id)
      if (rubro) {
        setCategoriaEgreso({
          estructura_id: rubro.estructura_id,
          nombre: t(rubro.nombre_cuenta),
          icono: rubro.icono,
          color: rubro.color,
          es_padre: true
        })
      }
    } else {
      for (const rubro of rubros) {
        const hijo = rubro.hijos?.find(h => h.estructura_id === id)
        if (hijo) {
          setCategoriaEgreso({
            estructura_id: hijo.estructura_id,
            nombre: `${t(rubro.nombre_cuenta)} › ${t(hijo.nombre_cuenta)}`,
            icono: hijo.icono,
            color: rubro.color,
            es_padre: false
          })
          break
        }
      }
    }
  }, [rubros])

  // ── Confirmar monto calculadora ──
  const handleConfirmMonto = useCallback(() => {
    const n = parseFloat(monto)
    if (!n || n <= 0) return
    setPaso('cuenta')
  }, [monto])

  // ── Guardar ──
  const handleSave = async () => {
    const montoNum = parseFloat(monto)
    if (!montoNum || montoNum <= 0) return showToast(t('error_invalid_amount'), 'error')
    if (origenTipo === 'billetera' && !billeteraOrigenId) return showToast('Selecciona una cuenta', 'error')
    
    // Check pending initial balance
    if (origenTipo === 'billetera' && billeteraOrigenId) {
      const bOrigen = billeteras.find(b => b.billetera_id === billeteraOrigenId)
      if (bOrigen?.saldo_inicial_pendiente) {
        setInitialBalanceBilletera(bOrigen)
        setShowInitialBalanceModal(true)
        return
      }
    }
    
    if (origenTipo === 'tarjeta' && !tarjetaId) return showToast('Selecciona una tarjeta', 'error')
    if (tipo === 'expense' && !categoriaEgreso && !proyectoSeleccionadoId) {
      return showToast(t('familia.error_no_categoria_ni_proyecto'), 'error')
    }
    if (tipo === 'transfer' && !billeteraDestinoId) return showToast('Selecciona cuenta destino', 'error')
    if (tipo === 'transfer' && billeteraDestinoId) {
      const bDest = billeteras.find(b => b.billetera_id === billeteraDestinoId)
      if (bDest?.saldo_inicial_pendiente) {
        setInitialBalanceBilletera(bDest)
        setShowInitialBalanceModal(true)
        return
      }
    }

    // Determinar flags de hogar y descripción
    const proyectoId = proyectoSeleccionadoId
    const proyectoObj = proyectosHogar.find(p => p.proyecto_id === proyectoId) ?? null
    const descripcionFinal = tipo === 'expense'
      ? (categoriaEgreso?.nombre ?? proyectoObj?.nombre_proyecto ?? 'Gasto')
      : (tipo === 'income' ? (categoriaIngreso?.nombre ?? null) : 'Transferencia')

    setLoading(true)
    try {
      if (tipo === 'expense' && origenTipo === 'tarjeta' && tarjetaId) {
        await rpc('fn_registrar_gasto_tarjeta', {
          p_tarjeta_id: tarjetaId,
          p_monto_total: montoNum,
          p_cuotas: cuotas,
          p_estructura_egreso_id: categoriaEgreso?.estructura_id ?? null,
          p_fecha: fecha,
          p_descripcion: descripcionFinal,
          p_detalle: nota.trim() || null,
          p_es_compartido: esCompartido,
          p_proyecto_id: proyectoId,
          p_es_usd: esUsd
        })
      } else {
        await rpc('fn_registrar_movimiento_caja', {
          p_tipo: tipo,
          p_billetera_origen_id: billeteraOrigenId,
          p_billetera_destino_id: tipo === 'transfer' ? billeteraDestinoId : null,
          p_valor_ingreso: tipo === 'income' ? montoNum : 0,
          p_valor_egreso: tipo !== 'income' ? montoNum : 0,
          p_descripcion: descripcionFinal,
          p_fecha: fecha,
          p_es_compartido: esCompartido,
          p_estructura_egreso_id: tipo === 'expense' ? categoriaEgreso?.estructura_id ?? null : null,
          p_proyecto_id: proyectoId,
          p_cuenta_ingreso_id: tipo === 'income' ? categoriaIngreso?.producto_id ?? null : null,
          p_detalle: nota.trim() || null,
        })
      }

      showToast(`${TIPO_CONFIG[tipo].btnLabel.replace('Registrar ', '').replace('Confirmar ', '')} registrado`, 'success')
      onSuccess()
      onClose()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  const montoNum = parseFloat(monto) || 0
  const canConfirm = montoNum > 0 && (origenTipo === 'billetera' ? !!billeteraOrigenId : !!tarjetaId) && (tipo !== 'expense' || !!categoriaEgreso || !!proyectoSeleccionadoId) && (tipo !== 'transfer' || !!billeteraDestinoId)
  const cfg = TIPO_CONFIG[tipo]

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="bottom-sheet-overlay" onClick={onClose} />
      <div className="add-movement-sheet">

        {/* ── PANEL LATERAL DESKTOP ── */}
        <div className="modal-side-panel">
          <div className="modal-side-panel-title">Registrar</div>

          {/* Tipo en panel desktop */}
          <div className="modal-type-tabs">
            {(Object.entries(TIPO_CONFIG) as [TipoMovimiento, typeof TIPO_CONFIG.expense][]).map(([tp, cfg]) => (
              <button key={tp} type="button"
                className={`modal-type-tab ${tp} ${tipo === tp ? 'active' : ''}`}
                onClick={() => handleChangeTipo(tp)}>
                <span className="modal-type-tab-icon">{cfg.emoji}</span>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>{cfg.label}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Preview monto */}
          <div className="modal-side-info">
            <div className="modal-side-info-label">Importe</div>
            <div className="modal-side-info-value" style={{ color: montoNum > 0 ? cfg.color : 'var(--text-3)' }}>
              {formatMonto(monto, monedaOrigen)}
            </div>
            {categoriaEgreso && (
              <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '8px' }}>
                {categoriaEgreso.icono} {categoriaEgreso.nombre}
              </div>
            )}
            {categoriaIngreso && (
              <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '8px' }}>
                {categoriaIngreso.icono} {categoriaIngreso.nombre}
              </div>
            )}
          </div>
        </div>

        {/* ── CONTENIDO PRINCIPAL ── */}
        <div className="modal-main-content">

          {/* Handle mobile + header */}
          <div className="modal-drag-handle" />
          <div className="modal-top-bar">
            {/* Tipo selector mobile */}
            <div className="movement-type-selector">
              {(Object.entries(TIPO_CONFIG) as [TipoMovimiento, typeof TIPO_CONFIG.expense][]).map(([tp, c]) => (
                <button key={tp} type="button"
                  className={`movement-type-btn ${tp} ${tipo === tp ? 'active' : ''}`}
                  onClick={() => handleChangeTipo(tp)}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
            <button className="modal-close-btn" onClick={onClose}>✕</button>
          </div>

          <div className="modal-steps-body">
              {!isMobile ? (
                /* ─── VISTA UNIFICADA EN PC (TODAS LAS PANTALLAS EN UNA) ─── */
                <div className="pc-unified-form">
                  
                  {/* COLUMNA 1: IMPORTE & CUENTAS */}
                  <div className="pc-form-col billing-col">
                    <div className="step-title">1. Importe y Cuentas</div>
                    
                    {/* Importe Input */}
                    <div className="monto-display-wrap" style={{ padding: '0 0 16px 0' }}>
                      <div className="monto-input-container">
                        <span className="monto-currency-symbol">
                          {monedaOrigen === 'USD' ? 'U$S' : '$'}
                        </span>
                        <input
                          ref={amountInputRef}
                          type="text"
                          className="monto-input-box-field"
                          placeholder="0"
                          value={monto === '0' ? '' : monto}
                          onChange={e => {
                            const val = e.target.value;
                            if (/^[0-9.,+\-*/()]*$/.test(val)) {
                              setMonto(val.replace(',', '.'));
                            }
                          }}
                          onBlur={() => {
                            if (monto && /[+\-*/]/.test(monto)) {
                              try {
                                const evalRes = safeEval(monto);
                                if (evalRes && !isNaN(evalRes) && isFinite(evalRes)) {
                                  setMonto(parseFloat(evalRes.toFixed(2)).toString());
                                }
                              } catch (e) {}
                            }
                          }}
                        />
                      </div>
                    </div>

                    {/* Origen */}
                    <label className="step-label">
                      {tipo === 'transfer' ? 'Cuenta Origen' : (tipo === 'expense' ? 'Cuenta o Tarjeta' : 'Cuenta / Billetera')}
                    </label>
                    {remoteSectionLoading ? (
                      <div className="warning-card" style={{ padding: '16px', textAlign: 'center', width: '100%' }}>
                        <div className="spinner" style={{ margin: '0 auto 10px auto' }} />
                        {t('loading')}
                      </div>
                    ) : (
                    <div className="cuenta-lista pc-max-height">
                      {tipo === 'expense' && origenOptions.length === 0 ? (
                        <div className="warning-card" style={{ color: 'var(--coral)', padding: '12px', textAlign: 'center', background: 'rgba(255,107,107,0.08)', borderRadius: '10px', fontSize: '13px', margin: '8px 0', width: '100%' }}>
                          ⚠️ {t('error_no_sufficient_balance_wallets')}
                        </div>
                      ) : (
                        origenOptions.map(b => (
                          <button key={`b_${b.billetera_id}`} type="button"
                            className={`cuenta-item ${origenTipo === 'billetera' && billeteraOrigenId === b.billetera_id ? 'active' : ''}`}
                            onClick={() => { setOrigenTipo('billetera'); setBilleteraOrigenId(b.billetera_id); setTarjetaId(null); setBilleteraDestinoId(null) }}>
                            <span className="cuenta-icono">{b.icono || '💳'}</span>
                            <div className="cuenta-info">
                              <div className="cuenta-nombre">{b.nombre}</div>
                              <div className="cuenta-moneda">{b.moneda}</div>
                            </div>
                            <div className="cuenta-saldo" style={{ color: b.saldo_actual >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                              {formatMonto(b.saldo_actual.toString(), b.moneda)}
                            </div>
                          </button>
                        ))
                      )}
                      {tipo === 'expense' && tarjetas.map(t => (
                        <button key={`t_${t.tarjeta_id}`} type="button"
                          className={`cuenta-item ${origenTipo === 'tarjeta' && tarjetaId === t.tarjeta_id ? 'active' : ''}`}
                          onClick={() => { setOrigenTipo('tarjeta'); setTarjetaId(t.tarjeta_id); setBilleteraOrigenId(null); setBilleteraDestinoId(null) }}>
                          <span className="cuenta-icono">💳</span>
                          <div className="cuenta-info">
                            <div className="cuenta-nombre">{t.nombre_tarjeta}</div>
                            <div className="cuenta-moneda">ARS</div>
                          </div>
                          <div className="cuenta-saldo" style={{ color: 'var(--text-3)', fontSize: '11px' }}>
                            Crédito
                          </div>
                        </button>
                      ))}
                    </div>
                    )}

                    {/* Cuotas PC */}
                    {tipo === 'expense' && origenTipo === 'tarjeta' && (
                      <div style={{ marginTop: '16px' }}>
                        <label className="step-label">Cantidad de Cuotas</label>
                        <CuotasSelector
                          cuotas={cuotas}
                          setCuotas={setCuotas}
                          montoNum={montoNum}
                          monedaOrigen={monedaOrigen}
                          formatMonto={formatMonto}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 500 }}>{t('card_usd_purchase')}</span>
                          </div>
                          <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
                            <input type="checkbox" checked={esUsd} onChange={e => setEsUsd(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                            <span style={{
                              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                              backgroundColor: esUsd ? 'var(--color-mint)' : 'rgba(255,255,255,0.2)',
                              transition: '.3s', borderRadius: 24
                            }}>
                              <span style={{
                                position: 'absolute', content: '""', height: 18, width: 18, left: 3, bottom: 3,
                                backgroundColor: 'white', transition: '.3s', borderRadius: '50%',
                                transform: esUsd ? 'translateX(20px)' : 'translateX(0)'
                              }} />
                            </span>
                          </label>
                        </div>
                        {esUsd && montoNum > 0 && (() => {
                          const tc = tarjetas.find(t => t.tarjeta_id === tarjetaId)
                          const rPct = tc?.recargo_dolar_pct ? parseFloat(tc.recargo_dolar_pct) : 30
                          const mFinal = montoNum * cotizacionUsd * (1 + rPct / 100)
                          return (
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 8, marginTop: 8, borderLeft: '3px solid var(--color-mint)' }}>
                              {t('card_usd_quote_current', { rate: formatMonto(cotizacionUsd.toString(), 'ARS'), pct: rPct })}
                              <br/><span style={{ color: 'var(--color-text)', fontWeight: 'bold' }}>Total estimado ARS: {formatMonto(mFinal.toString(), 'ARS')}</span>
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {/* Destino (solo transfer) */}
                    {tipo === 'transfer' && !remoteSectionLoading && (
                      <>
                        <label className="step-label" style={{ marginTop: '16px' }}>Cuenta Destino</label>
                        {destinoOptions.length === 0 ? (
                          <div className="step-warning">⚠️ No hay cuentas en {monedaOrigen} para transferir</div>
                        ) : (
                          <div className="cuenta-lista pc-max-height">
                            {destinoOptions.map(b => (
                              <button key={b.billetera_id} type="button"
                                className={`cuenta-item ${billeteraDestinoId === b.billetera_id ? 'active' : ''}`}
                                onClick={() => setBilleteraDestinoId(b.billetera_id)}>
                                <span className="cuenta-icono">{b.icono || '💳'}</span>
                                <div className="cuenta-info">
                                  <div className="cuenta-nombre">{b.nombre}</div>
                                  <div className="cuenta-moneda">{b.moneda}</div>
                                </div>
                                <div className="cuenta-saldo">{formatMonto(b.saldo_actual.toString(), b.moneda)}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* COLUMNA 2: CATEGORÍA (Solo para Gastos) */}
                  {tipo === 'expense' ? (
                    <div className="pc-form-col category-col">
                      {showAllCat && !categoriaEgreso ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <div className="step-title" style={{ margin: 0 }}>2. {t('step_category')}</div>
                          <button type="button" className="btn-back-recents" onClick={() => { setShowAllCat(false); setQueryCat(''); }} style={{
                            background: 'var(--surface-3)',
                            border: 'none',
                            color: 'var(--text-2)',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontFamily: 'var(--font-sans)'
                          }}>
                            ← Volver
                          </button>
                        </div>
                      ) : (
                        <div className="step-title">2. {t('step_category')}</div>
                      )}

                      {/* Selector de proyectos (sólo si tiene pareja y hay proyectos) */}
                      {!remoteSectionLoading && hogarEstado?.tiene_pareja && proyectosHogar.length > 0 && !showAllCat && (
                        <ProyectosSelector
                          proyectos={proyectosHogar}
                          proyectoSeleccionadoId={proyectoSeleccionadoId}
                          selectProyecto={(id) => {
                            selectProyecto(id)
                            if (id !== null) setShowAllCat(false)
                          }}
                        />
                      )}
                      
                      {remoteSectionLoading ? (
                        <div className="warning-card" style={{ padding: '16px', textAlign: 'center', width: '100%' }}>
                          <div className="spinner" style={{ margin: '0 auto 10px auto' }} />
                          {t('loading')}
                        </div>
                      ) : categoriaEgreso ? (
                        <div className="cat-selected-pill" onClick={() => { setCategoriaEgreso(null); setQueryCat('') }} style={{ border: `1px solid ${categoriaEgreso.color}` }}>
                          <span style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            backgroundColor: categoriaEgreso.color,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#000000',
                            marginRight: '8px'
                          }}>
                            <span style={{ filter: 'brightness(0)' }}>{categoriaEgreso.icono}</span>
                          </span>
                          <span>{categoriaEgreso.nombre}</span>
                          <span className="cat-selected-edit">✏️</span>
                        </div>
                      ) : (
                        <>
                          <div className="cat-quick-search">
                            <span>🔍</span>
                            <input placeholder={t("placeholder_search_category")} value={queryCat}
                              onChange={e => { setQueryCat(e.target.value); setShowAllCat(true) }}
                              className="cat-quick-input" />
                          </div>
                          
                          {!showAllCat && frecuentesMobile.length > 0 ? (
                            <>
                              <div className="desktop-categories-toolbar">
                                <button type="button" className="btn-link-ver-todas desktop-visible-link" onClick={() => setShowAllCat(true)}>
                                  + {t("btn_see_all_categories")}
                                </button>
                              </div>
                              <div className="cat-frecuentes-grid">
                                {frecuentesMobile.slice(0, 5).map((cat, i) => {
                                  const rubro = rubros.find(r => r.estructura_id === cat.estructura_id || r.hijos?.some(h => h.estructura_id === cat.estructura_id))
                                  return (
                                    <button key={i} type="button"
                                      className="cat-tile"
                                      style={{ '--tile-color': cat.color } as React.CSSProperties}
                                      onClick={() => selectCatEgreso(cat, rubro)}>
                                      <span className="cat-tile-icon" style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        backgroundColor: cat.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '16px',
                                        color: '#000000',
                                        margin: '0 auto 4px auto'
                                      }}>
                                        <span style={{ filter: 'brightness(0)' }}>{cat.icono}</span>
                                      </span>
                                      <span className="cat-tile-name">{cat.nombre.split(' › ').pop()}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </>
                          ) : (
                            <div className="cat-acordeon">
                              {filteredRubrosDesktop.map(rubro => (
                                  <div key={rubro.estructura_id} className="cat-acordeon-rubro">
                                    <div className="cat-acordeon-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}>
                                      <div 
                                        style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }}
                                        onClick={() => {
                                          if (rubro.hijos.length > 0) {
                                            setExpandedRubros(p => ({ ...p, [rubro.estructura_id]: !p[rubro.estructura_id] }));
                                          } else {
                                            selectCatEgreso({ estructura_id: rubro.estructura_id, nombre: t(rubro.nombre_cuenta), icono: rubro.icono, color: rubro.color, es_padre: true }, rubro, true);
                                          }
                                        }}
                                      >
                                        <div style={{
                                          width: '28px',
                                          height: '28px',
                                          borderRadius: '8px',
                                          backgroundColor: rubro.color,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: '15px',
                                          color: '#000000',
                                          flexShrink: 0
                                        }}>
                                          <span style={{ filter: 'brightness(0)' }}>{rubro.icono}</span>
                                        </div>
                                        <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>{t(rubro.nombre_cuenta)}</span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center' }}>
                                        {(rubro.hijos.length === 0 || !!expandedRubros[rubro.estructura_id]) && (
                                          <button
                                            type="button"
                                            className="btn-add-subcat-quick"
                                            title={t("title_add_subcategory")}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openNewSubcatModal(rubro);
                                            }}
                                            style={{
                                              background: 'rgba(255,255,255,0.06)',
                                              border: '1px solid rgba(255,255,255,0.15)',
                                              borderRadius: '6px',
                                              color: '#FFFFFF',
                                              width: '26px',
                                              height: '26px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              fontSize: '18px',
                                              fontWeight: 'bold',
                                              cursor: 'pointer',
                                              marginRight: '8px',
                                              transition: 'all 0.15s'
                                            }}
                                          >
                                            +
                                          </button>
                                        )}
                                        {rubro.hijos.length > 0 && (
                                          <span style={{ color: 'var(--text-3)', fontSize: '14px', marginRight: '6px' }}>
                                            {expandedRubros[rubro.estructura_id] ? '▾' : '▸'}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {(expandedRubros[rubro.estructura_id] || !!queryCat) && (
                                      <div className="cat-acordeon-hijos">
                                        {rubro.hijos.length === 0 ? (
                                          <button type="button" className="cat-acordeon-hijo"
                                            onClick={() => selectCatEgreso({ estructura_id: rubro.estructura_id, nombre: t(rubro.nombre_cuenta), icono: rubro.icono, color: rubro.color, es_padre: true }, rubro, true)}>
                                            <span style={{
                                              width: '24px',
                                              height: '24px',
                                              borderRadius: '6px',
                                              backgroundColor: rubro.color,
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              fontSize: '12px',
                                              color: '#000000',
                                              marginRight: '6px',
                                              flexShrink: 0
                                            }}>
                                              <span style={{ filter: 'brightness(0)' }}>{rubro.icono}</span>
                                            </span> {t(rubro.nombre_cuenta)}
                                          </button>
                                        ) : (
                                          rubro.hijos.map(h => (
                                            <button key={h.estructura_id} type="button" className="cat-acordeon-hijo"
                                              onClick={() => selectCatEgreso({ estructura_id: h.estructura_id, nombre: `${t(rubro.nombre_cuenta)} › ${t(h.nombre_cuenta)}`, icono: h.icono, color: rubro.color, es_padre: false }, rubro)}>
                                              <span style={{
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '6px',
                                                backgroundColor: rubro.color,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '12px',
                                                color: '#000000',
                                                marginRight: '6px',
                                                flexShrink: 0
                                              }}>
                                                <span style={{ filter: 'brightness(0)' }}>{h.icono}</span>
                                              </span> {t(h.nombre_cuenta)}
                                              {h.es_hormiga && <span className="hormiga-badge">🐜</span>}
                                            </button>
                                          ))
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : tipo === 'income' ? (
                    <div className="pc-form-col category-col">
                      <div className="step-title">2. Fuente de Ingreso</div>
                      {!remoteSectionLoading && (
                        <div className="cuenta-lista" style={{ overflowY: 'auto', flex: 1, gap: '8px', display: 'flex', flexDirection: 'column' }}>
                          {catIngresos.map(ci => (
                            <button key={ci.producto_id} type="button"
                              className={`cuenta-item ${categoriaIngreso?.producto_id === ci.producto_id ? 'active' : ''}`}
                              onClick={() => setCategoriaIngreso(p => p?.producto_id === ci.producto_id ? null : ci)}>
                              <span className="cuenta-icono">{ci.icono}</span>
                              <div className="cuenta-nombre">{ci.nombre}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* COLUMNA 3: FECHA & DETALLES */}
                  <div className="pc-form-col details-col">
                    <div className="step-title">3. Detalles</div>
                    
                    <label className="step-label">Fecha</label>
                    <div className="fecha-chips">
                      {FECHA_CHIPS.map(chip => {
                        const val = toLocalDate(chip.offset)
                        const active = fecha === val && !fechaPersonalizada
                        return (
                          <button key={chip.label} type="button"
                            className={`fecha-chip ${active ? 'active' : ''}`}
                            style={active ? { borderColor: cfg.color, color: cfg.color } : {}}
                            onClick={() => { setFecha(val); setFechaPersonalizada(false) }}>
                            {chip.label}
                          </button>
                        )
                      })}
                      <button type="button"
                        className={`fecha-chip ${fechaPersonalizada ? 'active' : ''}`}
                        style={fechaPersonalizada ? { borderColor: cfg.color, color: cfg.color } : {}}
                        onClick={() => { setFechaPersonalizada(true); setTimeout(() => inputFechaRef.current?.showPicker?.(), 50) }}>
                        📅 Otra
                      </button>
                    </div>

                    {fechaPersonalizada && (
                      <input ref={inputFechaRef} type="date" className="form-control mb-3" value={fecha}
                        onChange={e => setFecha(e.target.value)} />
                    )}

                    {/* Nota */}
                    <label className="step-label" style={{ marginTop: '12px' }}>Nota (opcional)</label>
                    <input className="form-control mb-2" value={nota} onChange={e => setNota(e.target.value)}
                      enterKeyHint="next"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const modal = e.currentTarget.closest('.modal-body') || e.currentTarget.closest('div')
                          if (modal) {
                            const inputs = Array.from(modal.querySelectorAll('input:not([disabled]), select:not([disabled]), button:not([disabled])')) as HTMLElement[]
                            const index = inputs.indexOf(e.currentTarget)
                            if (index > -1 && index < inputs.length - 1) {
                              inputs[index + 1].focus()
                            } else {
                              e.currentTarget.blur()
                            }
                          } else {
                            e.currentTarget.blur()
                          }
                        }
                      }}
                      placeholder="Ej: Almuerzo de negocios..." />

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm w-100 mb-3"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      onClick={() => setShowAudioRecorder(true)}
                    >
                      🎙️ {t('add_movement_voice_button')}
                    </button>

                    {/* Toggle compartido (Fase 4) — sólo gastos, sólo si tiene pareja */}
                    {tipo === 'expense' && (
                      <CompartidoToggle
                        checked={esCompartido}
                        onChange={setEsCompartido}
                        tienePareja={!!hogarEstado?.tiene_pareja}
                        proyectoSeleccionadoId={proyectoSeleccionadoId}
                        onClearProyecto={() => setProyectoSeleccionadoId(null)}
                      />
                    )}


                    {/* Resumen sutil */}
                    <div className="pc-summary-box" style={{ marginTop: 'auto' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: 'var(--text-3)' }}>Importe total:</span>
                        <span style={{ fontWeight: 800, color: cfg.color }}>{formatMonto(monto, monedaOrigen)}</span>
                      </div>
                      {categoriaEgreso && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-3)' }}>{t("label_category")}:</span>
                          <span>{categoriaEgreso.icono} {categoriaEgreso.nombre}</span>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              ) : tipo === 'transfer' ? (
                /* ─── VISTA UNIFICADA DE TRANSFERENCIA EN MÓVIL ─── */
                <div className="mobile-unified-transfer" style={{ width: '100%' }}>
                  <div className="step-title">Transferencia</div>

                  {/* Importe */}
                  <label className="step-label">Importe</label>
                  <div className="monto-display-wrap" style={{ padding: '0 0 16px 0' }}>
                    <div className="monto-input-container" style={{ width: '100%', maxWidth: 'none' }}>
                      <span className="monto-currency-symbol">
                        {monedaOrigen === 'USD' ? 'U$S' : '$'}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="next"
                        className="monto-input-box-field"
                        placeholder="0"
                        value={monto === '0' ? '' : monto}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            selectOrigenRef.current?.focus();
                          }
                        }}
                        onChange={e => {
                          const val = e.target.value;
                          if (/^[0-9.,+\-*/()]*$/.test(val)) {
                            setMonto(val.replace(',', '.'));
                          }
                        }}
                      />
                    </div>
                  </div>

                  {remoteSectionLoading ? (
                    <div className="warning-card" style={{ padding: '16px', textAlign: 'center', width: '100%', marginBottom: '16px' }}>
                      <div className="spinner" style={{ margin: '0 auto 10px auto' }} />
                      {t('loading')}
                    </div>
                  ) : (
                  <>
                  {/* Cuentas en desplegables */}
                  <label className="step-label">Cuenta Origen</label>
                  <select
                    ref={selectOrigenRef}
                    className="form-control mb-3"
                    value={billeteraOrigenId || ''}
                    onChange={e => {
                      const val = Number(e.target.value) || null
                      setBilleteraOrigenId(val)
                      setBilleteraDestinoId(null)
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      color: 'var(--text)',
                      fontSize: '14px',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)',
                      marginBottom: '16px'
                    }}
                  >
                    <option value="" style={{ background: 'var(--surface)', color: 'var(--text-3)' }}>Selecciona origen...</option>
                    {origenOptions.map(b => (
                      <option key={b.billetera_id} value={b.billetera_id} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                        {b.icono || '💳'} {b.nombre} ({formatMonto(b.saldo_actual.toString(), b.moneda)})
                      </option>
                    ))}
                  </select>

                  <label className="step-label">Cuenta Destino</label>
                  <select
                    className="form-control mb-3"
                    value={billeteraDestinoId || ''}
                    onChange={e => setBilleteraDestinoId(Number(e.target.value) || null)}
                    disabled={!billeteraOrigenId}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      color: 'var(--text)',
                      fontSize: '14px',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)',
                      marginBottom: '16px'
                    }}
                  >
                    <option value="" style={{ background: 'var(--surface)', color: 'var(--text-3)' }}>Selecciona destino...</option>
                    {destinoOptions.map(b => (
                      <option key={b.billetera_id} value={b.billetera_id} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                        {b.icono || '💳'} {b.nombre} ({formatMonto(b.saldo_actual.toString(), b.moneda)})
                      </option>
                    ))}
                  </select>

                  {/* Cuándo (Fecha) */}
                  <label className="step-label">{t("step_when")}</label>
                  <div className="fecha-chips" style={{ marginBottom: '16px' }}>
                    {FECHA_CHIPS.map(chip => {
                      const val = toLocalDate(chip.offset)
                      const active = fecha === val && !fechaPersonalizada
                      return (
                        <button key={chip.label} type="button"
                          className={`fecha-chip ${active ? 'active' : ''}`}
                          style={active ? { borderColor: cfg.color, color: cfg.color } : {}}
                          onClick={() => { setFecha(val); setFechaPersonalizada(false) }}>
                          {chip.label}
                        </button>
                      )
                    })}
                    <button type="button"
                      className={`fecha-chip ${fechaPersonalizada ? 'active' : ''}`}
                      style={fechaPersonalizada ? { borderColor: cfg.color, color: cfg.color } : {}}
                      onClick={() => { setFechaPersonalizada(true); setTimeout(() => inputFechaRef.current?.showPicker?.(), 50) }}>
                      📅 Otra
                    </button>
                  </div>

                  {fechaPersonalizada && (
                    <input ref={inputFechaRef} type="date" className="form-control mb-3" value={fecha}
                      onChange={e => setFecha(e.target.value)} style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        color: 'var(--text)',
                        fontSize: '14px',
                        marginBottom: '16px'
                      }} />
                  )}

                  {/* Nota */}
                  <label className="step-label">Nota (opcional)</label>
                  <input className="form-control mb-3" value={nota} onChange={e => setNota(e.target.value)}
                    enterKeyHint="done"
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    placeholder="Ej: Traspaso a ahorros..." style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      color: 'var(--text)',
                      fontSize: '14px',
                      marginBottom: '16px'
                    }} />
                  </>
                  )}

                </div>
              ) : (
                /* ─── VISTA UNIFICADA DE GASTO / INGRESO EN MÓVIL ─── */
                <div className="mobile-unified-movement" style={{ width: '100%' }}>
                  <div className="step-title">
                    {tipo === 'expense' ? 'Gasto' : 'Ingreso'}
                  </div>

                  {/* Importe */}
                  <label className="step-label">Importe</label>
                  <div className="monto-display-wrap" style={{ padding: '0 0 16px 0' }}>
                    <div className="monto-input-container" style={{ width: '100%', maxWidth: 'none', cursor: 'pointer' }} onClick={() => setShowCalculator(true)}>
                      <span className="monto-currency-symbol">
                        {monedaOrigen === 'USD' ? 'U$S' : '$'}
                      </span>
                      <input
                        type="text"
                        className="monto-input-box-field"
                        placeholder="0"
                        value={monto === '0' ? '' : monto}
                        readOnly={true}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>

                    {/* Desplegar la calculadora en pantalla */}
                    {showCalculator && (
                      <div className="calc-keypad-mobile-only" style={{ marginTop: '12px', width: '100%' }}>
                        <CalculatorKeypad
                          value={monto}
                          onChange={setMonto}
                          onClose={() => setShowCalculator(false)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Categoría (solo para egresos) */}
                  {tipo === 'expense' && (
                    <div className="mobile-category-picker-section" style={{ marginBottom: '16px' }}>
                      <label className="step-label">{t("label_category")}</label>

                      {remoteSectionLoading ? (
                        <div className="warning-card" style={{ padding: '16px', textAlign: 'center', width: '100%' }}>
                          <div className="spinner" style={{ margin: '0 auto 10px auto' }} />
                          {t('loading')}
                        </div>
                      ) : (
                        <>
                          {/* Selector de proyectos compartidos (Fase 4) */}
                          {hogarEstado?.tiene_pareja && proyectosHogar.length > 0 && (
                            <ProyectosSelector
                              proyectos={proyectosHogar}
                              proyectoSeleccionadoId={proyectoSeleccionadoId}
                              selectProyecto={selectProyecto}
                            />
                          )}

                          {categoriaEgreso ? (
                            <div className="cat-selected-pill" onClick={() => { setMobileShowAllCat(true); setShowCalculator(false); }} style={{ border: `1px solid ${categoriaEgreso.color || 'var(--border)'}`, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                              <span style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '8px',
                                backgroundColor: categoriaEgreso.color,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#000000',
                                fontWeight: 'bold'
                              }}>
                                <span style={{ filter: 'brightness(0)' }}>{categoriaEgreso.icono}</span>
                              </span>
                              <span>{categoriaEgreso.nombre}</span>
                              <span className="cat-selected-edit" style={{ marginLeft: 'auto' }}>✏️</span>
                            </div>
                          ) : (
                            <div className="cat-placeholder-pill" onClick={() => { setMobileShowAllCat(true); setShowCalculator(false); }} style={{
                              padding: '12px',
                              border: '1px dashed var(--border)',
                              borderRadius: '10px',
                              color: 'var(--text-3)',
                              cursor: 'pointer',
                              textAlign: 'center',
                              fontSize: '14px',
                              marginBottom: '12px'
                            }}>
                              🔍 {t("placeholder_select_category")}
                            </div>
                          )}

                          {/* Las 5 categorías más usadas recientemente */}
                          <div className="mobile-frecuentes-section" style={{ margin: '12px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              {frecuentesMobile.map((cat, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  className="cat-recent-icon-btn"
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    backgroundColor: cat.color,
                                    border: categoriaEgreso?.estructura_id === cat.estructura_id ? '3px solid var(--text)' : '1px solid rgba(255,255,255,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '16px',
                                    color: '#000000',
                                    cursor: 'pointer',
                                    transition: 'transform 0.1s',
                                    boxShadow: categoriaEgreso?.estructura_id === cat.estructura_id ? `0 0 10px ${cat.color}` : 'none'
                                  }}
                                  onClick={() => {
                                    setCategoriaEgreso(cat)
                                    setShowCalculator(false)
                                  }}
                                >
                                  <span style={{ filter: 'brightness(0)' }}>{cat.icono}</span>
                                </button>
                              ))}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{
                                  marginLeft: 'auto',
                                  padding: '8px 16px',
                                  borderRadius: '20px',
                                  fontSize: '14px',
                                  fontWeight: 'bold',
                                  height: '36px',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                                onClick={() => {
                                  setMobileShowAllCat(true)
                                  setShowCalculator(false)
                                }}
                              >
                                Ver todas
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Centered Modal for selecting all categories on mobile */}
                  {mobileShowAllCat && (
                    <div className="centered-cat-modal-overlay" onClick={() => setMobileShowAllCat(false)}>
                      <div className="centered-cat-modal" onClick={e => e.stopPropagation()}>
                        <div className="centered-cat-modal-header">
                          <h3 className="font-display">{t("title_select_category")}</h3>
                          <button className="centered-cat-modal-close" onClick={() => setMobileShowAllCat(false)}>✕</button>
                        </div>
                        <div className="centered-cat-modal-body">
                          <div className="cat-acordeon" style={{ maxHeight: 'none' }}>
                            {filteredRubrosDesktop.map(rubro => {
                              const hasChildren = rubro.hijos && rubro.hijos.length > 0
                              const isExpanded = !!expandedRubros[rubro.estructura_id]
                              return (
                                <div key={rubro.estructura_id} className="cat-acordeon-rubro" style={{ marginBottom: '8px' }}>
                                  <div
                                    className="cat-acordeon-header"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '12px 14px',
                                      cursor: 'pointer'
                                    }}
                                    onClick={() => {
                                      if (hasChildren) {
                                        setExpandedRubros(prev => {
                                          const next: Record<number, boolean> = {}
                                          if (!prev[rubro.estructura_id]) {
                                            next[rubro.estructura_id] = true
                                          }
                                          return next
                                        })
                                      } else {
                                        setCategoriaEgreso({
                                          estructura_id: rubro.estructura_id,
                                          nombre: t(rubro.nombre_cuenta),
                                          icono: rubro.icono,
                                          color: rubro.color,
                                          es_padre: true
                                        })
                                        setMobileShowAllCat(false)
                                        setShowCalculator(false)
                                      }
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <div style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '8px',
                                        backgroundColor: rubro.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '15px',
                                        color: '#000000'
                                      }}>
                                        <span style={{ filter: 'brightness(0)' }}>{rubro.icono}</span>
                                      </div>
                                      <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                                        {t(rubro.nombre_cuenta)}
                                      </span>
                                      {hasChildren && (
                                        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                                          · {rubro.hijos.length} subcuentas
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                      {(!hasChildren || isExpanded) && (
                                        <button
                                          type="button"
                                          className="btn-add-subcat-quick"
                                          title={t("title_add_subcategory")}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openNewSubcatModal(rubro);
                                          }}
                                          style={{
                                            background: 'rgba(255,255,255,0.06)',
                                            border: '1px solid rgba(255,255,255,0.15)',
                                            borderRadius: '6px',
                                            color: '#FFFFFF',
                                            width: '26px',
                                            height: '26px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '18px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            marginRight: '8px',
                                            transition: 'all 0.15s'
                                          }}
                                        >
                                          +
                                        </button>
                                      )}
                                      {hasChildren && (
                                        <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>
                                          {isExpanded ? '▾' : '▸'}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {hasChildren && isExpanded && (
                                    <div className="cat-acordeon-hijos" style={{
                                      background: 'rgba(0,0,0,0.15)',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      borderTop: '1px solid var(--border)'
                                    }}>
                                      {rubro.hijos.map(hijo => (
                                        <button
                                          key={hijo.estructura_id}
                                          type="button"
                                          className="cat-acordeon-hijo"
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            width: '100%',
                                            padding: '12px 16px 12px 24px',
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--text-2)',
                                            fontSize: '14px',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            borderBottom: '1px solid var(--border)',
                                            fontFamily: 'var(--font-sans)',
                                            flexShrink: 0
                                          }}
                                          onClick={() => {
                                            setCategoriaEgreso({
                                              estructura_id: hijo.estructura_id,
                                              nombre: `${t(rubro.nombre_cuenta)} › ${t(hijo.nombre_cuenta)}`,
                                              icono: hijo.icono || rubro.icono,
                                              color: rubro.color,
                                              es_padre: false
                                            })
                                            setMobileShowAllCat(false)
                                            setShowCalculator(false)
                                          }}
                                        >
                                          <span style={{
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '6px',
                                            backgroundColor: rubro.color,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '12px',
                                            color: '#000000',
                                            marginRight: '6px',
                                            flexShrink: 0
                                          }}>
                                            <span style={{ filter: 'brightness(0)' }}>{hijo.icono || rubro.icono}</span>
                                          </span> {t(hijo.nombre_cuenta)}
                                          {hijo.es_hormiga && <span className="hormiga-badge">🐜</span>}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cuenta / Billetera / Tarjeta */}
                  <label className="step-label">{tipo === 'expense' ? 'Cuenta o Tarjeta' : 'Cuenta / Billetera'}</label>
                  {remoteSectionLoading ? (
                    <div className="warning-card" style={{ padding: '16px', textAlign: 'center', width: '100%', marginBottom: '16px' }}>
                      <div className="spinner" style={{ margin: '0 auto 10px auto' }} />
                      {t('loading')}
                    </div>
                  ) : (
                  <>
                  {tipo === 'expense' && origenOptions.length === 0 && (
                    <div className="warning-card" style={{ color: 'var(--coral)', padding: '12px', background: 'rgba(255,107,107,0.08)', borderRadius: '10px', fontSize: '13px', marginBottom: '16px' }}>
                      ⚠️ {t('error_no_sufficient_balance_wallets')}
                    </div>
                  )}
                  <select
                    className="form-control mb-3"
                    value={origenTipo === 'billetera' ? (billeteraOrigenId ? `b_${billeteraOrigenId}` : '') : (tarjetaId ? `t_${tarjetaId}` : '')}
                    onFocus={() => setShowCalculator(false)}
                    onChange={e => {
                      const val = e.target.value
                      if (!val) {
                        setOrigenTipo('billetera')
                        setBilleteraOrigenId(null)
                        setTarjetaId(null)
                      } else if (val.startsWith('b_')) {
                        setOrigenTipo('billetera')
                        setBilleteraOrigenId(Number(val.replace('b_', '')))
                        setTarjetaId(null)
                      } else if (val.startsWith('t_')) {
                        setOrigenTipo('tarjeta')
                        setTarjetaId(Number(val.replace('t_', '')))
                        setBilleteraOrigenId(null)
                      }
                      setBilleteraDestinoId(null)
                      setShowCalculator(false)
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      color: 'var(--text)',
                      fontSize: '14px',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)',
                      marginBottom: '16px'
                    }}
                  >
                    <option value="" style={{ background: 'var(--surface)', color: 'var(--text-3)' }}>Selecciona un origen...</option>
                    <optgroup label="Cuentas/Billeteras">
                      {origenOptions.map(b => (
                        <option key={`b_${b.billetera_id}`} value={`b_${b.billetera_id}`} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                          {b.icono || '💳'} {b.nombre} ({formatMonto(b.saldo_actual.toString(), b.moneda)})
                        </option>
                      ))}
                    </optgroup>
                    {tipo === 'expense' && tarjetas.length > 0 && (
                      <optgroup label={t("group_credit_cards")}>
                        {tarjetas.map(t => (
                          <option key={`t_${t.tarjeta_id}`} value={`t_${t.tarjeta_id}`} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                            💳 {t.nombre_tarjeta}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {/* Cuotas si es tarjeta (Móvil) */}
                  {tipo === 'expense' && origenTipo === 'tarjeta' && (
                    <div style={{ marginBottom: '16px' }}>
                      <label className="step-label">Cantidad de Cuotas</label>
                      <CuotasSelector
                        cuotas={cuotas}
                        setCuotas={setCuotas}
                        montoNum={montoNum}
                        monedaOrigen={monedaOrigen}
                        formatMonto={formatMonto}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 14, color: 'var(--color-text)', fontWeight: 500 }}>{t('card_usd_purchase')}</span>
                        </div>
                        <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
                          <input type="checkbox" checked={esUsd} onChange={e => setEsUsd(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                          <span style={{
                            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: esUsd ? 'var(--color-mint)' : 'rgba(255,255,255,0.2)',
                            transition: '.3s', borderRadius: 24
                          }}>
                            <span style={{
                              position: 'absolute', content: '""', height: 18, width: 18, left: 3, bottom: 3,
                              backgroundColor: 'white', transition: '.3s', borderRadius: '50%',
                              transform: esUsd ? 'translateX(20px)' : 'translateX(0)'
                            }} />
                          </span>
                        </label>
                      </div>
                      {esUsd && montoNum > 0 && (() => {
                        const tc = tarjetas.find(t => t.tarjeta_id === tarjetaId)
                        const rPct = tc?.recargo_dolar_pct ? parseFloat(tc.recargo_dolar_pct) : 30
                        const mFinal = montoNum * cotizacionUsd * (1 + rPct / 100)
                        return (
                          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 8, marginTop: 10, borderLeft: '3px solid var(--color-mint)' }}>
                            {t('card_usd_quote_simple', { rate: formatMonto(cotizacionUsd.toString(), 'ARS'), pct: rPct })}
                            <br/><span style={{ color: 'var(--color-text)', fontWeight: 'bold' }}>Total estimado ARS: {formatMonto(mFinal.toString(), 'ARS')}</span>
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {/* Fuente de ingreso (solo para ingresos) */}
                  {tipo === 'income' && (
                    <>
                      <label className="step-label">Fuente de Ingreso</label>
                      <select
                        className="form-control mb-3"
                        value={categoriaIngreso?.producto_id || ''}
                        onFocus={() => setShowCalculator(false)}
                        onChange={e => {
                          const val = Number(e.target.value) || null
                          const cat = catIngresos.find(ci => ci.producto_id === val)
                          setCategoriaIngreso(cat || null)
                          setShowCalculator(false)
                        }}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          color: 'var(--text)',
                          fontSize: '14px',
                          outline: 'none',
                          fontFamily: 'var(--font-sans)',
                          marginBottom: '16px'
                        }}
                      >
                        <option value="" style={{ background: 'var(--surface)', color: 'var(--text-3)' }}>Selecciona una fuente (opcional)...</option>
                        {catIngresos.map(ci => (
                          <option key={ci.producto_id} value={ci.producto_id} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                            {ci.icono} {ci.nombre}
                          </option>
                        ))}
                      </select>
                        </>
                      )}
                  </>
                  )}

                  {/* Cuándo (Fecha) */}
                  <label className="step-label">{t("step_when")}</label>
                  <div className="fecha-chips" style={{ marginBottom: '16px' }} onClick={() => setShowCalculator(false)}>
                    {FECHA_CHIPS.map(chip => {
                      const val = toLocalDate(chip.offset)
                      const active = fecha === val && !fechaPersonalizada
                      return (
                        <button key={chip.label} type="button"
                          className={`fecha-chip ${active ? 'active' : ''}`}
                          style={active ? { borderColor: cfg.color, color: cfg.color } : {}}
                          onClick={() => { setFecha(val); setFechaPersonalizada(false); setShowCalculator(false); }}>
                          {chip.label}
                        </button>
                      )
                    })}
                    <button type="button"
                      className={`fecha-chip ${fechaPersonalizada ? 'active' : ''}`}
                      style={fechaPersonalizada ? { borderColor: cfg.color, color: cfg.color } : {}}
                      onClick={() => { setFechaPersonalizada(true); setShowCalculator(false); setTimeout(() => inputFechaRef.current?.showPicker?.(), 50) }}>
                      📅 Otra
                    </button>
                  </div>

                  {fechaPersonalizada && (
                    <input ref={inputFechaRef} type="date" className="form-control mb-3" value={fecha}
                      onFocus={() => setShowCalculator(false)}
                      onChange={e => { setFecha(e.target.value); setShowCalculator(false); }} style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        color: 'var(--text)',
                        fontSize: '14px',
                        marginBottom: '16px'
                      }} />
                  )}

                  {/* Toggle compartido (Fase 4) — sólo gastos, sólo si tiene pareja */}
                  {tipo === 'expense' && (
                    <CompartidoToggle
                      checked={esCompartido}
                      onChange={setEsCompartido}
                      tienePareja={!!hogarEstado?.tiene_pareja}
                      proyectoSeleccionadoId={proyectoSeleccionadoId}
                      onClearProyecto={() => setProyectoSeleccionadoId(null)}
                    />
                  )}

                  {/* Nota */}
                  <label className="step-label">Nota (opcional)</label>
                  <input className="form-control mb-3" value={nota}
                    onFocus={() => setShowCalculator(false)}
                    onClick={() => setShowCalculator(false)}
                    onChange={e => setNota(e.target.value)}
                    enterKeyHint="done"
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    placeholder={tipo === 'expense' ? 'Ej: Almuerzo del martes...' : 'Ej: Pago de cliente...'} style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      color: 'var(--text)',
                      fontSize: '14px',
                      marginBottom: '16px'
                    }} />
                </div>
              )}
            </div>

          {/* ── BOTÓN STICKY DE CONFIRMACIÓN ── */}
          {!loadingData && (
            <div className="modal-sticky-footer" style={{ display: 'flex', gap: '10px' }}>
              {isMobile && (
                <button
                  type="button"
                  className="btn-cancel-mobile"
                  onClick={onClose}
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                className="btn-confirm"
                style={{
                  flex: 1,
                  background: cfg.color,
                  color: tipo === 'income' ? 'var(--bg)' : 'white',
                  cursor: 'pointer',
                }}
                disabled={loading}
                onClick={handleSave}
              >
                {loading ? (
                  <span className="spinner-sm" />
                ) : (
                  cfg.btnLabel
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {showNewSubcatModal && newSubcatParent && (
                                        <SubcuentaModal
                                          subcuenta={null}
                                          rubroId={newSubcatParent.estructura_id}
                                          rubros={rubros}
                                          onClose={() => setShowNewSubcatModal(false)}
                                          onSaved={(newId, nombre, icono) => {
                                            reloadCategorias()
                                            if (newId && nombre) {
                                              selectCatEgreso({
                                                estructura_id: newId,
                                                nombre: `${t(newSubcatParent.nombre_cuenta)} › ${nombre}`,
                                                icono: icono || '🏷️',
                                                color: newSubcatParent.color,
                                                es_padre: false
                                              }, newSubcatParent)
                                            }
                                            setMobileShowAllCat(false)
                                          }}
                                        />
                                      )}

      {showAudioRecorder && (
        <AudioRecorderModal
          isOpen={showAudioRecorder}
          onClose={() => setShowAudioRecorder(false)}
        />
      )}

      {showInitialBalanceModal && initialBalanceBilletera && (
        <InitialBalanceModal
          billetera={initialBalanceBilletera as any}
          onClose={() => {
            setShowInitialBalanceModal(false)
            setInitialBalanceBilletera(null)
          }}
          onSuccess={() => {
            reloadBilleteras()
            setShowInitialBalanceModal(false)
            setInitialBalanceBilletera(null)
          }}
        />
      )}
    </>
  )
}
