import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

function formatearPrecio(precio: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(precio)
}

export default async function BonosPage() {
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('servicios')
    .select('nombre, descripcion, precio, categoria')
    .in('categoria', ['Bonos', 'Formaciones'])
    .eq('activo', true)
    .order('categoria', { ascending: true })
    .order('nombre', { ascending: true })

  const bonos = (items ?? []).filter((i) => i.categoria === 'Bonos')
  const formaciones = (items ?? []).filter((i) => i.categoria === 'Formaciones')

  return (
    <main style={{ padding: '2rem', fontFamily: 'Georgia, serif', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ color: '#3a2e26' }}>Bonos y formaciones</h1>
      <p style={{ color: '#8a7a6b', marginBottom: '2rem' }}>
        Estos servicios se contratan directamente con el estudio — contáctanos para más
        información o para activarlos.
      </p>

      <h2 style={{ color: '#3a2e26', fontSize: '1.2rem', marginBottom: '1rem' }}>
        Bonos (paquetes de sesiones)
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '2.5rem' }}>
        {bonos.map((bono, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.2rem',
              borderRadius: 12,
              background: '#faf6f0',
              border: '1px solid #f0e8dc',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: '#3a2e26' }}>{bono.nombre}</div>
              {bono.descripcion && (
                <div style={{ fontSize: '0.85rem', color: '#8a7a6b' }}>{bono.descripcion}</div>
              )}
            </div>
            <div style={{ fontWeight: 600, color: '#b08d57' }}>{formatearPrecio(bono.precio)}</div>
          </div>
        ))}
      </div>

      <h2 style={{ color: '#3a2e26', fontSize: '1.2rem', marginBottom: '1rem' }}>Formaciones</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        {formaciones.map((form, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.2rem',
              borderRadius: 12,
              background: '#faf6f0',
              border: '1px solid #f0e8dc',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: '#3a2e26' }}>{form.nombre}</div>
              {form.descripcion && (
                <div style={{ fontSize: '0.85rem', color: '#8a7a6b' }}>{form.descripcion}</div>
              )}
            </div>
            <div style={{ fontWeight: 600, color: '#b08d57' }}>{formatearPrecio(form.precio)}</div>
          </div>
        ))}
      </div>

      <p style={{ marginTop: '2rem' }}>
        <Link href="/reservar" style={{ color: '#b08d57' }}>
          ← Volver a reservar una cita
        </Link>
      </p>
    </main>
  )
}
