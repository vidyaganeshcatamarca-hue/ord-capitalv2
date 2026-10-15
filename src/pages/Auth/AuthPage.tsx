import { useState, useEffect, useRef } from 'react'
import { canTreatSessionAsDead, supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { t, parseError } from '@/locales/i18n'
import { ConsentCheckbox } from '@/components/ConsentCheckbox/ConsentCheckbox'
import { ConsentGate } from '@/components/ConsentGate/ConsentGate'
import { LegalDocModal } from '@/components/LegalDocModal/LegalDocModal'
import { consentJustAcceptedThisLoad } from '@/components/AppConsentGate/AppConsentGate'
import { WelcomeBack } from '@/components/WelcomeBack/WelcomeBack'
import { CountryStep } from '@/components/onboarding/CountryStep'
import { LEGAL_VERSIONS } from '@/config/legal'
import type { Country } from '@/lib/countryCatalog'
import {
  clearOnboardingComplete,
  readOnboardingComplete,
  writeOnboardingComplete,
} from '@/lib/regionSnapshot'
import './Auth.css'

type Mode = 'login' | 'register'

// The country step landed as slide 3, so every index >= 3 shifted by one
// (wallet 3->4, virtual wallet 4->5, anchor day 5->6). The psychological-contract
// (budget mode) screen was removed: every user starts in anticipado/libertad and
// `handleFinishOnboarding` runs right after the anchor day. Progress key versioned;
// the legacy 1..5 value is migrated on first read.
const TOTAL_SLIDES = 6
const SLIDE_STORAGE_KEY = 'onboarding_slide_v2'
const LEGACY_SLIDE_STORAGE_KEY = 'onboarding_slide'

function persistSlide(index: number): void {
  try {
    localStorage.setItem(SLIDE_STORAGE_KEY, String(index))
  } catch {
    // Storage can be blocked; the in-memory slide still drives the flow.
  }
}

function clearPersistedSlide(userId?: string): void {
  try {
    localStorage.removeItem(SLIDE_STORAGE_KEY)
    localStorage.removeItem(LEGACY_SLIDE_STORAGE_KEY)
    if (userId) localStorage.removeItem(flowStorageKey(userId))
  } catch {
    // Same as persistSlide.
  }
}

/**
 * Snapshot del flujo en curso (slide + estado de la pantalla en la que se
 * estaba). Chrome Android descarta pestañas por presión de memoria y al
 * volver las recarga: sin este snapshot la app reabre el slide con su estado
 * por defecto (form de billetera virtual cerrado, saldos en cero) y parece
 * que "continuó sola". Se escribe en cada cambio del flujo activo.
 *
 * La clave es POR USUARIO: dos cuentas en un mismo teléfono no se roban el
 * flujo en curso una de la otra.
 */
const FLOW_STORAGE_PREFIX = 'onboarding_flow_v1:'

interface FlowSnapshot {
  slide: number
  showVirtualForm: boolean
  walletName: string
  calcInput: string
  selectedIcon: string
  virtualCreated: boolean
  cashBalanceInput: string
}

function flowStorageKey(userId: string): string {
  return `${FLOW_STORAGE_PREFIX}${userId}`
}

function persistFlowState(userId: string, snapshot: FlowSnapshot): void {
  try {
    localStorage.setItem(flowStorageKey(userId), JSON.stringify(snapshot))
  } catch {
    // Storage bloqueado: el flujo queda solo en memoria.
  }
}

function readFlowState(userId: string): FlowSnapshot | null {
  try {
    const raw = localStorage.getItem(flowStorageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FlowSnapshot>
    if (typeof parsed.slide !== 'number') return null
    return {
      slide: parsed.slide,
      showVirtualForm: parsed.showVirtualForm === true,
      walletName: typeof parsed.walletName === 'string' ? parsed.walletName : '',
      calcInput: typeof parsed.calcInput === 'string' ? parsed.calcInput : '0',
      selectedIcon: typeof parsed.selectedIcon === 'string' ? parsed.selectedIcon : '💵',
      virtualCreated: parsed.virtualCreated === true,
      cashBalanceInput: typeof parsed.cashBalanceInput === 'string' ? parsed.cashBalanceInput : '0',
    }
  } catch {
    return null
  }
}

/** Reads the slide, migrating the legacy key by +1 for every index >= 3. */
function readStoredSlide(): number | null {
  try {
    const current = localStorage.getItem(SLIDE_STORAGE_KEY)
    if (current !== null) {
      const parsed = parseInt(current, 10)
      return Number.isFinite(parsed) ? parsed : null
    }

    const legacy = localStorage.getItem(LEGACY_SLIDE_STORAGE_KEY)
    if (legacy !== null) {
      const parsed = parseInt(legacy, 10)
      if (Number.isFinite(parsed)) {
        const migrated = parsed >= 3 ? parsed + 1 : parsed
        persistSlide(migrated)
        localStorage.removeItem(LEGACY_SLIDE_STORAGE_KEY)
        return migrated
      }
    }
  } catch {
    // Storage can be blocked (private mode); no progress to resume from.
  }
  return null
}

const withTimeout = <T,>(promise: PromiseLike<T>, ms = 4000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  ])
}

