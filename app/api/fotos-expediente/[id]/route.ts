import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { BUCKET_EXPEDIENTES, verificarEquipo } from '@/lib/expediente'

// DELETE /api/fotos-expediente/[id]
// Borra la fila y el archivo del bucket. Primero la fila: si falla el borrado
// del archivo queda un huérfano invisible, nunca una foto rota en la ficha.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await verificarEquipo()
  if ('respuesta' in auth) return auth.respuesta

  const { data: foto, error } = await auth.supabase
    .from('fotos_expediente')
    .delete()
    .eq('id', id)
    .select('ruta')
    .maybeSingle()

  if (error) {
    console.error('Error eliminando foto de expediente:', error)
    return NextResponse.json({ error: 'No se pudo eliminar la foto' }, { status: 500 })
  }

  if (!foto) {
    return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
  }

  const { error: errorStorage } = await createServiceClient()
    .storage.from(BUCKET_EXPEDIENTES)
    .remove([foto.ruta])

  if (errorStorage) {
    console.error('Error borrando archivo de foto de expediente:', foto.ruta, errorStorage)
  }

  return NextResponse.json({ ok: true })
}
