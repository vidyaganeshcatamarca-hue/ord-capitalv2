import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  console.error('\x1b[31mError: Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local\x1b[0m')
  process.exit(1)
}

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
}

// Inyectar el token del usuario directamente en las cabeceras globales
if (config.testAccessToken) {
  clientOptions.global = {
    headers: {
      Authorization: `Bearer ${config.testAccessToken}`
    }
  }
}

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, clientOptions)

// Setup the authenticated session
export async function setupSession() {
  console.log('\x1b[36m========== INICIANDO DIAGNÓSTICO DE BASE DE DATOS ==========\x1b[0m')

  if (config.testAccessToken) {
    console.log('Autenticando mediante cabecera Bearer Token (Access Token)...')
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      console.error('\x1b[31mError al validar el token de acceso con getUser():\x1b[0m', error.message)
      return false
    }
    console.log(`\x1b[32mSesión establecida con éxito. Usuario:\x1b[0m ${user?.email} (${user?.id})`)
    return true
  }

  if (config.testUserEmail && config.testUserPassword) {
    console.log(`Autenticando mediante credenciales para ${config.testUserEmail}...`)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: config.testUserEmail,
      password: config.testUserPassword
    })

    if (error) {
      console.error('\x1b[31mError al iniciar sesión con contraseña:\x1b[0m', error.message)
      return false
    }
    console.log(`\x1b[32mSesión establecida con éxito. Usuario:\x1b[0m ${data.user?.email} (${data.user?.id})`)
    return true
  }

  console.log('\x1b[33mEjecutando consultas sin autenticar (Anónimo). Algunas políticas RLS pueden fallar.\x1b[0m')
  return true
}

// Function to run a test file dynamically
async function main() {
  const testFileArg = process.argv[2]
  if (!testFileArg) {
    console.log('\x1b[33mUso: node tests/test_runner.js <nombre_del_test>\x1b[0m')
    console.log('Ejemplo: node tests/test_runner.js onboarding')
    process.exit(0)
  }

  const requiresSession = !testFileArg.startsWith('icon-wrappers/')
  if (requiresSession) {
    const authenticated = await setupSession()
    if (!authenticated && (config.testAccessToken || config.testUserEmail)) {
      console.error('\x1b[31mDeteniendo ejecución debido a fallas de autenticación.\x1b[0m')
      process.exit(1)
    }
  } else {
    console.log('Ejecutando suite local sin sesión de Supabase...')
  }

  try {
    const testModulePath = `./${testFileArg}.test.js`
    console.log(`Cargando suite de pruebas: \x1b[35m${testFileArg}\x1b[0m\n`)
    const testSuite = await import(testModulePath)

    if (typeof testSuite.run === 'function') {
      await testSuite.run(supabase)
    } else {
      console.error(`\x1b[31mError: El archivo ${testModulePath} no exporta una función 'run'.\x1b[0m`)
    }
  } catch (err) {
    console.error(`\x1b[31mError al cargar o ejecutar la suite de pruebas:\x1b[0m`, err)
  }
}

// Only run main if executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('test_runner.js')) {
  main()
}
