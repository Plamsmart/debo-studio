'use client'

import { useCallback, useState } from 'react'
import { CONTACTO_ESTUDIO } from '@/lib/chatbot/conocimiento'

export type ChatMessage = {
  id: string
  rol: 'user' | 'assistant'
  contenido: string
  // Errores del backend (límites, fallos técnicos) o de red: se muestran como
  // un mensaje más del bot (mismo contrato que /api/chat), solo que con un
  // acento visual distinto en la burbuja.
  esError?: boolean
}

const CLAVE_SESSION_ID = 'debo-chat-session-id'

function generarId(): string {
  return crypto.randomUUID()
}

// El session_id se guarda en localStorage (no en memoria, como en
// zorion-chat): si la clienta recarga la página o vuelve más tarde en la
// misma pestaña, retoma la misma conversación en vez de empezar de cero.
function obtenerSessionId(): string {
  if (typeof window === 'undefined') return generarId() // SSR: se descarta, nunca se pinta
  try {
    const guardado = window.localStorage.getItem(CLAVE_SESSION_ID)
    if (guardado) return guardado
    const nuevo = generarId()
    window.localStorage.setItem(CLAVE_SESSION_ID, nuevo)
    return nuevo
  } catch {
    // Almacenamiento bloqueado (navegación privada, cookies desactivadas...):
    // el chat sigue funcionando, solo que no sobrevive a un recargo.
    return generarId()
  }
}

const MENSAJE_ERROR_GENERICO =
  `No he podido enviar tu mensaje. Puedes intentarlo de nuevo o escribirnos directamente: ` +
  `${CONTACTO_ESTUDIO.telefono} · ${CONTACTO_ESTUDIO.email}.`

export function useChatSession() {
  const [sessionId] = useState(obtenerSessionId)
  const [mensajes, setMensajes] = useState<ChatMessage[]>([])
  const [cargando, setCargando] = useState(false)

  const enviarMensaje = useCallback(
    async (contenido: string) => {
      const texto = contenido.trim()
      if (!texto || cargando) return

      setMensajes((prev) => [...prev, { id: generarId(), rol: 'user', contenido: texto }])
      setCargando(true)

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mensaje: texto, session_id: sessionId }),
        })
        const datos = await res.json().catch(() => null)

        if (res.ok && typeof datos?.respuesta === 'string') {
          setMensajes((prev) => [...prev, { id: generarId(), rol: 'assistant', contenido: datos.respuesta }])
          return
        }

        // Límites (rate_limit, limite_mensajes, limite_citas, limite_conversaciones...)
        // y errores del servidor ya vienen listos para mostrar tal cual (ver /api/chat).
        const mensajeError = typeof datos?.error === 'string' ? datos.error : MENSAJE_ERROR_GENERICO
        setMensajes((prev) => [...prev, { id: generarId(), rol: 'assistant', contenido: mensajeError, esError: true }])
      } catch (error) {
        console.error('Error enviando mensaje al chat:', error)
        setMensajes((prev) => [...prev, { id: generarId(), rol: 'assistant', contenido: MENSAJE_ERROR_GENERICO, esError: true }])
      } finally {
        setCargando(false)
      }
    },
    [sessionId, cargando]
  )

  return { mensajes, cargando, enviarMensaje }
}
