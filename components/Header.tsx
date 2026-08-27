'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import NavMovil from './NavMovil'

export default function Header() {
  // Por defecto asumimos "sólido" (seguro para páginas sin zona oscura,
  // como /reservar). En la portada, el efecto de abajo lo corrige apenas monta.
  const [solido, setSolido] = useState(true)

  useEffect(() => {
    const zonaOscura = document.getElementById('zona-oscura')

    // Si esta página no tiene zona oscura (ej. /reservar), el header
    // se queda sólido siempre — no hay nada de qué "despegarse".
    if (!zonaOscura) return

    function evaluar() {
      const alturaZona = zonaOscura!.offsetHeight
      const alturaHeader = 90 // aprox., suficiente margen para el cambio
      setSolido(window.scrollY >= alturaZona - alturaHeader)
    }

    evaluar()
    window.addEventListener('scroll', evaluar, { passive: true })
    window.addEventListener('resize', evaluar)
    return () => {
      window.removeEventListener('scroll', evaluar)
      window.removeEventListener('resize', evaluar)
    }
  }, [])

  return (
    <header className={`header ${solido ? 'header--solido' : ''}`}>
      <div className="header__marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/emblema.png" alt="Estudio Débora Pereira" />
        <span className="header__nombre">Débora Pereira Studio</span>
      </div>
      <nav className="header__nav">
        <a href="#servicios">Servicios</a>
        <a href="#nosotras">Sobre nosotros</a>
        <a href="#ubicacion">Ubicación</a>
      </nav>
      <Link href="/reservar" className="header__cta">
        Reservar cita
      </Link>
      <NavMovil claro={!solido} />
    </header>
  )
}
