import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionesConFotos } from '@/lib/expediente'
import PanelExpediente from '@/components/PanelExpediente'
import '@/components/PanelExpediente.css'

// Admin y staff acceden por igual (el layout de /admin ya exige estar en
// usuarios_admin). Página separada de /admin/clientes por contener datos de
// salud: solo se carga cuando alguien abre el expediente a propósito.
export default async function ExpedienteClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('id', id)
    .maybeSingle()

  if (!cliente) {
    return (
      <div>
        <Link href="/admin/clientes" className="expediente__volver">
          ← Volver a clientes
        </Link>
        <h1>Expediente</h1>
        <p>No se encontró el cliente.</p>
      </div>
    )
  }

  const [{ data: expediente, error: errorExpediente }, { sesiones, error: errorSesiones }] =
    await Promise.all([
      supabase.from('expedientes_clientes').select('*').eq('cliente_id', id).maybeSingle(),
      obtenerSesionesConFotos(supabase, id),
    ])

  if (errorExpediente || errorSesiones || !sesiones) {
    console.error('Error cargando expediente:', errorExpediente ?? errorSesiones)
    return (
      <div>
        <Link href="/admin/clientes" className="expediente__volver">
          ← Volver a clientes
        </Link>
        <h1>Expediente — {cliente.nombre}</h1>
        <p>Hubo un error al cargar el expediente.</p>
      </div>
    )
  }

  return (
    <div>
      <Link href="/admin/clientes" className="expediente__volver">
        ← Volver a clientes
      </Link>
      <h1>Expediente — {cliente.nombre}</h1>
      <PanelExpediente
        clienteId={cliente.id}
        expedienteInicial={expediente}
        sesionesIniciales={sesiones}
      />
    </div>
  )
}
