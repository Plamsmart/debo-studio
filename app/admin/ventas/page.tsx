import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolverFiltrosVentas } from '@/lib/ventas'
import PanelVentas from '@/components/PanelVentas'
import InformeVentas, { type DatosVentas } from '@/components/InformeVentas'
import '@/components/PanelVentas.css'

export default async function AdminVentasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: usuarioAdmin } = await supabase
    .from('usuarios_admin')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()

  // Solo Débora (rol 'admin'). Las RPC lo vuelven a exigir dentro del SQL.
  if (usuarioAdmin?.rol !== 'admin') {
    redirect('/admin/citas')
  }

  const filtros = resolverFiltrosVentas(await searchParams)

  // Con la sesión de la usuaria (no service_role: no tiene EXECUTE sobre estas RPC).
  const [ingresos, ranking, metodos, comparativa] = await Promise.all([
    supabase.rpc('ventas_ingresos_por_periodo', {
      p_desde: filtros.desde,
      p_hasta: filtros.hasta,
      p_agrupacion: filtros.agrupacion,
    }),
    supabase.rpc('ventas_ranking_servicios', { p_desde: filtros.desde, p_hasta: filtros.hasta }),
    supabase.rpc('ventas_por_metodo', { p_desde: filtros.desde, p_hasta: filtros.hasta }),
    supabase.rpc('ventas_comparativa', {
      p_desde: filtros.desde,
      p_hasta: filtros.hasta,
      p_anterior_desde: filtros.anteriorDesde,
      p_anterior_hasta: filtros.anteriorHasta,
    }),
  ])

  const errores = [ingresos.error, ranking.error, metodos.error, comparativa.error].filter(Boolean)
  const resumen = comparativa.data?.[0]

  let datos: DatosVentas | null = null
  if (errores.length > 0 || !resumen) {
    console.error('Error cargando el informe de ventas:', { filtros, errores })
  } else {
    datos = {
      ingresos: ingresos.data ?? [],
      ranking: ranking.data ?? [],
      metodos: metodos.data ?? [],
      resumen,
    }
  }

  return (
    <div className="panel-ventas">
      <h1>Ventas</h1>
      <p className="panel-ventas__nota">
        Importes cobrados en bruto, solo pagos confirmados. No incluye reembolsos ni sustituye a la
        contabilidad. La fecha de cada pago es la de creación.
      </p>
      {/* key: si cambia la URL (p. ej. atrás/adelante), el selector se reinicia con los filtros reales */}
      <PanelVentas
        key={`${filtros.periodo}|${filtros.desde}|${filtros.hasta}|${filtros.agrupacion}`}
        filtros={filtros}
      >
        {datos ? (
          <InformeVentas datos={datos} agrupacion={filtros.agrupacion} />
        ) : (
          <p className="panel-ventas__error" role="alert">
            No se pudieron cargar las ventas. Inténtalo de nuevo en unos minutos.
          </p>
        )}
      </PanelVentas>
    </div>
  )
}
