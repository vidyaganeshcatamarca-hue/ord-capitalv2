// supabase/functions/get_currency/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const apiKey = Deno.env.get('EXCHANGE_RATE_API_KEY');
    if (!apiKey) throw new Error("EXCHANGE_RATE_API_KEY not configured");

    const apiUrl = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;
    const apiRes = await fetch(apiUrl);
    if (!apiRes.ok) throw new Error(`API error: ${apiRes.status}`);
    
    const apiData = await apiRes.json();
    const rates = apiData.conversion_rates; // { USD: 1, ARS: 1446, MXN: 17.43, ... }
    const today = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
    const date30DaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Currencies to quote: every local currency of a soportado country, plus USD.
    // D17: the catalog drives this, so adding a country adds its currency with no
    // code change. If the catalog read fails, fall back to the historical eight so
    // the daily rates never silently stop refreshing.
    const monedasHardcodeadas = ['USD', 'ARS', 'MXN', 'EUR', 'BRL', 'CLP', 'COP', 'PEN'];
    let monedas = monedasHardcodeadas;
    let catalogoFuente = 'fallback_hardcodeado';
    {
      const { data: paisesSoportados, error: errorPaises } = await supabase
        .from('p_paises')
        .select('moneda_local')
        .eq('soportado', true);
      if (errorPaises) {
        console.error('No se pudo leer p_paises.soportado:', errorPaises.message);
      } else {
        const delCatalogo = (paisesSoportados ?? [])
          .map((p) => p.moneda_local)
          .filter((m): m is string => typeof m === 'string' && m.length > 0);
        if (delCatalogo.length > 0) {
          monedas = [...new Set(['USD', ...delCatalogo])];
          catalogoFuente = 'p_paises_soportado';
        }
      }
    }
    const resultados = [];

    for (const moneda of monedas) {
      if (rates[moneda]) {
        // A. INSERTAR EN HISTÓRICO (Ignora si ya existe gracias al UNIQUE constraint)
        await supabase
          .from('p_cotizaciones_historico')
          .insert({
            fecha: today,
            moneda_iso: moneda,
            valor_por_usd: rates[moneda]
          })
          .maybeSingle(); // maybeSingle evita error si ya existe (ON CONFLICT implícito por la política de Supabase o manejado por el unique)

        // B. OBTENER VALOR DE HACE 30 DÍAS PARA CÁLCULO
        const { data: valorHace30 } = await supabase
          .from('p_cotizaciones_historico')
          .select('valor_por_usd')
          .eq('moneda_iso', moneda)
          .lte('fecha', date30DaysAgo)
          .order('fecha', { ascending: false })
          .limit(1)
          .maybeSingle();

        const valorAnterior = valorHace30?.valor_por_usd || rates[moneda];
        const variacion = valorAnterior > 0 
          ? ((rates[moneda] - valorAnterior) / valorAnterior) * 100 
          : 0;

        // C. ACTUALIZAR TABLA CACHÉ (p_divisas)
        await supabase
          .from('p_divisas')
          .upsert({
            nombre: moneda,
            valor_por_usd: rates[moneda],
            valor_anterior: valorAnterior,
            variacion_mensual_pct: parseFloat(variacion.toFixed(2)),
            ultima_actualizacion: new Date().toISOString()
          }, { onConflict: 'nombre' });

        resultados.push({ moneda, valor: rates[moneda], variacion });
      }
    }

    return new Response(JSON.stringify({ success: true, catalogo_fuente: catalogoFuente, monedas_cotizadas: monedas.length, data: resultados }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});