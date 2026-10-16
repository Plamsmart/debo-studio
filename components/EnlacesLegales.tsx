import Link from 'next/link'
import './EnlacesLegales.css'

// Enlaces a las páginas legales: van en el pie de TODAS las páginas públicas
// (dentro de <Footer /> en la home y las legales, y en <PieLegal /> en el resto).
export default function EnlacesLegales() {
  return (
    <nav className="enlaces-legales" aria-label="Información legal">
      <Link href="/aviso-legal">Aviso legal</Link>
      <Link href="/privacidad">Política de privacidad</Link>
      <Link href="/cookies">Política de cookies</Link>
    </nav>
  )
}
