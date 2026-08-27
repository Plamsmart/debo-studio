import Link from 'next/link'

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero__inner">
        <div className="hero__contenido">
          <span className="hero__eyebrow">Micropigmentación y estética integral</span>
          <h1 className="hero__titulo">Cuidamos tu imagen, potenciamos tu esencia.</h1>
          <p className="hero__subtitulo">
            Tu confianza y bienestar son nuestra prioridad. Estética integral en el corazón de
            Irun.
          </p>
          <div className="hero__acciones">
            <Link href="/reservar" className="btn btn--dorado">
              Reservar cita
            </Link>
            <a href="#servicios" className="btn btn--outline">
              Ver servicios
            </a>
          </div>
        </div>
        <div className="hero__emblema" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/emblema.png" alt="" />
        </div>
      </div>
    </section>
  )
}
