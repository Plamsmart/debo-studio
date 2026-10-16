import EnlacesLegales from './EnlacesLegales'

// Pie mínimo para las páginas públicas que no usan el <Footer /> completo de la home.
export default function PieLegal() {
  return (
    <footer className="pie-legal">
      <EnlacesLegales />
      <p className="pie-legal__copy">© {new Date().getFullYear()} Estudio Débora Pereira</p>
    </footer>
  )
}
