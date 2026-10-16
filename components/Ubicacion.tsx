import MapaUbicacion from './MapaUbicacion'

export default function Ubicacion() {
  return (
    <section className="ubicacion" id="ubicacion">
      <div className="ubicacion__info">
        <span className="seccion__eyebrow">Visítanos</span>
        <h2 className="seccion__titulo">Ubicación y horario</h2>
        <p className="ubicacion__direccion">Eihera Plaza, 15, Bajo A, 20305 Irun, Gipuzkoa</p>
        <p className="ubicacion__contacto">
          <a href="tel:+34695393874">695 39 38 74</a> ·{' '}
          <a href="mailto:estudiodeborapereira@gmail.com">estudiodeborapereira@gmail.com</a>
        </p>
        <a
          href="https://instagram.com/deborapereirastudio"
          target="_blank"
          rel="noopener noreferrer"
          className="ubicacion__instagram"
        >
          @deborapereirastudio
        </a>

        <table className="ubicacion__horario">
          <tbody>
            <tr>
              <td>Lunes – Miércoles</td>
              <td>9:30 – 18:30</td>
            </tr>
            <tr>
              <td>Jueves – Viernes</td>
              <td>9:30 – 16:00</td>
            </tr>
            <tr>
              <td>Sábado – Domingo</td>
              <td>Cerrado</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="ubicacion__mapa">
        <MapaUbicacion />
      </div>
    </section>
  )
}
