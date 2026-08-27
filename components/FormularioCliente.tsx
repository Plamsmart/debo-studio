'use client'

import { useState } from 'react'

export type DatosCliente = {
  nombre: string
  email: string
  telefono: string
}

type Props = {
  onConfirmar: (datos: DatosCliente) => void
  enviando: boolean
}

export default function FormularioCliente({ onConfirmar, enviando }: Props) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [error, setError] = useState<string | null>(null)

  function manejarSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!nombre.trim()) {
      setError('Por favor, escribe tu nombre.')
      return
    }
    if (!email.trim() && !telefono.trim()) {
      setError('Déjanos al menos un email o un teléfono para confirmarte la cita.')
      return
    }

    onConfirmar({ nombre: nombre.trim(), email: email.trim(), telefono: telefono.trim() })
  }

  return (
    <form className="formulario-cliente" onSubmit={manejarSubmit}>
      <label className="formulario-cliente__label" htmlFor="nombre">
        Nombre
      </label>
      <input
        id="nombre"
        type="text"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="formulario-cliente__input"
        placeholder="Tu nombre completo"
      />

      <label className="formulario-cliente__label" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="formulario-cliente__input"
        placeholder="tu@email.com"
      />

      <label className="formulario-cliente__label" htmlFor="telefono">
        Teléfono
      </label>
      <input
        id="telefono"
        type="tel"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        className="formulario-cliente__input"
        placeholder="Tu número de contacto"
      />

      {error && <p className="formulario-cliente__error">{error}</p>}

      <button type="submit" disabled={enviando} className="formulario-cliente__btn">
        {enviando ? 'Enviando solicitud…' : 'Solicitar cita'}
      </button>
    </form>
  )
}
