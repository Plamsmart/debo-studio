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

// POST /api/servicios
// Solo usuarios admin pueden crear servicios (la policy RLS `servicios_insert_admin`
// ya lo garantiza: si el usuario no es admin, el insert simplemente falla). Igual
// verificamos el rol explícitamente antes, como defensa en profundidad y para dar
// un mensaje de error más claro que el genérico de la policy.
export async function POST(request: NextRequest) {
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
      { error: 'Solo la administradora puede modificar el catálogo de servicios' },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { nombre, descripcion, categoria, duracion_minutos, precio, activo } = body

  if (!nombre?.trim() || duracion_minutos == null || precio == null) {
    return NextResponse.json(
      { error: 'Faltan datos requeridos (nombre, duración, precio)' },
      { status: 400 }
    )
  }

  const duracion = Number(duracion_minutos)
  if (!Number.isInteger(duracion) || duracion < 1) {
    return NextResponse.json(
      { error: 'La duración debe ser un número entero de minutos (mínimo 1)' },
      { status: 400 }
    )
  }

  const precioNumero = Number(precio)
  if (!Number.isFinite(precioNumero) || precioNumero < 0) {
    return NextResponse.json(
      { error: 'El precio debe ser un número igual o mayor que 0' },
      { status: 400 }
    )
  }

  const { data: nuevoServicio, error } = await supabase
    .from('servicios')
    .insert({
      nombre: nombre.trim(),
      descripcion: descripcion?.trim() || null,
      categoria: categoria?.trim() || null,
      duracion_minutos: duracion,
      precio: precioNumero,
      activo: activo ?? true,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creando el servicio:', error)
    return NextResponse.json(
      { error: 'No se pudo crear el servicio (verifica permisos de administrador)' },
      { status: 403 }
    )
  }

  return NextResponse.json({ servicio: nuevoServicio }, { status: 201 })
}
