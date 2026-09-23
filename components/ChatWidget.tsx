'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useChatSession } from './useChatSession'
import './ChatWidget.css'

// Adaptado del esqueleto de zorion-chat (abrir/cerrar, lista de mensajes,
// "escribiendo…", enlaces y negritas) pero de un solo tenant, sin iframe: se
// monta directo en el layout público, sin widget.js/postMessage/CORS.

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// El texto se escapa ANTES de insertar ninguna etiqueta: nada que escriba la
// clienta (o el propio modelo) puede inyectar HTML por aquí.
function formatearTexto(texto: string): string {
  const escapado = escaparHtml(texto)
  const conEnlaces = escapado.replace(
    /(https?:\/\/[^\s<]*[^\s<.,)\]!])/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  )
  return conEnlaces.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

export default function ChatWidget() {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const { mensajes, cargando, enviarMensaje } = useChatSession()
  const mensajesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    mensajesRef.current?.scrollTo({ top: mensajesRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes, cargando])

  useEffect(() => {
    if (abierto) inputRef.current?.focus()
  }, [abierto])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!texto.trim() || cargando) return
    enviarMensaje(texto)
    setTexto('')
  }

  return (
    <div className="chat-widget">
      {abierto && (
        <div className="chat-widget__panel" role="dialog" aria-label="Chat con Estudio Débora Pereira">
          <header className="chat-widget__header">
            <span className="chat-widget__titulo">Asistente virtual</span>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar chat" className="chat-widget__cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <div ref={mensajesRef} className="chat-widget__mensajes">
            {mensajes.length === 0 && (
              <p className="chat-widget__bienvenida">
                ¡Hola! Soy el asistente virtual del estudio. Puedo ayudarte a consultar disponibilidad y dejar una
                solicitud de cita. ¿En qué puedo ayudarte?
              </p>
            )}
            {mensajes.map((m) => (
              <div key={m.id} className={`chat-widget__fila chat-widget__fila--${m.rol}`}>
                <div
                  className={`chat-widget__burbuja chat-widget__burbuja--${m.rol}${m.esError ? ' chat-widget__burbuja--error' : ''}`}
                  dangerouslySetInnerHTML={{ __html: formatearTexto(m.contenido) }}
                />
              </div>
            ))}
            {cargando && (
              <div className="chat-widget__fila chat-widget__fila--assistant">
                <div className="chat-widget__burbuja chat-widget__burbuja--assistant chat-widget__escribiendo" aria-label="Escribiendo…">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="chat-widget__form">
            <input
              ref={inputRef}
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe tu mensaje…"
              maxLength={500}
              className="chat-widget__input"
              aria-label="Mensaje"
            />
            <button type="submit" disabled={!texto.trim() || cargando} aria-label="Enviar mensaje" className="chat-widget__enviar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
              </svg>
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? 'Cerrar chat' : 'Abrir chat'}
        className="chat-widget__toggle"
      >
        {abierto ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H9l-5 4v-4H4a2 2 0 01-2-2V6a2 2 0 012-2z" />
          </svg>
        )}
      </button>
    </div>
  )
}
