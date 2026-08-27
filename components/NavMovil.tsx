'use client'

import { useState } from 'react'
import Link from 'next/link'

type Props = {
  claro?: boolean
}

export default function NavMovil({ claro = false }: Props) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="nav-movil">
      <button
        type="button"
        className={`nav-movil__toggle ${claro ? 'nav-movil__toggle--claro' : ''}`}
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={abierto}
      >
        <span />
        <span />
        <span />
      </button>

      {abierto && (
        <div className="nav-movil__panel">
          <Link href="#servicios" onClick={() => setAbierto(false)}>
            Servicios
          </Link>
          <Link href="#nosotras" onClick={() => setAbierto(false)}>
            Sobre nosotros
          </Link>
          <Link href="#ubicacion" onClick={() => setAbierto(false)}>
            Ubicación
          </Link>
          <Link href="/reservar" className="nav-movil__cta" onClick={() => setAbierto(false)}>
            Reservar cita
          </Link>
        </div>
      )}
    </div>
  )
}
