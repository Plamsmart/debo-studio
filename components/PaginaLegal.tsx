import Header from './Header'
import Footer from './Footer'
import { paginaLegal, type PaginaLegal as Pagina } from '@/lib/legal'
import '@/app/home.css'
import './PaginaLegal.css'

// Maqueta común de /privacidad, /aviso-legal y /cookies. El contenido sale tal
// cual del .md correspondiente (contenido-legal/): su "# título" es el único <h1>.
export default function PaginaLegal({ pagina }: { pagina: Pagina }) {
  const { html } = paginaLegal(pagina)

  return (
    <div className="pagina-inicio pagina-legal">
      <Header />
      <main className="pagina-legal__main">
        <article className="pagina-legal__contenido" dangerouslySetInnerHTML={{ __html: html }} />
      </main>
      <Footer />
    </div>
  )
}
