import type { Metadata } from 'next'
import PaginaLegal from '@/components/PaginaLegal'
import { paginaLegal, URL_SITIO } from '@/lib/legal'

export const metadata: Metadata = {
  title: `${paginaLegal('aviso-legal').titulo} | Estudio Débora Pereira`,
  description:
    'Datos de la titular de estudiodeborapereira.com y condiciones de uso de la web: solicitud de citas, pagos, asistente virtual, propiedad intelectual y legislación aplicable.',
  alternates: { canonical: `${URL_SITIO}/aviso-legal` },
}

export default function AvisoLegalPage() {
  return <PaginaLegal pagina="aviso-legal" />
}
