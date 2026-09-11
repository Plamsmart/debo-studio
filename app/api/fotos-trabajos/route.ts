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

// POST /api/fotos-trabajos
// Sube una foto de un trabajo realizado y la asocia a un servicio. Solo
// admin (contenido de marketing, mismo criterio de permisos que
// /admin/servicios — a diferencia de las fotos de clientes, aquí staff no
// puede subir/borrar).
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
      { error: "Solo la administradora puede gestionar las fotos de trabajos" },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const foto = formData.get("foto");
  const servicioId = formData.get("servicio_id");

  if (!(foto instanceof File)) {
    return NextResponse.json(
      { error: "Falta el archivo de la foto" },
      { status: 400 },
    );
  }

  if (typeof servicioId !== "string" || !servicioId) {
    return NextResponse.json(
      { error: "Falta el servicio asociado a la foto" },
      { status: 400 },
    );
  }

  const extension = EXTENSIONES_PERMITIDAS[foto.type];
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

  const supabaseService = createServiceClient();

  const { data: servicio, error: errorServicio } = await supabaseService
    .from("servicios")
    .select("id")
    .eq("id", servicioId)
    .maybeSingle();

  if (errorServicio) {
    console.error("Error verificando el servicio:", errorServicio);
    return NextResponse.json(
      { error: "No se pudo verificar el servicio" },
      { status: 500 },
    );
  }

  if (!servicio) {
    return NextResponse.json(
      { error: "El servicio indicado no existe" },
      { status: 404 },
    );
  }

  const { data: ultimaFoto, error: errorOrden } = await supabaseService
    .from("fotos_trabajos")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errorOrden) {
    console.error("Error calculando el siguiente orden:", errorOrden);
    return NextResponse.json(
      { error: "No se pudo calcular el orden de la foto" },
      { status: 500 },
    );
  }

  const siguienteOrden = (ultimaFoto?.orden ?? -1) + 1;
  const ruta = `${servicioId}/${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await foto.arrayBuffer());

  const { error: errorSubida } = await supabaseService.storage
    .from(BUCKET)
    .upload(ruta, bytes, { contentType: foto.type, upsert: false });

  if (errorSubida) {
    console.error("Error subiendo a Storage:", errorSubida);
    return NextResponse.json({ error: errorSubida.message }, { status: 500 });
  }

  const { data: fotoCreada, error: errorInsercion } = await supabaseService
    .from("fotos_trabajos")
    .insert({ servicio_id: servicioId, storage_path: ruta, orden: siguienteOrden })
    .select("*, servicios(id, nombre)")
    .single();

  if (errorInsercion || !fotoCreada) {
    console.error("Error insertando fotos_trabajos:", errorInsercion);
    await supabaseService.storage.from(BUCKET).remove([ruta]);
    return NextResponse.json(
      { error: errorInsercion?.message ?? "No se pudo guardar la foto" },
      { status: 500 },
    );
  }

  const { data: publicUrlData } = supabaseService.storage
    .from(BUCKET)
    .getPublicUrl(ruta);

  return NextResponse.json(
    { foto: { ...fotoCreada, url: publicUrlData.publicUrl } },
    { status: 201 },
  );
}
