import { createClient } from '@/lib/supabase/server'
import { obtenerConfigCalendario, verificarConexionCalendario } from '@/lib/google-calendar'

const ESTILO_BOTON = {
  display: 'inline-block',
  marginTop: '0.8rem',
  padding: '0.7rem 1.3rem',
  borderRadius: 8,
  background: '#8f654d',
  color: '#fff',
  textDecoration: 'none',
  fontFamily: 'Montserrat, sans-serif',
} as const

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
  const estado = await verificarConexionCalendario(config)

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
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
        <h3 style={{ marginTop: 0, color: '#53565a' }}>Google Calendar</h3>

        {config && estado !== 'invalida' ? (
          <>
            <p style={{ color: '#6b8e5a', fontWeight: 600 }}>
              ✓ Conectado el{' '}
              {new Date(config.conectado_en ?? '').toLocaleDateString('es-ES')}
            </p>
            {estado === 'no_verificable' && (
              <p style={{ fontSize: '0.85rem', color: '#8a8d90' }}>
                No pudimos comprobar el estado de la conexión en este momento.
              </p>
            )}
            <p style={{ fontSize: '0.85rem', color: '#8a8d90' }}>
              Cada cita confirmada se agrega automáticamente a tu Google Calendar. Si se
              cancela, el evento también se elimina de ahí.
            </p>
          </>
        ) : config ? (
          <>
            <p style={{ color: '#b5564a', fontWeight: 600 }}>
              ⚠ La conexión con Google Calendar falló, reconecta para seguir sincronizando
              citas
            </p>
            <p style={{ fontSize: '0.85rem', color: '#8a8d90' }}>
              Mientras tanto, las citas confirmadas no se agregan a tu calendario. Las citas
              en sí siguen funcionando con normalidad.
            </p>
            <a href="/api/admin/google-calendar/conectar" style={ESTILO_BOTON}>
              Reconectar Google Calendar
            </a>
          </>
        ) : (
          <>
            <p style={{ color: '#8a8d90', fontSize: '0.9rem' }}>
              Conecta tu Google Calendar para que las citas confirmadas aparezcan
              automáticamente ahí.
            </p>
            <a href="/api/admin/google-calendar/conectar" style={ESTILO_BOTON}>
              Conectar Google Calendar
            </a>
          </>
        )}
      </div>
    </div>
  )
}
