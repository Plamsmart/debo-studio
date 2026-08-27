import Link from 'next/link'

type ServiciosProps = {
  categoriasAMostrar: string[]
  descripciones: Record<string, string>
  precioMinPorCategoria: Map<string, number>
}

export default function Servicios({
  categoriasAMostrar,
  descripciones,
  precioMinPorCategoria,
}: ServiciosProps) {
  return (
    <section className="servicios" id="servicios">
      <span className="seccion__eyebrow">Nuestros tratamientos</span>
      <h2 className="seccion__titulo">Servicios</h2>

      <div className="servicios__grid">
        {categoriasAMostrar.map((categoria) => (
          <div key={categoria} className="servicio-card">
            <h3 className="servicio-card__titulo">{categoria}</h3>
            <p className="servicio-card__descripcion">{descripciones[categoria]}</p>
            <span className="servicio-card__precio">
              Desde{' '}
              {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(
                precioMinPorCategoria.get(categoria) ?? 0
              )}
            </span>
          </div>
        ))}
      </div>

      <Link href="/reservar" className="btn btn--dorado servicios__cta">
        Ver todos los servicios
      </Link>
    </section>
  )
}
