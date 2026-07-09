import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { safeEval } from '@/utils/math'
import './Auth.css'

type Mode = 'login' | 'register'
type BudgetMode = 'libertad' | 'disciplina'

export function AuthPage() {
  const navigate = useNavigate()
  const { session, setOnboardingCompleto } = useAuth()
  const { showToast } = useToast()

  // Onboarding Slides (1 to 5)
  const [slide, setSlide] = useState(1)

  // Slide 2: Auth State
  const [authMode, setAuthMode] = useState<Mode>('login')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)

  // Slide 3: Wallet State
  const [walletName, setWalletName] = useState('')
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS')
  const [calcInput, setCalcInput] = useState('0')
  const [isCalculated, setIsCalculated] = useState(true)
  const [selectedIcon, setSelectedIcon] = useState('💵')

  // Slide 4: Anchor Day State
  const [anchorDay, setAnchorDay] = useState(1)

  // Slide 5: Psychological Contract State
  const [budgetMode, setBudgetMode] = useState<BudgetMode>('libertad')

  // Redirección si ya está autenticado al cargar
  useEffect(() => {
    if (session) {
      checkExistingOnboarding()
    }
  }, [session])

  // Cargar progreso guardado de localStorage
  useEffect(() => {
    const savedSlide = localStorage.getItem('onboarding_slide')
    if (savedSlide && session) {
      const parsed = parseInt(savedSlide, 10)
      if (parsed > 2 && parsed <= 5) {
        setSlide(parsed)
      }
    }
  }, [session])

  const checkExistingOnboarding = async () => {
    setLoading(true)
    try {
      if (!session?.user?.id) {
        setSlide(3)
        return
      }

      // Consultar el estado del onboarding mediante la RPC segura (SECURITY DEFINER)
      const { data: status, error } = await supabase.rpc('fn_verificar_status_onboarding')

      if (error) {
        console.error('Error al verificar status de onboarding:', error)
        setSlide(3)
        return
      }

      if (status?.onboarding_completo) {
        // Ya completó onboarding antes
        setOnboardingCompleto(true)
        localStorage.removeItem('onboarding_slide')
        navigate('/', { replace: true })
      } else {
        // No ha completado, mandar a Slide 3 (Primera Billetera)
        setSlide(3)
        localStorage.setItem('onboarding_slide', '3')
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
      localStorage.setItem('onboarding_slide', nextSlide.toString())
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
          options: { data: { nombre } },
        })
        if (error) throw error
        showToast('¡Cuenta creada! Revisa tu email para confirmar.', 'success')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
      // Al loguearse, el useEffect redirigirá a checkExistingOnboarding()
    } catch (err: any) {
      showToast(err.message || 'Error de autenticación', 'error')
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
      showToast(err.message || 'Error al iniciar con Google', 'error')
    }
  }

  // --- LÓGICA DE LA CALCULADORA (SLIDE 3) ---
  const handleCalcKeyPress = (key: string) => {
    if (navigator.vibrate) navigator.vibrate(10) // Haptic feedback nativo simple

    if (key === 'C') {
      setCalcInput('0')
      setIsCalculated(true)
      return
    }

    if (key === '⌫') {
      if (calcInput.length <= 1 || calcInput === 'Error') {
        setCalcInput('0')
        setIsCalculated(true)
      } else {
        setCalcInput(calcInput.slice(0, -1))
      }
      return
    }

    if (key === '=') {
      evaluateOperation()
      return
    }

    // Operadores
    if (['+', '-', '*', '/'].includes(key)) {
      // Evitar operadores repetidos
      const lastChar = calcInput.slice(-1)
      if (['+', '-', '*', '/'].includes(lastChar)) {
        setCalcInput(calcInput.slice(0, -1) + key)
      } else {
        setCalcInput(calcInput + key)
      }
      setIsCalculated(false)
      return
    }

    // Números
    if (calcInput === '0' || calcInput === 'Error' || (isCalculated && !['+', '-', '*', '/'].includes(key))) {
      setCalcInput(key)
      setIsCalculated(false)
    } else {
      setCalcInput(calcInput + key)
    }
  }

  const evaluateOperation = () => {
    try {
      const result = safeEval(calcInput)
      if (isNaN(result) || !isFinite(result)) {
        setCalcInput('Error')
      } else {
        // Redondear a 2 decimales máximo
        setCalcInput(Number(result.toFixed(2)).toString())
      }
      setIsCalculated(true)
    } catch {
      setCalcInput('Error')
      setIsCalculated(true)
    }
  }

  // --- LLAMADA RPC SLIDE 3: Guardar Billetera ---
  const handleSaveWallet = async (skipBalance = false) => {
    setLoading(true)
    const saldo = skipBalance ? 0 : parseFloat(calcInput) || 0
    const name = walletName.trim() || 'Efectivo'

    try {
      const { error } = await supabase.rpc('fn_crear_billetera_inicial', {
        p_nombre: name,
        p_moneda: currency,
        p_saldo_apertura: saldo,
        p_icono: selectedIcon
      })

      if (error) throw error

      showToast(`¡Billetera ${name} creada exitosamente!`, 'success')
      goToSlide(4)
    } catch (err: any) {
      showToast(err.message || 'Error al crear la billetera inicial', 'error')
    } finally {
      setLoading(false)
    }
  }

  // --- PREVIEW RANGO DE DÍA ANCLA (SLIDE 4) ---
  const getCyclePreviewText = () => {
    const today = new Date()
    const currentMonth = today.toLocaleString('es-ES', { month: 'long' })
    
    if (anchorDay === 1) {
      const lastDayCurrent = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
      return `Tu ciclo irá del 1 de ${currentMonth} al ${lastDayCurrent} de ${currentMonth}.`
    } else {
      const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      const nextMonth = nextMonthDate.toLocaleString('es-ES', { month: 'long' })
      const endDay = anchorDay - 1
      return `Tu ciclo irá del ${anchorDay} de ${currentMonth} al ${endDay} de ${nextMonth}.`
    }
  }

  // --- LLAMADA RPC SLIDE 5: Finalizar Onboarding ---
  const handleFinishOnboarding = async () => {
    setLoading(true)
    const modoRPC = budgetMode === 'libertad' ? 'anticipado' : 'base_cero'

    try {
      const { error } = await supabase.rpc('fn_configurar_onboarding_final', {
        p_dia_ancla_ciclo: anchorDay,
        p_modo_presupuesto: modoRPC
      })

      if (error) throw error

      // Guardar completado y redirigir
      setOnboardingCompleto(true)
      localStorage.removeItem('onboarding_slide') // Limpiar slide temporal
      showToast('¡Configuración completada!', 'success')
      navigate('/', { replace: true })
    } catch (err: any) {
      showToast(err.message || 'Error al finalizar el onboarding', 'error')
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

  return (
    <div className="onboarding-container">
      {/* ── Background decorativo ── */}
      <div className="auth-bg">
        <div className="auth-blob auth-blob-1" />
        <div className="auth-blob auth-blob-2" />
      </div>

      {/* ProgressBar Fijo Superior */}
      <div className="onboarding-progress-bar">
        <div className="onboarding-progress-fill" style={{ width: `${slide * 20}%` }} />
      </div>

      {/* SLIDE 1: BIENVENIDA */}
      {slide === 1 && (
        <div className="onboarding-slide slide-active">
          <div className="slide-content">
            <div className="welcome-hero">
              <div className="welcome-icon-box">
                <svg viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="20" fill="var(--mint-dim)" />
                  <path d="M12 28 L20 12 L28 28" stroke="var(--mint)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M15 23 L25 23" stroke="var(--mint)" strokeWidth="2.5" strokeLinecap="round"/>
                  <circle cx="20" cy="12" r="2" fill="var(--mint)" />
                </svg>
              </div>
              <h1 className="welcome-title">Tu dinero, sin ansiedad.</h1>
              <p className="welcome-subtitle">Deja de adivinar cuánto puedes gastar libremente hoy.</p>
            </div>
            <div className="slide-footer">
              <button className="btn btn-primary btn-full btn-lg" onClick={() => goToSlide(2)}>
                Comenzar
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
              <h2 className="slide-title">Crea tu espacio financiero</h2>
              <p className="slide-subtitle">Tus datos están protegidos con cifrado y máxima seguridad.</p>
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
                  Continuar con Google
                </button>
                <button className="btn-social" onClick={() => showToast('Apple Sign In disponible en dispositivos iOS', 'info')}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.21.67-2.93 1.49-.62.69-1.16 1.84-1.01 2.96 1.1.09 2.23-.58 2.95-1.39z"/>
                  </svg>
                  Continuar con Apple
                </button>
                <div className="auth-divider">
                  <span className="divider" />
                  <span className="divider-text">o</span>
                  <span className="divider" />
                </div>
                <button className="btn btn-outline btn-full" onClick={() => setShowEmailForm(true)}>
                  ✉️ Usar Correo Electrónico
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
                    Ingresar
                  </button>
                  <button
                    type="button"
                    className={`segmented-item ${authMode === 'register' ? 'active' : ''}`}
                    onClick={() => setAuthMode('register')}
                  >
                    Registrarse
                  </button>
                </div>

                {authMode === 'register' && (
                  <div className="form-group mb-2">
                    <label className="form-label">Nombre</label>
                    <input
                      type="text"
                      placeholder="Ej: Juan"
                      value={nombre}
                      onChange={e => setNombre(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="form-group mb-2">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group mb-3">
                  <label className="form-label">Contraseña</label>
                  <input
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  {authMode === 'register' && password.length > 0 && (
                    <div className="strength-bar">
                      <div className={`strength-fill strength-${passwordStrength}`} />
                      <span className={`strength-label strength-label-${passwordStrength}`}>
                        {passwordStrength === 'weak' ? 'Débil' : passwordStrength === 'medium' ? 'Media' : 'Fuerte'}
                      </span>
                    </div>
                  )}
                </div>

                <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
                  {loading ? 'Cargando...' : authMode === 'login' ? 'Ingresar' : 'Crear mi espacio'}
                </button>

                <button type="button" className="btn btn-ghost btn-full mt-2" onClick={() => setShowEmailForm(false)}>
                  ← Volver a Redes Sociales
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* SLIDE 3: PRIMERA BILLETERA */}
      {slide === 3 && (
        <div className="onboarding-slide slide-active">
          <div className="slide-content scroll-area">
            <div className="slide-header-actions">
              <button className="onboarding-skip-btn" onClick={() => handleSaveWallet(true)}>
                Saltar
              </button>
            </div>

            <h2 className="slide-title">¿Dónde guardas tu dinero del día a día?</h2>
            <p className="slide-subtitle">Solo la cuenta que más usas para transaccionar. Podrás agregar más luego.</p>

            <div className="form-group mb-3">
              <label className="form-label">Nombre de la cuenta</label>
              <input
                type="text"
                placeholder="Ej: MercadoPago, Efectivo, Banco Galicia"
                value={walletName}
                onChange={e => setWalletName(e.target.value)}
              />
            </div>

            <div className="form-group mb-3">
              <label className="form-label">Icono de la cuenta</label>
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
              <label className="form-label">Moneda</label>
              <div className="segmented">
                <button
                  type="button"
                  className={`segmented-item ${currency === 'ARS' ? 'active' : ''}`}
                  onClick={() => setCurrency('ARS')}
                >
                  ARS 🇦🇷
                </button>
                <button
                  type="button"
                  className={`segmented-item ${currency === 'USD' ? 'active' : ''}`}
                  onClick={() => setCurrency('USD')}
                >
                  USD 🇺🇸
                </button>
              </div>
            </div>

            {/* Calculadora de Saldo Inicial */}
            <div className="form-group mb-3">
              <label className="form-label">Saldo Inicial</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ 
                  position: 'absolute', 
                  left: '16px', 
                  fontSize: '22px', 
                  fontWeight: 'bold', 
                  color: 'var(--text-3)' 
                }}>
                  {currency === 'ARS' ? '$' : 'U$S'}
                </span>
                <input
                  type="text"
                  className="calc-display font-mono"
                  style={{ 
                    width: '100%', 
                    paddingLeft: '64px', 
                    textAlign: 'right',
                    fontSize: '24px',
                    fontWeight: 'bold'
                  }}
                  value={calcInput}
                  onChange={e => {
                    const val = e.target.value
                    if (/^[0-9+\-*/.\s]*$/.test(val)) {
                      setCalcInput(val)
                      setIsCalculated(false)
                    }
                  }}
                  onFocus={e => {
                    if (calcInput === '0') {
                      setCalcInput('')
                    }
                  }}
                  onBlur={e => {
                    evaluateOperation()
                    setTimeout(() => {
                      setCalcInput(prev => {
                        if (!prev || prev.trim() === '' || prev === 'Error') return '0'
                        return prev
                      })
                    }, 50)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      evaluateOperation()
                    }
                  }}
                />
              </div>

              {/* Teclado Calculadora */}
              <div className="calc-keyboard mt-2">
                {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', 'C', '+'].map(char => (
                  <button
                    key={char}
                    type="button"
                    className="calc-key"
                    onClick={() => handleCalcKeyPress(char)}
                  >
                    {char}
                  </button>
                ))}
                <button type="button" className="calc-key calc-key-backspace" onClick={() => handleCalcKeyPress('⌫')}>
                  ⌫
                </button>
                <button type="button" className="calc-key calc-key-eval" onClick={() => handleCalcKeyPress('=')}>
                  =
                </button>
              </div>
            </div>

            <div className="slide-footer flex flex-col gap-2">
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={() => handleSaveWallet(false)}
                disabled={walletName.trim().length === 0 || parseFloat(calcInput) <= 0 || loading}
              >
                {loading ? 'Guardando...' : 'Guardar mi primera cuenta'}
              </button>
              <button className="onboarding-link-btn" onClick={() => handleSaveWallet(true)}>
                No quiero cargar saldo ahora &gt;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SLIDE 4: TU RITMO (DÍA ANCLA) */}
      {slide === 4 && (
        <div className="onboarding-slide slide-active">
          <div className="slide-content">
            <div className="slide-header-actions">
              <button className="onboarding-skip-btn" onClick={() => { setAnchorDay(1); goToSlide(5); }}>
                Saltar
              </button>
            </div>

            <h2 className="slide-title">¿Qué día del mes cobras o recibes tus ingresos?</h2>
            <p className="slide-subtitle">Esto nos ayuda a estructurar y saber cuándo inicia tu mes financiero.</p>

            {/* Selector de Día Ancla (Spinner/Grid) */}
            <div className="anchor-day-selector">
              <div className="anchor-day-display">
                Día <span className="anchor-day-number">{anchorDay}</span>
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
              <button className="btn btn-primary btn-full btn-lg" onClick={() => goToSlide(5)}>
                Siguiente
              </button>
              <button className="onboarding-link-btn" onClick={() => { setAnchorDay(1); goToSlide(5); }}>
                No estoy seguro, usar día 1 &gt;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SLIDE 5: CONTRATO PSICOLÓGICO */}
      {slide === 5 && (
        <div className="onboarding-slide slide-active">
          <div className="slide-content scroll-area">
            <h2 className="slide-title">¿Cómo quieres que te acompañemos?</h2>
            <p className="slide-subtitle">Configura el método de presupuesto inicial. Podrás cambiarlo cuando desees.</p>

            <div className="mode-cards flex flex-col gap-3">
              {/* Tarjeta A: Modo Libertad */}
              <div
                className={`mode-card ${budgetMode === 'libertad' ? 'card-active-libertad' : ''}`}
                onClick={() => setBudgetMode('libertad')}
              >
                <div className="mode-card-header">
                  <span className="mode-emoji">🕊️</span>
                  <div className="mode-title-wrap">
                    <h3 className="mode-card-title">Modo Libertad</h3>
                    <span className="mode-badge-recommended">Recomendado</span>
                  </div>
                </div>
                <p className="mode-card-desc">
                  Registra tus movimientos diarios y la app te mostrará exactamente en qué se va tu dinero. Claridad sin presiones.
                </p>
              </div>

              {/* Tarjeta B: Modo Disciplina */}
              <div
                className={`mode-card ${budgetMode === 'disciplina' ? 'card-active-disciplina' : ''}`}
                onClick={() => setBudgetMode('disciplina')}
              >
                <div className="mode-card-header">
                  <span className="mode-emoji">🔒</span>
                  <div className="mode-title-wrap">
                    <h3 className="mode-card-title">Modo Disciplina de Hierro</h3>
                  </div>
                </div>
                <p className="mode-card-desc">
                  Asigna un propósito a cada centavo antes de que empiece el mes. La app te enviará alertas rigurosas si te desvías del plan.
                </p>
              </div>
            </div>

            <div className="slide-footer">
              <button className="btn btn-primary btn-full btn-lg mt-4" onClick={handleFinishOnboarding} disabled={loading}>
                {loading ? 'Creando espacio...' : 'Crear mi espacio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