/**
 * `fn_verificar_status_onboarding` raises `error_unauthorized` when there is no
 * `usuarios` row for the current `auth.uid()`. That is definitive, not transient:
 * the session points at an account that no longer exists.
 */
function isUnauthorizedError(error: unknown): boolean {
  const message =
    typeof error === 'string'
      ? error
      : ((error as { message?: string } | null)?.message ?? '')
  return message.includes('error_unauthorized')
}

export function AuthPage() {
  const navigate = useNavigate()
  const { session, setOnboardingCompleto, signOut } = useAuth()
  const { showToast, setToastPlacement } = useToast()

  // Onboarding Slides (1 a 6: bienvenida, auth, pais, billetera, dia ancla, modo)
  const [slide, setSlide] = useState(1)

  // Toasts de creador de billeteras / cierre centrados: el toast bottom
  // tapaba los botones Cancelar/Continuar y habia que esperar 4.5s
  // (complaint del dueno 2026-10-15). Solo onboarding; el resto de la app
  // sigue con el toast bottom.
  useEffect(() => {
    setToastPlacement(slide >= 3 && slide <= 6 ? 'center' : 'bottom')
    return () => setToastPlacement('bottom')
  }, [slide, setToastPlacement])

  // Slide 2: Auth State
  const [authMode, setAuthMode] = useState<Mode>('login')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)

  // Consentimiento legal (TyC + Privacidad)
  const [consentChecked, setConsentChecked] = useState(false)
  const [showConsentGate, setShowConsentGate] = useState(false)
  const [legalDoc, setLegalDoc] = useState<'tyc' | 'privacidad' | null>(null)

  // Welcome back (recuperación de onboarding incompleto)
  const [showWelcomeBack, setShowWelcomeBack] = useState(false)
  // El primero check de este mount es el único que puede abrir la pantalla
  // de recuperación: AuthContext re-dispara onAuthStateChange en cada
  // TOKEN_REFRESHED, y ese re-chequeo a mitad de onboarding (consent OK +
  // incompleto) no debe interrumpir el flujo continuo con el cartel.
  const ranInitialCheck = useRef(false)

  // Restauración del snapshot: UNA corrida por usuario autenticado. Claim
  // inmediato al empezar; el cleanup lo libera SOLO si el intento quedó sin
  // aplicar (ej. cambio de sesión a mitad del RPC). Así un re-run por
  // TOKEN_REFRESHED con el intento ya aplicado conserva el claim (el restore
  // no se re-ejecuta: no pisa letras tipeadas ni yankea el slide), y un
  // usuario distinto (o re-login tras cancelación) ejecuta el suyo.
  const restoredForUserId = useRef<string | null>(null)

  // Slide 3: Country State — the local currency comes from the chosen country,
  // it is never selected by the user.
  const [localCountry, setLocalCountry] = useState<Country | null>(null)
  const localCurrencySymbol = localCountry?.currencySymbol ?? ''

  // Slide 4: Wallet State — the cash wallet. Its name and icon are fixed; only the
  // opening balance is asked (decision del dueno: simplificar el onboarding).
  const [cashBalanceInput, setCashBalanceInput] = useState('0')

  // Slide 5: Optional virtual wallet. The form only appears when the user asks for it
  // (boton); si no la quiere, continua sin crearla.
  const [walletName, setWalletName] = useState('')
  const [calcInput, setCalcInput] = useState('0')
  const [selectedIcon, setSelectedIcon] = useState('💵')
  const [showVirtualForm, setShowVirtualForm] = useState(false)
  const [virtualCreated, setVirtualCreated] = useState(false)

  // Slide 6: Anchor Day State
  const [anchorDay, setAnchorDay] = useState(1)

  // Redirección si ya está autenticado al cargar
  useEffect(() => {
    if (session) {
      checkExistingOnboarding()
    }
  }, [session])

  const userId = session?.user?.id ?? null

  // Cargar progreso guardado (y el estado de la pantalla al momento de
  // haberse ido): la región confirmada decide si el slide restaurado es
  // alcanzable; con región confirmada también recuperamos los valores del
  // snapshot (form de billetera virtual abierto, saldos tipeados, etc.).
  useEffect(() => {
    if (!session || !userId) return
    if (restoredForUserId.current === userId) return
    restoredForUserId.current = userId
    const savedFlow = readFlowState(userId)
    const savedSlide = savedFlow ? savedFlow.slide : readStoredSlide()
    if (savedSlide === null || savedSlide <= 2 || savedSlide > TOTAL_SLIDES) return
    let applied = false
    let cancelled = false
    const restoreSlide = async () => {
      try {
        const { data } = await supabase.rpc('fn_obtener_region_usuario')
        if (cancelled) return
        const row = Array.isArray(data) ? data[0] : data
        if (row?.confirmado === true) {
          setSlide(savedSlide)
          if (savedFlow) {
            // El snapshot es la misma fuente que el effect de persistencia
            // escribe en cada cambio del flujo: si el re-chequeo por token
            // refresh lo re-ejecuta, restaura los valores ya vigentes.
            restoreFlowExtras(savedFlow)
          }
        } else {
          setSlide(3)
        }
        applied = true
      } catch {
        if (!cancelled) setSlide(3)
        applied = true
      }
    }
    restoreSlide()
    return () => {
      cancelled = true
      if (!applied && restoredForUserId.current === userId) {
        restoredForUserId.current = null
      }
    }
  }, [session])

  // Snapshot del flujo en curso: se escribe en cada cambio relevante para que
  // una recarga/discard de la pestaña recupere EXACTAMENTE la pantalla en la
  // que el usuario estaba (no su estado por defecto).
  useEffect(() => {
    if (!userId || slide <= 2) return
    persistFlowState(userId, {
      slide,
      showVirtualForm,
      walletName,
      calcInput,
      selectedIcon,
      virtualCreated,
      cashBalanceInput,
    })
  }, [userId, slide, showVirtualForm, walletName, calcInput, selectedIcon, virtualCreated, cashBalanceInput])

  const checkExistingOnboarding = async (retries = 3, delay = 200) => {
    setLoading(true)
    const initial = !ranInitialCheck.current
    ranInitialCheck.current = true
    const localCompleted = readOnboardingComplete(session?.user?.id)
    let unauthorized = false

    try {
      if (!session?.user?.id) {
        setSlide(3)
        return
      }

      for (let i = 0; i < retries; i++) {
        try {
          const { data: status, error } = await withTimeout(
            supabase.rpc('fn_verificar_status_onboarding'),
            3000
          )
          if (!error && status) {
            if (status.onboarding_completo) {
              setOnboardingCompleto(true)
              writeOnboardingComplete(session?.user?.id, true)
              clearPersistedSlide(session?.user?.id)
              navigate('/', { replace: true })
            } else if (status.consentimiento_aceptado === false) {
              setShowConsentGate(true)
            } else if (consentJustAcceptedThisLoad()) {
              // El gate se aceptó en ESTA misma carga de página (signup
              // continuo): continuar el onboarding, sin cartel de recuperación.
              // Los re-chequeos posteriores (token refresh) no tocan el slide
              // en curso. En una carga nueva el flag se apaga y el flujo de
              // recuperación (Bienvenido de nuevo) vuelve a funcionar.
              if (initial) {
                setSlide(3)
                persistSlide(3)
              }
            } else {
              // Sólo el primer chequeo abre la pantalla de recuperación;
              // re-chequeos por refresh de token no interrumpen el flujo.
              if (initial) setShowWelcomeBack(true)
            }
            return // Éxito
          }
          console.warn(`Intento ${i + 1} de checkExistingOnboarding falló:`, error)
          if (isUnauthorizedError(error)) unauthorized = true
        } catch (err) {
          console.warn(`Intento ${i + 1} de checkExistingOnboarding lanzó excepción/timeout:`, err)
        }
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
        }
      }

      // The session points at a user the backend does not know: the account was
      // deleted while its token was still alive. Retrying is pointless, and leaving
      // the user here traps them — there is no way out of the onboarding without a
      // working session, and the only escape used to be clearing browser storage.
      // Dropping the session hands control back to the login screen.
      if (unauthorized) {
        // Same guard as the rpc interceptor: a brand-new session must not be killed.
        // During the OAuth callback the code exchange is still running and those RPCs
        // legitimately fail as unauthorized, so acting here would loop the login.
        if (await canTreatSessionAsDead()) {
          console.warn('[auth] la sesion no existe en el backend; cerrando sesion')
          clearPersistedSlide(session?.user?.id)
          clearOnboardingComplete()
          try {
            await signOut()
          } catch (err) {
            console.warn('[auth] el cierre de sesion fallo:', err)
          }
        }
        return
      }

      // Fallback si todos los reintentos de la RPC fallaron
      if (localCompleted) {
        setOnboardingCompleto(true)
        navigate('/', { replace: true })
      } else {
        setSlide(3)
      }
    } catch (err) {
      console.error('Error general en checkExistingOnboarding:', err)
      setSlide(3)
    } finally {
      setLoading(false)
    }
  }

  // Guardar estado del slide actual
  const goToSlide = (nextSlide: number) => {
    setSlide(nextSlide)
    if (session) {
      persistSlide(nextSlide)
    }
  }

  // Restauración parcial: con el snapshot vigente reescribe el estado de la
  // pantalla (form de billetera virtual, saldos, íconos) para volver EXACTO
  // a donde se quedó el usuario.
  const restoreFlowExtras = (snapshot: FlowSnapshot) => {
    setShowVirtualForm(snapshot.showVirtualForm)
    setWalletName(snapshot.walletName)
    setCalcInput(snapshot.calcInput)
    setSelectedIcon(snapshot.selectedIcon)
    setVirtualCreated(snapshot.virtualCreated)
    setCashBalanceInput(snapshot.cashBalanceInput)
  }

  const handleWelcomeBackContinue = () => {
    setShowWelcomeBack(false)
    // Reanudar EN el slide donde se quedó (snapshot del flujo PER-USUARIO),
    // no siempre en el 3: el usuario puede haber quedado a mitad de las
    // billeteras, incluso con el form de la virtual abierto.
    const saved = userId ? readFlowState(userId) : null
    const resume = saved && saved.slide >= 3 && saved.slide <= TOTAL_SLIDES ? saved.slide : 3
    if (saved) {
      restoreFlowExtras(saved)
    }
    setSlide(resume)
    persistSlide(resume)
  }

  const handleWelcomeBackSwitch = async () => {
    const switchingUserId = session?.user?.id
    try {
      await supabase.auth.signOut()
      clearPersistedSlide(switchingUserId)
      clearOnboardingComplete()
      setShowWelcomeBack(false)
      setSlide(1)
      // El useEffect que observa `session` disparará el flujo de auth.
    } catch (err) {
      console.error('Error al cerrar sesión en welcome-back:', err)
    }
  }

  // --- LÓGICA DE AUTENTICACIÓN (SLIDE 2) ---
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (authMode === 'register') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nombre,
              terminos_version: LEGAL_VERSIONS.terminos,
              privacidad_version: LEGAL_VERSIONS.privacidad,
            },
          },
        })
        if (error) throw error
        showToast(t('toast_account_created_check_email'), 'success')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
      // Al loguearse, el useEffect redirigirá a checkExistingOnboarding()
    } catch (err: any) {
      showToast(err.message || t('toast_auth_error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleAuth = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })
      if (error) throw error
    } catch (err: any) {
      showToast(err.message || t('toast_google_auth_error'), 'error')
    }
  }



  // "Ir"/"Listo" del teclado (Enter) SOLO confirma el valor ingresado: cierra
  // el teclado y deja el dato. Un Enter NO guarda ni avanza de pantalla —
  // eso queda siempre en el CTA visible del slide (decision del usuario).
  const handleInputEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    e.currentTarget.blur()
  }

  // --- LLAMADA RPC SLIDE 4: crear SOLO la billetera en efectivo ---
  // La cuenta bancaria/virtual no se crea aca: es una pantalla opcional despues
  // (slide 5). Con p_cuenta_nombre NULL la RPC omite la cuenta por completo.
  const handleSaveWallet = async () => {
    const cashSaldo = parseFloat(cashBalanceInput) || 0

    setLoading(true)

    try {
      const { error } = await supabase.rpc('fn_crear_billeteras_iniciales', {
        p_cuenta_nombre: null,
        p_cuenta_saldo_apertura: 0,
        p_cuenta_saldo_omitido: true,
        p_cuenta_icono: '💳',
        p_efectivo_nombre: 'wallet_cash_default_name',
        p_efectivo_saldo_apertura: cashSaldo,
        p_efectivo_saldo_omitido: cashSaldo <= 0,
        p_efectivo_icono: '💵'
      })

      if (error) throw error

      showToast(t('toast_initial_wallets_created'), 'success')
      goToSlide(5)
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  // --- SLIDE 5: crear la billetera virtual (opcional, solo si el usuario pide) ---
  const handleCreateVirtualWallet = async (): Promise<boolean> => {
    const name = walletName.trim()
    if (!name) {
      showToast(t('error_field_required', { field: t('label_virtual_wallet_name') }), 'error')
      return false
    }
    const saldo = parseFloat(calcInput) || 0

    setLoading(true)
    try {
      // La moneda no se manda: con el pais ya confirmado, el backend la deriva.
      const { error } = await supabase.rpc('fn_crear_billetera_inicial', {
        p_nombre: name,
        p_saldo_apertura: saldo,
        p_icono: selectedIcon
      })
      if (error) throw error
      setVirtualCreated(true)
      showToast(t('toast_virtual_wallet_created'), 'success')
      return true
    } catch (err: any) {
      showToast(parseError(err), 'error')
      return false
    } finally {
      setLoading(false)
    }
  }

  // Cancelar SOLO cierra la creacion de la billetera virtual (vuelve al
  // estado sin form del slide): no toca la operatoria en curso (billetera en
  // efectivo ya guardada, dia ancla, etc.).
  const handleCancelVirtualWallet = () => {
    setShowVirtualForm(false)
    setWalletName('')
    setCalcInput('0')
  }

  // Continuar del form de billetera virtual: con nombre, crea la billetera y
  // avanza; sin nombre, la virtual es opcional y solo avanza. Errores: se
  // queda en la pantalla para reintento.
  const handleVirtualContinue = async () => {
    if (loading) return
    if (!walletName.trim()) {
      goToSlide(6)
      return
    }
    const created = await handleCreateVirtualWallet()
    if (!created) return
    goToSlide(6)
  }


  // --- PREVIEW RANGO DE DÍA ANCLA (SLIDE 5) ---
  const getCyclePreviewText = () => {
    const today = new Date()
    const currentMonth = today.toLocaleString('es-ES', { month: 'long' })
    
    if (anchorDay === 1) {
      const lastDayCurrent = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
      return t('auth_cycle_preview_same_month', { currentMonth, lastDay: lastDayCurrent })
    } else {
      const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      const nextMonth = nextMonthDate.toLocaleString('es-ES', { month: 'long' })
      const endDay = anchorDay - 1
      return t('auth_cycle_preview_diff_month', { startDay: anchorDay, currentMonth, endDay, nextMonth })
    }
  }

  // --- LLAMADA POST-ANCHOR-DAY: Finalizar Onboarding (sin pantalla de modo) ---
  // Modo presupuesto fijo: anticipado ('libertad', la sugerencia del producto). La
  // eleccion no se ofrece mas en el onboarding.
  const handleFinishOnboarding = async () => {
    setLoading(true)

    try {
      const { error } = await supabase.rpc('fn_configurar_onboarding_final', {
        p_dia_ancla_ciclo: anchorDay,
        p_modo_presupuesto: 'anticipado'
      })

      if (error) throw error

      // Guardar completado y redirigir
      setOnboardingCompleto(true)
      clearPersistedSlide(session?.user?.id)
      showToast(t('toast_onboarding_completed'), 'success')
      navigate('/', { replace: true })
    } catch (err: any) {
      showToast(err.message || t('toast_onboarding_finish_error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const passwordStrength = password.length >= 8 ? (password.length >= 12 ? 'strong' : 'medium') : 'weak'

  if (loading && session && slide === 1) {
    return (
      <div className="onboarding-container flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  // GATE DE CONSENTIMIENTO LEGAL (OAuth / recuperación): reemplaza todo el onboarding
  if (showConsentGate) {
    return (
      <div className="onboarding-container">
        <div className="auth-bg">
          <div className="auth-blob auth-blob-1" />
          <div className="auth-blob auth-blob-2" />
        </div>
        <div className="onboarding-slide slide-active">
          <ConsentGate
            onAccepted={() => {
              // Two distinct flows:
              //  - FIRST RUN: consent was just accepted during the initial
              //    signup. Continue straight into onboarding (mirrors
              //    handleWelcomeBackContinue) instead of re-checking status,
              //    which would hit the generic else-branch and wrongly show
              //    WelcomeBack right after signup.
              //  - RECOVERY: a later re-entry (fresh page load with an active
              //    session and incomplete onboarding) goes through
              //    checkExistingOnboarding() -> WelcomeBack -> "Continue" ->
              //    slide 3.
              setShowConsentGate(false)
              setSlide(3)
              persistSlide(3)
            }}
            onOpenDoc={setLegalDoc}
          />
        </div>
        <LegalDocModal
          doc={legalDoc ?? 'tyc'}
          open={legalDoc !== null}
          onClose={() => setLegalDoc(null)}
        />
      </div>
    )
  }

  // WELCOME BACK (onboarding incompleto): continuar o cambiar de cuenta
  if (showWelcomeBack) {
    return (
      <div className="onboarding-container">
        <div className="auth-bg">
          <div className="auth-blob auth-blob-1" />
          <div className="auth-blob auth-blob-2" />
        </div>
        <div className="onboarding-slide slide-active">
          <WelcomeBack
            email={session?.user?.email ?? ''}
            onContinue={handleWelcomeBackContinue}
            onSwitchAccount={handleWelcomeBackSwitch}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="onboarding-container">
      {/* ── Background decorativo ── */}
      <div className="auth-bg">
        <div className="auth-blob auth-blob-1" />
        <div className="auth-blob auth-blob-2" />
      </div>

      {/* ProgressBar Fijo Superior */}
      <div className="onboarding-progress-bar">
        <div className="onboarding-progress-fill" style={{ width: `${(slide / TOTAL_SLIDES) * 100}%` }} />
      </div>

      {/* MODAL DE DOCUMENTO LEGAL */}
      <LegalDocModal
        doc={legalDoc ?? 'tyc'}
        open={legalDoc !== null}
        onClose={() => setLegalDoc(null)}
      />

      {/* SLIDE 1: BIENVENIDA */}
      {slide === 1 && (
        <div className="onboarding-slide slide-active">
          <div className="slide-content">
            <div className="welcome-hero">
              <div className="welcome-logo-container">
                <img src="/logo_login.webp" alt="ORD Capital" className="welcome-logo-img" />
              </div>
              <h1 className="welcome-title">{t('auth_welcome_title')}</h1>
              <p className="welcome-subtitle">{t('auth_welcome_subtitle')}</p>
            </div>
            <div className="slide-footer">
              <button className="btn btn-primary btn-full btn-lg" onClick={() => goToSlide(2)}>
                {t('btn_start')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SLIDE 2: AUTENTICACIÓN */}
      {slide === 2 && (
        <div className="onboarding-slide slide-active">
          <div className="slide-content">
            <div className="auth-header-section">
              <h2 className="slide-title">{t('auth_create_space_title')}</h2>
              <p className="slide-subtitle">{t('auth_create_space_subtitle')}</p>
            </div>

            {!showEmailForm ? (
              <div className="auth-social-list">
                <button className="btn-social" onClick={handleGoogleAuth}>
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {t('btn_google_auth')}
                </button>
                <button className="btn-social" onClick={() => showToast(t('toast_apple_auth_ios_only'), 'info')}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.21.67-2.93 1.49-.62.69-1.16 1.84-1.01 2.96 1.1.09 2.23-.58 2.95-1.39z"/>
                  </svg>
                  {t('btn_apple_auth')}
                </button>
                <div className="auth-divider">
                  <span className="divider" />
                  <span className="divider-text">{t('divider_or')}</span>
                  <span className="divider" />
                </div>
                <button className="btn btn-outline btn-full" onClick={() => setShowEmailForm(true)}>
                  {t('btn_use_email')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleAuthSubmit} className="auth-email-form">
                <div className="segmented mb-3">
                  <button
                    type="button"
                    className={`segmented-item ${authMode === 'login' ? 'active' : ''}`}
                    onClick={() => setAuthMode('login')}
                  >
                    {t('btn_login')}
                  </button>
                  <button
                    type="button"
                    className={`segmented-item ${authMode === 'register' ? 'active' : ''}`}
                    onClick={() => setAuthMode('register')}
                  >
                    {t('btn_register')}
                  </button>
                </div>

                {authMode === 'register' && (
                  <div className="form-group mb-2">
                    <label className="form-label">{t('label_name')}</label>
                    <input
                      type="text"
                      placeholder={t('placeholder_name')}
                      value={nombre}
                      onChange={e => setNombre(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="form-group mb-2">
                  <label className="form-label">{t('label_email')}</label>
                  <input
                    type="email"
                    placeholder={t('placeholder_email')}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group mb-3">
                  <label className="form-label">{t('label_password')}</label>
                  <input
                    type="password"
                    placeholder={t('placeholder_password')}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  {authMode === 'register' && password.length > 0 && (
                    <div className="strength-bar">
                      <div className={`strength-fill strength-${passwordStrength}`} />
                      <span className={`strength-label strength-label-${passwordStrength}`}>
                        {passwordStrength === 'weak' ? t('strength_weak') : passwordStrength === 'medium' ? t('strength_medium') : t('strength_strong')}
                      </span>
                    </div>
                  )}
                </div>

                {authMode === 'register' && (
                  <ConsentCheckbox
                    checked={consentChecked}
                    onChange={setConsentChecked}
                    disabled={loading}
                    onOpenDoc={setLegalDoc}
                  />
                )}

                <button
                  type="submit"
                  className="btn btn-primary btn-full btn-lg"
                  disabled={loading || (authMode === 'register' && !consentChecked)}
                >
                  {loading ? t('btn_loading') : authMode === 'login' ? t('btn_login') : t('btn_create_my_space')}
                </button>

                <button type="button" className="btn btn-ghost btn-full mt-2" onClick={() => setShowEmailForm(false)}>
                  {t('btn_back_to_social')}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* SLIDE 3: PAÍS (OBLIGATORIO) */}
      {slide === 3 && (
        <CountryStep
          onConfirmed={(country) => {
            setLocalCountry(country)
            goToSlide(4)
          }}
        />
      )}

      {/* SLIDE 4: BILLETERA EN EFECTIVO — solo el saldo inicial (nombre e ícono fijos) */}
      {slide === 4 && (
        <div className="onboarding-slide slide-active">
          <div className="slide-content scroll-area">
            <h2 className="slide-title">{t('onboarding_wallet_cash_title')}</h2>
            <p className="slide-subtitle">{t('onboarding_wallet_cash_subtitle')}</p>

              <div className="form-group mb-3">
                <label className="form-label">{t('label_cash_initial_balance')}</label>
                {/* "Ir" de Gboard SOLO confirma el valor (cierra el teclado): sin
                    <form> la tecla queda muerta y hay que cerrarla a mano;
                    con submit avanzaria de pantalla, que no es lo pedido. */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  {localCurrencySymbol && (
                    <span
                      style={{
                        position: 'absolute',
                        left: '16px',
                        fontSize: 'calc(22px * var(--font-scale))',
                        fontWeight: 'bold',
                        color: 'var(--text-3)',
                      }}
                    >
                      {localCurrencySymbol}
                    </span>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    enterKeyHint="done"
                    onKeyDown={handleInputEnter}
                    className="calc-display font-mono"
                    style={{
                      width: '100%',
                      paddingLeft: localCurrencySymbol ? '64px' : '16px',
                      textAlign: 'right',
                      fontSize: 'calc(24px * var(--font-scale))',
                      fontWeight: 'bold',
                    }}
                    value={cashBalanceInput}
                    onChange={e => setCashBalanceInput(e.target.value)}
                    onFocus={e => {
                      if (cashBalanceInput === '0') setCashBalanceInput('')
                    }}
                    onBlur={() => {
                      if (!cashBalanceInput || parseFloat(cashBalanceInput) < 0) setCashBalanceInput('0')
                    }}
                  />
                </div>
                <p className="text-xs text-muted mt-1">{t('onboarding_cash_balance_hint')}</p>
              </div>

            <div className="slide-footer flex flex-col gap-2">
              <button
                type="button"
                className="btn btn-primary btn-full btn-lg"
                onClick={() => handleSaveWallet()}
                disabled={loading}
              >
                {loading ? t('btn_saving') : t('onboarding_country_cta')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SLIDE 5: BILLETERA VIRTUAL (OPCIONAL) */}
      {slide === 5 && (
        <div className="onboarding-slide slide-active">
          <div className="slide-content scroll-area">
            <h2 className="slide-title">{t('onboarding_wallet_virtual_title')}</h2>
            <p className="slide-subtitle">{t('onboarding_wallet_virtual_subtitle')}</p>

            {virtualCreated ? (
              <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                <p>✅ {t('toast_virtual_wallet_created')}</p>
              </div>
            ) : showVirtualForm ? (
              <div>
                <div className="form-group mb-3">
                  <label className="form-label">{t('label_virtual_wallet_name')}</label>
                  <input
                    type="text"
                    placeholder={t('placeholder_wallet_name')}
                    value={walletName}
                    onChange={e => setWalletName(e.target.value)}
                    enterKeyHint="done"
                    onKeyDown={handleInputEnter}
                    autoFocus
                  />
                </div>

                <div className="form-group mb-3">
                  <label className="form-label">{t('label_wallet_icon')}</label>
                  <div className="emoji-selector-grid">
                    {['💵', '💶', '💷', '💴', '💰', '🪙', '💸', '💳', '🏦', '📱', '💼', '👛', '📈', '💎', '🏧'].map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        className={`emoji-selector-btn ${selectedIcon === emoji ? 'active' : ''}`}
                        onClick={() => setSelectedIcon(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group mb-3">
                  <label className="form-label">{t('label_virtual_initial_balance')}</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    {localCurrencySymbol && (
                      <span
                        style={{
                          position: 'absolute',
                          left: '16px',
                          fontSize: 'calc(22px * var(--font-scale))',
                          fontWeight: 'bold',
                          color: 'var(--text-3)',
                        }}
                      >
                        {localCurrencySymbol}
                      </span>
                    )}
                    <input
                      type="number"
                      inputMode="decimal"
                      enterKeyHint="done"
                      onKeyDown={handleInputEnter}
                      className="calc-display font-mono"
                      style={{
                        width: '100%',
                        paddingLeft: localCurrencySymbol ? '64px' : '16px',
                        textAlign: 'right',
                        fontSize: 'calc(24px * var(--font-scale))',
                        fontWeight: 'bold',
                      }}
                      value={calcInput}
                      onChange={e => setCalcInput(e.target.value)}
                      onFocus={() => {
                        if (calcInput === '0') setCalcInput('')
                      }}
                      onBlur={() => {
                        if (!calcInput || parseFloat(calcInput) < 0) setCalcInput('0')
                      }}
                    />
                  </div>
                </div>

                {/* Cancelar cierra la creacion (vuelve al estado sin form);
                    Continuar crea si hay nombre y pasa a la siguiente pantalla */}
                <div className="slide-footer flex flex-row gap-2">
                  <button
                    type="button"
                    className="onboarding-link-btn"
                    style={{ flex: 1 }}
                    onClick={() => handleCancelVirtualWallet()}
                    disabled={loading}
                  >
                    {t('btn_cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-full btn-lg"
                    style={{ flex: 1 }}
                    onClick={() => handleVirtualContinue()}
                    disabled={loading}
                  >
                    {loading ? t('btn_saving') : t('onboarding_country_cta')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-outline btn-full mt-2"
                onClick={() => setShowVirtualForm(true)}
              >
                {t('btn_create_virtual_wallet')}
              </button>
            )}

            {/* Footer común solo cuando el form no está abierto: mientras
                se crea la billetera, el pie del form (Cancelar + Continuar)
                es la única fila de acción — duplicar el CTA en el pie del
                slide mostraba dos botones idénticos con acciones distintas. */}
            {!showVirtualForm && (
              <div className="slide-footer flex flex-col gap-2">
                <button
                  className="btn btn-primary btn-full btn-lg"
                  onClick={() => goToSlide(6)}
                  disabled={loading}
                >
                  {t('onboarding_country_cta')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SLIDE 6: TU RITMO (DIA ANCLA) - finaliza el onboarding, sin pantalla de modo */}
      {slide === 6 && (
        <div className="onboarding-slide slide-active">
          <div className="slide-content">
            <div className="slide-header-actions">
              <button className="onboarding-skip-btn" onClick={() => { setAnchorDay(1); handleFinishOnboarding(); }}>
                {t('btn_skip')}
              </button>
            </div>

            <h2 className="slide-title">{t('onboarding_anchor_day_subtitle')}</h2>
            <p className="slide-subtitle">{t('onboarding_anchor_day_title')}</p>

            {/* Selector de Día Ancla (Spinner/Grid) */}
            <div className="anchor-day-selector">
              <div className="anchor-day-display">
                {t("auth_day")} <span className="anchor-day-number">{anchorDay}</span>
              </div>
              <input
                type="range"
                min="1"
                max="31"
                value={anchorDay}
                onChange={e => setAnchorDay(parseInt(e.target.value, 10))}
                className="anchor-day-slider"
              />
              <div className="anchor-day-ticks">
                <span>1</span>
                <span>10</span>
                <span>20</span>
                <span>31</span>
              </div>
            </div>

            {/* Preview Reactivo Dinámico */}
            <div className="anchor-day-preview card">
              <span className="preview-icon">📅</span>
              <p className="text-sm">{getCyclePreviewText()}</p>
            </div>

            <div className="slide-footer flex flex-col gap-2">
              {/* onClick DEBE invocar: sin parentesis la flecha devuelve la
                  referencia y el click no hace nada. */}
              <button className="btn btn-primary btn-full btn-lg" onClick={() => handleFinishOnboarding()}>
                {loading ? t('btn_creating_space', { defaultValue: 'Creando espacio...' }) : t('btn_next')}
              </button>
              <button className="onboarding-link-btn" onClick={() => { setAnchorDay(1); handleFinishOnboarding(); }}>
                {t('btn_use_day_1')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
