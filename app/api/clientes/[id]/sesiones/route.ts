import { NextRequest, NextResponse } from 'next/server'
import { obtenerSesionesConFotos, verificarEquipo } from '@/lib/expediente'

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/

function textoOpcional(valor: unknown): string | null {
  return typeof valor === 'string' ? valor.trim() || null : null
}

// GET /api/clientes/[id]/sesiones
// Sesiones del cliente, más reciente primero, cada una con sus fotos firmadas.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await verificarEquipo()
  if ('respuesta' in auth) return auth.respuesta

  const { sesiones, error } = await obtenerSesionesConFotos(auth.supabase, id)

  if (error || !sesiones) {
    console.error('Error leyendo sesiones de expediente:', error)
    return NextResponse.json({ error: 'No se pudieron cargar las sesiones' }, { status: 500 })
  }

  return NextResponse.json({ sesiones })
}

// POST /api/clientes/[id]/sesiones
// Registra una sesión nueva. No depende de `citas`: puede ser una visita que
// no pasó por la reserva online.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await verificarEquipo()
  if ('respuesta' in auth) return auth.respuesta

  const body = await request.json()

  if (typeof body.fecha !== 'string' || !FORMATO_FECHA.test(body.fecha)) {
    return NextResponse.json({ error: 'La fecha de la sesión es obligatoria' }, { status: 400 })
  }

  const { data: sesion, error } = await auth.supabase
    .from('sesiones_expediente')
    .insert({
      cliente_id: id,
      fecha: body.fecha,
      tratamiento: textoOpcional(body.tratamiento),
      zona: textoOpcional(body.zona),
      producto: textoOpcional(body.producto),
      notas: textoOpcional(body.notas),
      creado_por: auth.userId,
    })
    .select('id, fecha, tratamiento, zona, producto, notas, creado_en')
    .single()

  if (error || !sesion) {
    console.error('Error creando sesión de expediente:', error)
    if (error?.code === '23503') {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }
    return NextResponse.json({ error: 'No se pudo crear la sesión' }, { status: 500 })
  }

  return NextResponse.json({ sesion: { ...sesion, fotos: [] } }, { status: 201 })
}
