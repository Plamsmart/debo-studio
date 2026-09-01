import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import UsuarioAdminNav from '@/components/UsuarioAdminNav'
import '@/components/UsuarioAdminNav.css'
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
        <div className="admin-layout__marca">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/emblema.png" alt="Estudio Débora Pereira" />
          <span className="admin-layout__nombre">Estudio Débora Pereira</span>
        </div>
        <div className="admin-layout__links">
          <Link href="/admin/citas" className="admin-layout__link">
            Citas
          </Link>
          <Link href="/admin/servicios" className="admin-layout__link">
            Servicios
          </Link>
          <Link href="/admin/clientes" className="admin-layout__link">
            Clientes
          </Link>
          <Link href="/admin/cobrar" className="admin-layout__link">
            Cobrar
          </Link>
        </div>
        <UsuarioAdminNav nombre={esAdmin.nombre ?? 'Usuario'} />
      </nav>
      <div className="admin-layout__contenido">{children}</div>
    </div>
  )
}
