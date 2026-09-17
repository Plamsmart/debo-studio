import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";

const BUCKET = "fotos-trabajos";
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;
const EXTENSIONES_PERMITIDAS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

// PATCH /api/resenas/[id]
// Actualiza nombre, texto, calificación, orden y/o foto de una reseña.
// Los campos que no se envían no se tocan (se usa FormData siempre, tanto
// para ediciones de texto como para reordenar o subir/reemplazar la foto,
// esto último borra la foto anterior del bucket una vez confirmado el
// update). Solo admin.
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
      { error: "Solo la administradora puede gestionar las reseñas" },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const foto = formData.get("foto");

  let extension: string | null = null;
  if (foto instanceof File) {
    extension = EXTENSIONES_PERMITIDAS[foto.type];
    if (!extension) {
      return NextResponse.json(
        { error: "La foto debe ser JPG, PNG o WEBP" },
        { status: 400 },
      );
    }
    if (foto.size > TAMANO_MAXIMO_BYTES) {
      return NextResponse.json(
        { error: "La foto no puede superar 5MB" },
        { status: 400 },
      );
    }
  }

  const cambios: TablesUpdate<"resenas"> = {};

  if (formData.has("nombre_clienta")) {
    cambios.nombre_clienta = String(formData.get("nombre_clienta"));
  }
  if (formData.has("texto")) {
    cambios.texto = String(formData.get("texto"));
  }
  if (formData.has("calificacion")) {
    const calificacion = Number(formData.get("calificacion"));
    if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
      return NextResponse.json(
        { error: "La calificación debe ser un número entero entre 1 y 5" },
        { status: 400 },
      );
    }
    cambios.calificacion = calificacion;
  }
  if (formData.has("orden")) {
    const orden = Number(formData.get("orden"));
    if (!Number.isInteger(orden)) {
      return NextResponse.json({ error: "Orden inválido" }, { status: 400 });
    }
    cambios.orden = orden;
  }

  const supabaseService = createServiceClient();

  let fotoAnterior: string | null = null;
  let rutaFotoNueva: string | null = null;

  if (foto instanceof File && extension) {
    const { data: resenaActual, error: errorActual } = await supabaseService
      .from("resenas")
      .select("foto_url")
      .eq("id", id)
      .maybeSingle();

    if (errorActual) {
      console.error("Error buscando la reseña:", errorActual);
      return NextResponse.json({ error: "No se pudo actualizar la reseña" }, { status: 500 });
    }

    if (!resenaActual) {
      return NextResponse.json({ error: "Reseña no encontrada" }, { status: 404 });
    }

    fotoAnterior = resenaActual.foto_url;
    rutaFotoNueva = `resenas/${id}/${randomUUID()}.${extension}`;
    const bytes = Buffer.from(await foto.arrayBuffer());

    const { error: errorSubida } = await supabaseService.storage
      .from(BUCKET)
      .upload(rutaFotoNueva, bytes, { contentType: foto.type, upsert: false });

    if (errorSubida) {
      console.error("Error subiendo foto de reseña:", errorSubida);
      return NextResponse.json({ error: errorSubida.message }, { status: 500 });
    }

    cambios.foto_url = rutaFotoNueva;
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "No hay cambios para aplicar" }, { status: 400 });
  }

  const { data: resenaActualizada, error } = await supabaseService
    .from("resenas")
    .update(cambios)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !resenaActualizada) {
    console.error("Error actualizando resenas:", error);
    if (rutaFotoNueva) {
      await supabaseService.storage.from(BUCKET).remove([rutaFotoNueva]);
    }
    return NextResponse.json({ error: "No se pudo actualizar la reseña" }, { status: 500 });
  }

  if (rutaFotoNueva && fotoAnterior) {
    await supabaseService.storage.from(BUCKET).remove([fotoAnterior]);
  }

  const url = resenaActualizada.foto_url
    ? supabaseService.storage.from(BUCKET).getPublicUrl(resenaActualizada.foto_url).data.publicUrl
    : null;

  return NextResponse.json({ resena: { ...resenaActualizada, url } });
}

// DELETE /api/resenas/[id]
// Borra la reseña y, si tenía, su foto del bucket. Solo admin.
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
      { error: "Solo la administradora puede gestionar las reseñas" },
      { status: 403 },
    );
  }

  const supabaseService = createServiceClient();

  const { data: resena, error: errorResena } = await supabaseService
    .from("resenas")
    .select("foto_url")
    .eq("id", id)
    .maybeSingle();

  if (errorResena) {
    console.error("Error buscando la reseña a eliminar:", errorResena);
    return NextResponse.json({ error: "No se pudo eliminar la reseña" }, { status: 500 });
  }

  if (!resena) {
    return NextResponse.json({ error: "Reseña no encontrada" }, { status: 404 });
  }

  const { error: errorBorrado } = await supabaseService
    .from("resenas")
    .delete()
    .eq("id", id);

  if (errorBorrado) {
    console.error("Error eliminando resenas:", errorBorrado);
    return NextResponse.json({ error: "No se pudo eliminar la reseña" }, { status: 500 });
  }

  if (resena.foto_url) {
    const { error: errorRemove } = await supabaseService.storage
      .from(BUCKET)
      .remove([resena.foto_url]);

    if (errorRemove) {
      console.error("Error eliminando el archivo del bucket:", errorRemove);
    }
  }

  return NextResponse.json({ ok: true });
}
