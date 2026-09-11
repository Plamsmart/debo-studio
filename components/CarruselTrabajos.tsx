'use client'

import { useEffect, useState } from 'react'

type FotoTrabajo = {
  id: string
  url: string
  servicioNombre: string
}

type Props = {
  fotos: FotoTrabajo[]
}

const INTERVALO_MS = 4500
const DURACION_FADE_MS = 250

export default function CarruselTrabajos({ fotos }: Props) {
  const [itemsVisibles, setItemsVisibles] = useState(3)
  const [indiceInicial, setIndiceInicial] = useState(0)
  const [enTransicion, setEnTransicion] = useState(false)
  const [pausado, setPausado] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const actualizar = () => setItemsVisibles(media.matches ? 1 : 3)
    actualizar()
    media.addEventListener('change', actualizar)
    return () => media.removeEventListener('change', actualizar)
  }, [])

  function irA(indice: number) {
    setEnTransicion(true)
    setTimeout(() => {
      setIndiceInicial(((indice % fotos.length) + fotos.length) % fotos.length)
      setEnTransicion(false)
    }, DURACION_FADE_MS)
  }

  useEffect(() => {
    if (pausado || fotos.length <= itemsVisibles) return
    const id = setInterval(() => irA(indiceInicial + 1), INTERVALO_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausado, itemsVisibles, fotos.length, indiceInicial])

  if (fotos.length === 0) return null

  const hayNavegacion = fotos.length > itemsVisibles
  const visibles = Array.from(
    { length: Math.min(itemsVisibles, fotos.length) },
    (_, i) => fotos[(indiceInicial + i) % fotos.length]
  )

  return (
    <section
      className="carrusel-trabajos"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      <span className="seccion__eyebrow">Nuestro trabajo</span>
      <h2 className="seccion__titulo">Trabajos realizados</h2>

      <div className="carrusel-trabajos__contenedor">
        {hayNavegacion && (
          <button
            type="button"
            className="carrusel-trabajos__flecha carrusel-trabajos__flecha--izq"
            onClick={() => irA(indiceInicial - 1)}
            aria-label="Foto anterior"
          >
            ‹
          </button>
        )}

        <div
          className={`carrusel-trabajos__fila ${
            enTransicion ? 'carrusel-trabajos__fila--transicion' : ''
          }`}
        >
          {visibles.map((foto) => (
            <figure key={foto.id} className="carrusel-trabajos__item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.url} alt={foto.servicioNombre} className="carrusel-trabajos__imagen" />
              <figcaption className="carrusel-trabajos__caption">{foto.servicioNombre}</figcaption>
            </figure>
          ))}
        </div>

        {hayNavegacion && (
          <button
            type="button"
            className="carrusel-trabajos__flecha carrusel-trabajos__flecha--der"
            onClick={() => irA(indiceInicial + 1)}
            aria-label="Foto siguiente"
          >
            ›
          </button>
        )}
      </div>

      {hayNavegacion && (
        <div className="carrusel-trabajos__dots">
          {fotos.map((foto, i) => (
            <button
              key={foto.id}
              type="button"
              className={`carrusel-trabajos__dot ${
                i === indiceInicial ? 'carrusel-trabajos__dot--activo' : ''
              }`}
              onClick={() => irA(i)}
              aria-label={`Ir a la foto ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
