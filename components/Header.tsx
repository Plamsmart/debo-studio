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
      <div className="header__marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-horizontal.png" alt="Estudio Débora Pereira" />
      </div>
      <nav className="header__nav">
        <a href="#servicios">Servicios</a>
        <a href="#nosotras">Sobre nosotros</a>
        <a href="#ubicacion">Ubicación</a>
      </nav>
      <Link href="/reservar" className="header__cta">
        Reservar cita
      </Link>
      <NavMovil />
    </header>
  )
}
