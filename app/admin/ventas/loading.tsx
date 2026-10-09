import '@/components/PanelVentas.css'

// Primera carga de /admin/ventas (al entrar desde el menú). Los cambios de
// periodo dentro de la página se indican en PanelVentas.
export default function CargandoVentas() {
  return (
    <div className="panel-ventas" aria-busy="true">
      <h1>Ventas</h1>
      <p className="panel-ventas__nota">Cargando ventas…</p>
      <div className="panel-ventas__esqueleto" />
      <div className="panel-ventas__esqueleto" />
      <div className="panel-ventas__esqueleto" style={{ height: '12rem' }} />
    </div>
  )
}
