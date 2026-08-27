import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function obtenerRol(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('usuarios_admin')
    .select('rol')
    .eq('id', userId)
    .maybeSingle()
  return data?.rol ?? null
}

// PATCH /api/clientes/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const rol = await obtenerRol(supabase, user.id)
  const esAdmin = rol === 'admin'

  const body = await request.json()
  const { nombre, email, telefono, notas } = body

  const cambios: Record<string, unknown> = {}
  if (nombre !== undefined) cambios.nombre = nombre.trim()
  if (email !== undefined) cambios.email = email?.trim() || null
  if (telefono !== undefined) cambios.telefono = telefono?.trim() || null

  // Las notas son solo para el rol admin — aunque alguien intente forzar
  // el campo en la petición, el servidor lo ignora si no es admin.
  if (notas !== undefined) {
    if (!esAdmin) {
      return NextResponse.json(
        { error: 'Solo la administradora puede editar las notas de clientes' },
        { status: 403 }
      )
    }
    cambios.notas = notas?.trim() || null
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'No hay cambios para aplicar' }, { status: 400 })
  }

  const { data: clienteActualizado, error } = await supabase
    .from('clientes')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()

  if (error || !clienteActualizado) {
    return NextResponse.json(
      { error: 'No se pudo actualizar el cliente (verifica permisos de administrador)' },
      { status: 403 }
    )
  }

  return NextResponse.json({ cliente: clienteActualizado })
}

// DELETE /api/clientes/[id]
// Verificamos el rol explícitamente ANTES de intentar borrar (mejor mensaje
// de error), aunque la policy RLS `clientes_delete_solo_admin` es la
// protección real de fondo — esto es defensa en profundidad, no confiamos
// solo en el chequeo de la app.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const rol = await obtenerRol(supabase, user.id)
  if (rol !== 'admin') {
    return NextResponse.json(
      { error: 'Solo la administradora puede eliminar clientes' },
      { status: 403 }
    )
  }

  const { error } = await supabase.from('clientes').delete().eq('id', id)

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        {
          error:
            'No se puede eliminar: este cliente tiene citas registradas en su historial. Elimina primero sus citas si de verdad quieres borrarlo.',
        },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'No se pudo eliminar el cliente' }, { status: 403 })
  }

  return NextResponse.json({ ok: true })
}
