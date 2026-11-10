// supabase/functions/send-daily-expenses-reminder/index.ts
// Edge Function: cada hora, dispara el recordatorio diario de carga de
// gastos para los usuarios que lo tengan activo a esa hora. Backend NO
// escribe copy en espanol: devuelve message_key + params, el frontend
// traduce con t().

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const now = new Date()
    const hora = now.toTimeString().slice(0, 5)

    const { data: configs, error } = await supabase
      .from("p_notificaciones_config")
      .select("user_id, reminder_daily_expenses_time")
      .eq("reminder_daily_expenses", true)
      .eq("reminder_daily_expenses_time", hora)

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

    let sent = 0
    for (const c of (configs ?? []) as { user_id: number }[]) {
      const idemKey = `${c.user_id}-daily-${now.toISOString().slice(0, 10)}`
      const metadata = {
        idempotency_key: idemKey,
        message_key_titulo: "notif_cargar_gastos_titulo",
        message_key_mensaje: "notif_cargar_gastos_mensaje",
      }
      // titulo/mensaje quedan vacios: el frontend usa message_key para traducir.
      await supabase.from("p_notificaciones_enviadas").insert({
        user_id: c.user_id,
        tipo_notificacion: "reminder_daily_expenses",
        titulo: "",
        mensaje: "",
        canal: "in_app",
        metadata,
      })
      sent++
    }
    return new Response(
      JSON.stringify({ sent }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
