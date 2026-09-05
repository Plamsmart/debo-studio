import { createClient } from '@/lib/supabase/server'
import { obtenerConfigCalendario } from '@/lib/google-calendar'

export default async function IntegracionesPage({
  searchParams,
}: {
  searchParams: Promise<{ exito?: string; error?: string }>
}) {
  const { exito, error } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: usuarioAdmin } = await supabase
    .from('usuarios_admin')
    .select('rol')
    .eq('id', user?.id ?? '')
    .maybeSingle()

  if (usuarioAdmin?.rol !== 'admin') {
    return (
      <div>
        <h1>Integraciones</h1>
        <p>Esta sección es solo para la administradora.</p>
      </div>
    )
  }

  const config = await obtenerConfigCalendario()

  return (
    <div style={{ fontFamily: 'Georgia, serif' }}>
      <h1>Integraciones</h1>

      {exito && (
        <p style={{ color: '#6b8e5a', fontWeight: 600 }}>
          ¡Google Calendar conectado correctamente! ✓
        </p>
      )}
      {error && (
        <p style={{ color: '#b5564a', fontWeight: 600 }}>
          Hubo un problema al conectar. Inténtalo de nuevo.
        </p>
      )}

      <div
        style={{
          padding: '1.4rem',
          border: '1px solid #f0e8dc',
          borderRadius: 12,
          maxWidth: 420,
          marginTop: '1.5rem',
          background: '#faf6f0',
        }}
      >
        <h3 style={{ marginTop: 0, color: '#3a2e26' }}>Google Calendar</h3>

        {config ? (
          <>
            <p style={{ color: '#6b8e5a', fontWeight: 600 }}>
              ✓ Conectado el{' '}
              {new Date(config.conectado_en ?? '').toLocaleDateString('es-ES')}
            </p>
            <p style={{ fontSize: '0.85rem', color: '#8a7a6b' }}>
              Cada cita confirmada se agrega automáticamente a tu Google Calendar. Si se
              cancela, el evento también se elimina de ahí.
            </p>
          </>
        ) : (
          <>
            <p style={{ color: '#8a7a6b', fontSize: '0.9rem' }}>
              Conecta tu Google Calendar para que las citas confirmadas aparezcan
              automáticamente ahí.
            </p>
            <a
              href="/api/admin/google-calendar/conectar"
              style={{
                display: 'inline-block',
                marginTop: '0.8rem',
                padding: '0.7rem 1.3rem',
                borderRadius: 8,
                background: '#b08d57',
                color: '#fff',
                textDecoration: 'none',
                fontFamily: 'Georgia, serif',
              }}
            >
              Conectar Google Calendar
            </a>
          </>
        )}
      </div>
    </div>
  )
}
