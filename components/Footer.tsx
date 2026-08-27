import Link from 'next/link'
import { IconInstagram, IconMail, IconPhone } from '@/components/IconosFooter'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__principal">
        <div className="footer__columna footer__columna--marca">
          <div className="footer__marca">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/emblema.png" alt="Estudio Débora Pereira" />
            <span>Débora Pereira Studio</span>
          </div>
          <p className="footer__tagline">
            Cuidamos tu imagen, potenciamos tu esencia.
          </p>
        </div>

        <div className="footer__columna">
          <h4 className="footer__titulo-columna">Navegación</h4>
          <a href="#servicios">Servicios</a>
          <a href="#nosotras">Sobre nosotros</a>
          <a href="#ubicacion">Ubicación</a>
          <Link href="/reservar">Reservar cita</Link>
        </div>

        <div className="footer__columna">
          <h4 className="footer__titulo-columna">Contacto</h4>
          <a
            href="https://instagram.com/deborapereirastudio"
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconInstagram />
            @deborapereirastudio
          </a>
          <a href="mailto:estudiodeborapereira@gmail.com">
            <IconMail />
            estudiodeborapereira@gmail.com
          </a>
          <a href="tel:+34695393874">
            <IconPhone />
            695 39 38 74
          </a>
        </div>
      </div>

      <div className="footer__linea" />

      <p className="footer__copy">© {new Date().getFullYear()} Estudio Débora Pereira</p>
    </footer>
  )
}
