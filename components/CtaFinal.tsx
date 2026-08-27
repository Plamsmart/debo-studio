import Link from 'next/link'

export default function CtaFinal() {
  return (
    <section className="cta-final">
      <h2>Reserva tu momento de cuidado</h2>
      <Link href="/reservar" className="btn btn--dorado">
        Reservar cita
      </Link>
    </section>
  )
}
