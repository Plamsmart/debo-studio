import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";

const BUCKET = "fotos-trabajos";

async function obtenerRol(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data } = await supabase
    .from("usuarios_admin")
    .select("rol")
    .eq("id", userId)
    .maybeSingle();
  return data?.rol ?? null;
}

// PATCH /api/fotos-trabajos/[id]
// Actualiza el orden y/o el servicio asociado de una foto. Solo admin.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rol = await obtenerRol(supabase, user.id);
  if (rol !== "admin") {
    return NextResponse.json(
      { error: "Solo la administradora puede gestionar las fotos de trabajos" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { orden, servicio_id } = body;

  const cambios: TablesUpdate<"fotos_trabajos"> = {};
  if (orden !== undefined) cambios.orden = orden;
  if (servicio_id !== undefined) cambios.servicio_id = servicio_id;

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "No hay cambios para aplicar" }, { status: 400 });
  }

  const supabaseService = createServiceClient();

  const { data: fotoActualizada, error } = await supabaseService
    .from("fotos_trabajos")
    .update(cambios)
    .eq("id", id)
    .select("*, servicios(id, nombre)")
    .single();

  if (error || !fotoActualizada) {
    console.error("Error actualizando fotos_trabajos:", error);
    return NextResponse.json({ error: "No se pudo actualizar la foto" }, { status: 500 });
  }

  return NextResponse.json({ foto: fotoActualizada });
}

// DELETE /api/fotos-trabajos/[id]
// Borra el registro y el archivo del bucket. Solo admin.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rol = await obtenerRol(supabase, user.id);
  if (rol !== "admin") {
    return NextResponse.json(
      { error: "Solo la administradora puede gestionar las fotos de trabajos" },
      { status: 403 },
    );
  }

  const supabaseService = createServiceClient();

  const { data: foto, error: errorFoto } = await supabaseService
    .from("fotos_trabajos")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  if (errorFoto) {
    console.error("Error buscando la foto a eliminar:", errorFoto);
    return NextResponse.json({ error: "No se pudo eliminar la foto" }, { status: 500 });
  }

  if (!foto) {
    return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
  }

  const { error: errorBorrado } = await supabaseService
    .from("fotos_trabajos")
    .delete()
    .eq("id", id);

  if (errorBorrado) {
    console.error("Error eliminando fotos_trabajos:", errorBorrado);
    return NextResponse.json({ error: "No se pudo eliminar la foto" }, { status: 500 });
  }

  const { error: errorRemove } = await supabaseService.storage
    .from(BUCKET)
    .remove([foto.storage_path]);

  if (errorRemove) {
    console.error("Error eliminando el archivo del bucket:", errorRemove);
  }

  return NextResponse.json({ ok: true });
}
