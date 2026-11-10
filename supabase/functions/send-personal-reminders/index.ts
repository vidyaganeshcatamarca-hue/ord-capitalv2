// supabase/functions/send-personal-reminders/index.ts
// Edge Function: cada hora, evalua recordatorios personales del usuario e
// inserta en p_notificaciones_enviadas. El backend NUNCA devuelve texto
// en espanol: en su lugar envia message_key + params y el frontend traduce
// con t().

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

interface Recordatorio {
  recordatorio_id: number
  user_id: number
  titulo: string
  descripcion: string | null
  recurrente: boolean
  fecha_unica: string | null
  dias_semana: string[] | null
}

const DAY_MAP: Record<number, string> = { 0: "D", 1: "L", 2: "M", 3: "X", 4: "J", 5: "V", 6: "S" }

function recurrenceKind(r: Recordatorio): "diario" | "semanal" | "unico" {
  if (!r.recurrente) return "unico"
  const days = r.dias_semana ?? []
  if (days.length === 7) return "diario"
  return "semanal"
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const now = new Date()
    const hora = now.toTimeString().slice(0, 5)
    const dow = DAY_MAP[now.getDay()]

    const { data: recs, error } = await supabase
      .from("p_recordatorios")
      .select("recordatorio_id, user_id, titulo, descripcion, recurrente, fecha_unica, dias_semana")
      .eq("activo", true)
      .eq("hora", hora)

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

    let processed = 0
    for (const r of (recs ?? []) as Recordatorio[]) {
      if (r.recurrente) {
        if (!r.dias_semana?.includes(dow)) continue
      } else {
        const today = now.toISOString().slice(0, 10)
        if (r.fecha_unica !== today) continue
      }

      const kind = recurrenceKind(r)
      const idemKey = `${r.user_id}-${r.recordatorio_id}-${now.toISOString().slice(0, 10)}`

      // El backend NO escribe copy localizado. El frontend traduce el titulo
      // y mensaje a partir de las claves i18n que devuelve.
      const metadata: Record<string, unknown> = {
        recordatorio_id: r.recordatorio_id,
        idempotency_key: idemKey,
        recurrencia: kind,
        message_key_titulo: `notif_recordatorio_personal_${kind}_titulo`,
        message_key_mensaje: "notif_recordatorio_personal_default_mensaje",
      }

      await supabase.from("p_notificaciones_enviadas").insert({
        user_id: r.user_id,
        tipo_notificacion: "recordatorio_personal",
        // titulo/mensaje quedan como el contenido del recordatorio (data del
        // usuario, no copy de la app). El frontend puede ignorarlos y
        // traducir via message_key.
        titulo: r.titulo,
        mensaje: r.descripcion ?? "",
        canal: "in_app",
        metadata,
      })
      processed++
    }
    return new Response(
      JSON.stringify({ processed }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
