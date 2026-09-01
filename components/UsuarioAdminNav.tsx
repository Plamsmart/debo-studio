'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Props = {
  nombre: string
}

export default function UsuarioAdminNav({ nombre }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [cerrandoSesion, setCerrandoSesion] = useState(false)

  async function cerrarSesion() {
    setCerrandoSesion(true)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="admin-layout__usuario-wrap">
      <span className="admin-layout__usuario">{nombre}</span>
      <button
        type="button"
        onClick={cerrarSesion}
        disabled={cerrandoSesion}
        className="admin-layout__cerrar-sesion"
      >
        {cerrandoSesion ? 'Saliendo…' : 'Cerrar sesión'}
      </button>
    </div>
  )
}
