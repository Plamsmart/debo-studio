'use client'

import { useState } from 'react'
import Link from 'next/link'
import './MapaUbicacion.css'

const URL_MAPA_EMBEBIDO = 'https://www.google.com/maps?q=Eihera+Plaza+15+Irun+Gipuzkoa&output=embed'
const URL_GOOGLE_MAPS = 'https://www.google.com/maps/search/?api=1&query=Eihera+Plaza+15%2C+20305+Irun%2C+Gipuzkoa'

// Carga bajo demanda: hasta que la persona pulsa «Mostrar mapa» no hay
// ninguna petición a Google (ni iframe, ni cookies de terceros). Así lo
// promete contenido-legal/cookies.md — no cargar el iframe por defecto.
export default function MapaUbicacion() {
  const [mostrar, setMostrar] = useState(false)

  if (mostrar) {
    return (
      <iframe
        src={URL_MAPA_EMBEBIDO}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        referrerPolicy="no-referrer-when-downgrade"
        title="Ubicación de Estudio Débora Pereira en Irun"
      />
    )
  }

  return (
    <div className="ubicacion__mapa-marcador">
      <p className="ubicacion__mapa-texto">
        El mapa lo presta Google Maps. Al mostrarlo, Google puede usar sus propias cookies (
        <Link href="/cookies">Política de cookies</Link>).
      </p>
      <button type="button" className="btn btn--dorado" onClick={() => setMostrar(true)}>
        Mostrar mapa
      </button>
      <a href={URL_GOOGLE_MAPS} target="_blank" rel="noopener noreferrer" className="ubicacion__mapa-enlace">
        Abrir en Google Maps
      </a>
    </div>
  )
}
