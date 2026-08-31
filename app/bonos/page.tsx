import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function BonosPage() {
  const supabase = await createClient()

  const { data: bonos } = await supabase
    .from('servicios')
    .select('nombre, descripcion, precio')
    .eq('categoria', 'Bonos')
    .eq('activo', true)
    .order('nombre', { ascending: true })

  return (
    <main style={{ padding: '2rem', fontFamily: 'Georgia, serif', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ color: '#3a2e26' }}>Bonos y paquetes de sesiones</h1>
      <p style={{ color: '#8a7a6b', marginBottom: '2rem' }}>
        Estos paquetes se contratan directamente en el estudio — contáctanos para más
        información o para activarlos.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        {(bonos ?? []).map((bono, i) => (
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
            <div style={{ fontWeight: 600, color: '#b08d57' }}>
              {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(
                bono.precio
              )}
            </div>
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
