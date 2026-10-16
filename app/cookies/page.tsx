import type { Metadata } from 'next'
import PaginaLegal from '@/components/PaginaLegal'
import { paginaLegal, URL_SITIO } from '@/lib/legal'

export const metadata: Metadata = {
  title: `${paginaLegal('cookies').titulo} | Estudio Débora Pereira`,
  description:
    'Qué cookies y almacenamiento local usa la web de Estudio Débora Pereira: sin analítica ni publicidad, y el mapa de Google solo se carga si pulsas «Mostrar mapa».',
  alternates: { canonical: `${URL_SITIO}/cookies` },
}

export default function CookiesPage() {
  return <PaginaLegal pagina="cookies" />
}
