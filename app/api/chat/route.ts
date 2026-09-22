import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { responderMensaje } from '@/lib/chatbot/agente'
import { CHATBOT } from '@/lib/chatbot/config'
import { CONTACTO_ESTUDIO } from '@/lib/chatbot/conocimiento'
import {
  buscarConversacion,
  crearConversacion,
  guardarMensajeAsistente,
  guardarMensajeUsuario,
  obtenerHistorial,
} from '@/lib/chatbot/conversaciones'
import {
  comprobarConversacionNueva,
  comprobarLimiteCitasConversacion,
  comprobarLimiteMensajesConversacion,
  comprobarRateLimitMensajes,
  hashIp,
  obtenerIp,
  validarMensaje,
} from '@/lib/chatbot/limites'
import { getOpenAI } from '@/lib/chatbot/openai'

// Varias vueltas al modelo (consultar disponibilidad -> crear cita) pueden
// tardar más que el tiempo por defecto de la función.
export const maxDuration = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MENSAJE_NO_DISPONIBLE =
  `El asistente virtual no está disponible ahora mismo. Puedes reservar desde la web ` +
  `("Reservar cita") o escribirnos: ${CONTACTO_ESTUDIO.telefono} · ${CONTACTO_ESTUDIO.email}.`

function respuestaError(mensaje: string, codigo: string, status: number) {
  return NextResponse.json({ error: mensaje, codigo }, { status })
}

// POST /api/chat
// Body: { mensaje: string, session_id: string (UUID generado por el navegador) }
// Éxito: 200 { respuesta: string }
// Error: { error: string (legible, listo para mostrar), codigo: string } con 400/413/429/502/503
//
// Endpoint PÚBLICO y de pago (cada mensaje puede llamar al modelo): por eso
// todos los límites se comprueban ANTES de llamar a OpenAI. Usa service_role
// solo para las tablas chat_* y para las herramientas, que validan todo en
// lib/disponibilidad.ts y lib/citas.ts (el modelo nunca escribe a la base de
// datos por su cuenta).
export async function POST(request: NextRequest) {
  // 1. Forma de la petición (lo más barato primero)
  if (Number(request.headers.get('content-length') ?? 0) > CHATBOT.maxBytesPeticion) {
    return respuestaError('La petición es demasiado grande.', 'peticion_grande', 413)
  }

  let body: { mensaje?: unknown; session_id?: unknown }
  try {
    body = await request.json()
  } catch (error) {
    console.error('Chat: cuerpo de la petición no es JSON válido:', error)
    return respuestaError('El cuerpo de la petición no es JSON válido.', 'json_invalido', 400)
  }

  const mensaje = validarMensaje(body?.mensaje)
  if (!mensaje.ok) {
    return respuestaError(mensaje.error.mensaje, mensaje.error.codigo, mensaje.error.status)
  }

  if (typeof body.session_id !== 'string' || !UUID.test(body.session_id)) {
    return respuestaError('Falta un session_id válido.', 'session_invalida', 400)
  }
  const sessionId = body.session_id.toLowerCase()

  // 2. Configuración del servidor (sin claves no hay bot; se avisa en los logs con el NOMBRE de la variable)
  const openai = getOpenAI()
  const sal = process.env.CHAT_IP_SALT
  if (!openai || !sal) {
    console.error(
      `Chat no disponible: falta configurar ${[!openai && 'OPENAI_API_KEY', !sal && 'CHAT_IP_SALT'].filter(Boolean).join(' y ')}`
    )
    return respuestaError(MENSAJE_NO_DISPONIBLE, 'chat_no_disponible', 503)
  }

  const supabase = createServiceClient()
  const ipHash = hashIp(obtenerIp(request.headers), sal)

  try {
    // 3. Límites (nada de esto llega a OpenAI)
    const rate = await comprobarRateLimitMensajes(supabase, ipHash)
    if (!rate.ok) return respuestaError(rate.error.mensaje, rate.error.codigo, rate.error.status)

    let conversacion = await buscarConversacion(supabase, sessionId)

    if (conversacion) {
      const tope = await comprobarLimiteMensajesConversacion(supabase, conversacion.id)
      if (!tope.ok) return respuestaError(tope.error.mensaje, tope.error.codigo, tope.error.status)

      const topeCitas = await comprobarLimiteCitasConversacion(supabase, conversacion.id)
      if (!topeCitas.ok) return respuestaError(topeCitas.error.mensaje, topeCitas.error.codigo, topeCitas.error.status)
    } else {
      const nueva = await comprobarConversacionNueva(supabase, ipHash)
      if (!nueva.ok) return respuestaError(nueva.error.mensaje, nueva.error.codigo, nueva.error.status)
      conversacion = await crearConversacion(supabase, sessionId, ipHash)
    }

    // 4. El historial se lee ANTES de guardar el mensaje actual (que se añade aparte al final)
    const historial = await obtenerHistorial(supabase, conversacion.id, CHATBOT.historialMaxMensajes)
    // Se guarda antes de llamar al modelo: cuenta para los límites aunque OpenAI falle.
    await guardarMensajeUsuario(supabase, conversacion.id, mensaje.texto, ipHash)

    // 5. Bucle de function calling
    const { respuesta, herramientas } = await responderMensaje({
      openai,
      supabase,
      historial,
      mensajeUsuario: mensaje.texto,
    })

    await guardarMensajeAsistente(supabase, conversacion.id, respuesta, herramientas)

    return NextResponse.json({ respuesta })
  } catch (error) {
    console.error('Error en POST /api/chat:', error)
    return respuestaError(MENSAJE_NO_DISPONIBLE, 'chat_error', 502)
  }
}
