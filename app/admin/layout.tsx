import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import './admin.css'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: esAdmin } = await supabase
    .from('usuarios_admin')
    .select('id, nombre')
    .eq('id', user.id)
    .maybeSingle()

  if (!esAdmin) {
    return (
      <main style={{ padding: '2rem' }}>
        <h1>Acceso restringido</h1>
        <p>Esta sección es solo para el equipo del estudio.</p>
      </main>
    )
  }

  return (
    <div className="admin-layout">
      <nav className="admin-layout__nav">
        <span className="admin-layout__marca">Estudio Débora Pereira</span>
        <div className="admin-layout__links">
          <Link href="/admin/citas" className="admin-layout__link">
            Citas
          </Link>
          <Link href="/admin/servicios" className="admin-layout__link">
            Servicios
          </Link>
        </div>
        <span className="admin-layout__usuario">{esAdmin.nombre}</span>
      </nav>
      <div className="admin-layout__contenido">{children}</div>
    </div>
  )
}
