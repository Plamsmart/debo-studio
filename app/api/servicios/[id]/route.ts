import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { TablesUpdate } from '@/lib/supabase/database.types'

// PATCH /api/servicios/[id]
// Actualiza cualquier combinación de campos del servicio. Protegido por la
// policy RLS `servicios_update_admin`.
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

  const body = await request.json()
  const { nombre, descripcion, categoria, duracion_minutos, precio, activo } = body

  // Solo incluimos en el update los campos que realmente vinieron en el body
  const cambios: TablesUpdate<'servicios'> = {}
  if (nombre !== undefined) cambios.nombre = nombre.trim()
  if (descripcion !== undefined) cambios.descripcion = descripcion?.trim() || null
  if (categoria !== undefined) cambios.categoria = categoria?.trim() || null
  if (duracion_minutos !== undefined) cambios.duracion_minutos = duracion_minutos
  if (precio !== undefined) cambios.precio = precio
  if (activo !== undefined) cambios.activo = activo

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'No hay cambios para aplicar' }, { status: 400 })
  }

  const { data: servicioActualizado, error } = await supabase
    .from('servicios')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()

  if (error || !servicioActualizado) {
    return NextResponse.json(
      { error: 'No se pudo actualizar el servicio (verifica permisos de administrador)' },
      { status: 403 }
    )
  }

  return NextResponse.json({ servicio: servicioActualizado })
}
