import { Cormorant_Garamond, Jost } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import Hero from '@/components/Hero'
import Filosofia from '@/components/Filosofia'
import Servicios from '@/components/Servicios'
import Diferenciales from '@/components/Diferenciales'
import Ubicacion from '@/components/Ubicacion'
import CtaFinal from '@/components/CtaFinal'
import Footer from '@/components/Footer'
import './home.css'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-display',
})

const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
})

// Descripciones curadas para las categorías destacadas en la portada.
// (El catálogo completo vive en /reservar)
const CATEGORIAS_DESTACADAS: Record<string, string> = {
  'Tratamientos faciales': 'Limpiezas, rituales antiedad y tratamientos personalizados para tu piel.',
  'Micropigmentación y microblading': 'Cejas, ojos y labios con resultados naturales y duraderos.',
  Rituales: 'Experiencias completas de rostro y cuerpo para desconectar de verdad.',
  'Diseño de la mirada': 'Cejas, pestañas y laminado para realzar tu mirada.',
  'Tratamientos corporales': 'Masajes y tratamientos pensados para tu bienestar.',
  Manicura: 'Cuidado de manos con acabados clásicos y semipermanentes.',
}

export default async function InicioPage() {
  const supabase = await createClient()

  const { data: servicios } = await supabase
    .from('servicios')
    .select('categoria, precio')
    .eq('activo', true)

  const precioMinPorCategoria = new Map<string, number>()
  for (const s of servicios ?? []) {
    if (!s.categoria) continue
    const actual = precioMinPorCategoria.get(s.categoria)
    if (actual === undefined || s.precio < actual) {
      precioMinPorCategoria.set(s.categoria, s.precio)
    }
  }

  const categoriasAMostrar = Object.keys(CATEGORIAS_DESTACADAS).filter((c) =>
    precioMinPorCategoria.has(c)
  )

  return (
    <div className={`${cormorant.variable} ${jost.variable} pagina-inicio`}>
      {/* ===== HEADER ===== */}
      <Header />

      {/* ===== ZONA OSCURA: HERO + FILOSOFÍA ===== */}
      <div id="zona-oscura" className="zona-oscura">
        <Hero />
        <Filosofia />
      </div>
      {/* ===== FIN ZONA OSCURA ===== */}

      {/* ===== SERVICIOS DESTACADOS ===== */}
      <Servicios
        categoriasAMostrar={categoriasAMostrar}
        descripciones={CATEGORIAS_DESTACADAS}
        precioMinPorCategoria={precioMinPorCategoria}
      />

      {/* ===== POR QUÉ ELEGIRNOS ===== */}
      <Diferenciales />

      {/* ===== UBICACIÓN Y HORARIO ===== */}
      <Ubicacion />

      {/* ===== CTA FINAL ===== */}
      <CtaFinal />

      {/* ===== FOOTER ===== */}
      <Footer />
    </div>
  )
}
