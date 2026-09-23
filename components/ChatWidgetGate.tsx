'use client'

import { usePathname } from 'next/navigation'
import ChatWidget from './ChatWidget'

// El widget vive en todo el sitio público (no solo /reservar), pero NO en el
// panel de administración: ahí Débora/staff tienen su propia navegación y no
// tiene sentido que sus clientas les hablen a través de esa pantalla.
export default function ChatWidgetGate() {
  const pathname = usePathname()
  if (pathname?.startsWith('/admin')) return null
  return <ChatWidget />
}
