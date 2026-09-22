import type OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { admiteTemperatura, CHATBOT, modeloChat } from './config'
import { CONTACTO_ESTUDIO } from './conocimiento'
import type { MensajeChat } from './conversaciones'
import type { ClienteOpenAI } from './openai'
import { construirSystemPrompt } from './prompt'
import { ejecutarHerramienta, HERRAMIENTAS, type EjecucionHerramienta } from './tools'

type Cliente = SupabaseClient<Database>
type MensajeOpenAI = OpenAI.Chat.Completions.ChatCompletionMessageParam

export type RegistroHerramienta = EjecucionHerramienta['registro']

export const MENSAJE_SIN_RESPUESTA =
  `Perdona, no he podido completar tu petición ahora mismo. Puedes escribirnos a ${CONTACTO_ESTUDIO.email} ` +
  `o llamarnos al ${CONTACTO_ESTUDIO.telefono} y te ayudamos enseguida.`

// Bucle de function calling. A diferencia de zorion-chat (que ejecutaba la
// herramienta y mandaba su resultado directo a la clienta), aquí el resultado
// de cada herramienta VUELVE al modelo como mensaje role "tool" y este decide
// qué decir o qué herramienta usar después. Así puede encadenar
// consultar disponibilidad -> proponer horas -> crear la cita.
export async function responderMensaje({
  openai,
  supabase,
  historial,
  mensajeUsuario,
  ahora = new Date(),
}: {
  openai: ClienteOpenAI
  supabase: Cliente
  historial: MensajeChat[]
  mensajeUsuario: string
  ahora?: Date
}): Promise<{ respuesta: string; herramientas: RegistroHerramienta[] }> {
  const modelo = modeloChat()
  const registros: RegistroHerramienta[] = []

  const mensajes: MensajeOpenAI[] = [
    { role: 'system', content: await construirSystemPrompt(supabase, ahora) },
    ...historial.map((m) => ({ role: m.rol, content: m.contenido }) as MensajeOpenAI),
    { role: 'user', content: mensajeUsuario },
  ]

  for (let vuelta = 0; vuelta < CHATBOT.maxIteracionesHerramientas; vuelta++) {
    const ultimaVuelta = vuelta === CHATBOT.maxIteracionesHerramientas - 1

    const completion = await openai.chat.completions.create({
      model: modelo,
      messages: mensajes,
      tools: HERRAMIENTAS,
      // Una herramienta cada vez: crear_cita nunca debe dispararse en paralelo.
      parallel_tool_calls: false,
      // En la última vuelta se le prohíben las herramientas para que cierre con texto.
      tool_choice: ultimaVuelta ? 'none' : 'auto',
      max_completion_tokens: CHATBOT.maxTokensRespuesta,
      ...(admiteTemperatura(modelo) ? { temperature: 0.3 } : {}),
    })

    const mensaje = completion.choices[0]?.message
    if (!mensaje) {
      throw new Error('OpenAI devolvió una respuesta sin mensaje')
    }

    const llamadas = mensaje.tool_calls
    if (!llamadas || llamadas.length === 0) {
      const respuesta = mensaje.content?.trim()
      if (!respuesta) {
        console.error('El modelo respondió sin texto ni herramientas:', JSON.stringify(mensaje))
        return { respuesta: MENSAJE_SIN_RESPUESTA, herramientas: registros }
      }
      return { respuesta, herramientas: registros }
    }

    // Con tool_choice 'none' esto no debería ocurrir. Si ocurre, NO se ejecutan:
    // una crear_cita cuyo resultado se descarta sería peor que no hacer nada.
    if (ultimaVuelta) {
      console.error('El modelo pidió herramientas en la última vuelta, donde están prohibidas:', JSON.stringify(llamadas))
      return { respuesta: MENSAJE_SIN_RESPUESTA, herramientas: registros }
    }

    // El mensaje del asistente con sus tool_calls debe ir ANTES de los resultados.
    mensajes.push({ role: 'assistant', content: mensaje.content ?? null, tool_calls: llamadas })

    for (const llamada of llamadas) {
      if (llamada.type !== 'function') {
        console.error('El modelo pidió una herramienta de tipo no soportado:', llamada.type)
        const ejecucion = await ejecutarHerramienta(supabase, `(${llamada.type})`, '{}')
        registros.push(ejecucion.registro)
        mensajes.push({ role: 'tool', tool_call_id: llamada.id, content: ejecucion.contenido })
        continue
      }

      const ejecucion = await ejecutarHerramienta(supabase, llamada.function.name, llamada.function.arguments)
      registros.push(ejecucion.registro)
      mensajes.push({ role: 'tool', tool_call_id: llamada.id, content: ejecucion.contenido })
    }
  }

  // Inalcanzable en la práctica (la última vuelta no admite herramientas), pero
  // si el modelo insistiera, mejor una salida controlada que un bucle o un 500.
  console.error('El bucle de herramientas se agotó sin respuesta de texto')
  return { respuesta: MENSAJE_SIN_RESPUESTA, herramientas: registros }
}
