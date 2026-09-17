import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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

// POST /api/resenas
// Crea una reseña nueva, con foto opcional de la clienta. Solo admin
// (contenido de marketing, mismo criterio de permisos que
// /admin/fotos-trabajos). La foto se guarda en el bucket ya existente
// fotos-trabajos, bajo el prefijo resenas/{id-resena}/ para no mezclarla
// con las fotos de trabajos ni requerir infraestructura nueva.
export async function POST(request: NextRequest) {
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
  const nombre_clienta = formData.get("nombre_clienta");
  const texto = formData.get("texto");
  const calificacionRaw = formData.get("calificacion");
  const foto = formData.get("foto");

  if (typeof nombre_clienta !== "string" || !nombre_clienta.trim()) {
    return NextResponse.json(
      { error: "Falta el nombre de la clienta" },
      { status: 400 },
    );
  }

  if (typeof texto !== "string" || !texto.trim()) {
    return NextResponse.json(
      { error: "Falta el texto de la reseña" },
      { status: 400 },
    );
  }

  const calificacion = Number(calificacionRaw);
  if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
    return NextResponse.json(
      { error: "La calificación debe ser un número entero entre 1 y 5" },
      { status: 400 },
    );
  }

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

  const supabaseService = createServiceClient();

  const { data: ultimaResena, error: errorOrden } = await supabaseService
    .from("resenas")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errorOrden) {
    console.error("Error calculando el siguiente orden:", errorOrden);
    return NextResponse.json(
      { error: "No se pudo calcular el orden de la reseña" },
      { status: 500 },
    );
  }

  const siguienteOrden = (ultimaResena?.orden ?? -1) + 1;
  const resenaId = randomUUID();
  let rutaFoto: string | null = null;

  if (foto instanceof File && extension) {
    rutaFoto = `resenas/${resenaId}/${randomUUID()}.${extension}`;
    const bytes = Buffer.from(await foto.arrayBuffer());

    const { error: errorSubida } = await supabaseService.storage
      .from(BUCKET)
      .upload(rutaFoto, bytes, { contentType: foto.type, upsert: false });

    if (errorSubida) {
      console.error("Error subiendo foto de reseña:", errorSubida);
      return NextResponse.json({ error: errorSubida.message }, { status: 500 });
    }
  }

  const { data: resenaCreada, error: errorInsercion } = await supabaseService
    .from("resenas")
    .insert({
      id: resenaId,
      nombre_clienta: nombre_clienta.trim(),
      texto: texto.trim(),
      calificacion,
      orden: siguienteOrden,
      foto_url: rutaFoto,
    })
    .select("*")
    .single();

  if (errorInsercion || !resenaCreada) {
    console.error("Error insertando resenas:", errorInsercion);
    if (rutaFoto) {
      await supabaseService.storage.from(BUCKET).remove([rutaFoto]);
    }
    return NextResponse.json(
      { error: errorInsercion?.message ?? "No se pudo guardar la reseña" },
      { status: 500 },
    );
  }

  const url = rutaFoto
    ? supabaseService.storage.from(BUCKET).getPublicUrl(rutaFoto).data.publicUrl
    : null;

  return NextResponse.json({ resena: { ...resenaCreada, url } }, { status: 201 });
}
