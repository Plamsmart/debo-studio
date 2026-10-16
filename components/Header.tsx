'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import NavMovil from './NavMovil'

export default function Header() {
  // Transparente solo en la posición inicial (scrollY = 0); con cualquier
  // scroll pasa a sólido, igual en todas las secciones.
  const [solido, setSolido] = useState(false)

  useEffect(() => {
    function evaluar() {
      setSolido(window.scrollY > 0)
    }

    evaluar()
    window.addEventListener('scroll', evaluar, { passive: true })
    return () => window.removeEventListener('scroll', evaluar)
  }, [])

  return (
    <header className={`header ${solido ? 'header--solido' : ''}`}>
      {/* Enlace a la home: desde las páginas legales es la vía de vuelta. */}
      <Link href="/" className="header__marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-horizontal.png" alt="Estudio Débora Pereira" />
      </Link>
      <nav className="header__nav">
        <Link href="/#servicios">Servicios</Link>
        <Link href="/#nosotras">Sobre nosotros</Link>
        <Link href="/#ubicacion">Ubicación</Link>
      </nav>
      <Link href="/reservar" className="header__cta">
        Reservar cita
      </Link>
      <NavMovil />
    </header>
  )
}
