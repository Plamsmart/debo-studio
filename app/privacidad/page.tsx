import type { Metadata } from 'next'
import PaginaLegal from '@/components/PaginaLegal'
import { paginaLegal, URL_SITIO } from '@/lib/legal'

export const metadata: Metadata = {
  title: `${paginaLegal('privacidad').titulo} | Estudio Débora Pereira`,
  description:
    'Qué datos personales trata Estudio Débora Pereira (Irun) al pedir cita, usar el asistente virtual o pagar, con qué finalidad, a quién se comunican y cómo ejercer tus derechos.',
  alternates: { canonical: `${URL_SITIO}/privacidad` },
}

export default function PrivacidadPage() {
  return <PaginaLegal pagina="privacidad" />
}
