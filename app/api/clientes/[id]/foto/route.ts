import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const BUCKET = "clientes-fotos";
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;
const EXTENSIONES_PERMITIDAS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const DURACION_SIGNED_URL_SEGUNDOS = 60 * 60 * 24;

// POST /api/clientes/[id]/foto
// Sube (o reemplaza) la foto de perfil de un cliente. Tanto admin como
// staff pueden hacerlo — es un dato visual, no sensible como notas o pagos.
// La subida en sí siempre pasa por el service_role (nunca se expone al
// navegador una policy de storage.objects para 'authenticated').
export async function POST(
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

  const { data: usuarioAdmin } = await supabase
    .from("usuarios_admin")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  if (!usuarioAdmin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const formData = await request.formData();
  const foto = formData.get("foto");

  if (!(foto instanceof File)) {
    return NextResponse.json(
      { error: "Falta el archivo de la foto" },
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

  const { data: clienteActual, error: errorClienteActual } =
    await supabaseService
      .from("clientes")
      .select("foto_url")
      .eq("id", id)
      .maybeSingle();

  if (errorClienteActual || !clienteActual) {
    return NextResponse.json(
      { error: "Cliente no encontrado" },
      { status: 404 },
    );
  }

  const nuevaRuta = `${id}/${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await foto.arrayBuffer());

  const { error: errorSubida } = await supabaseService.storage
    .from(BUCKET)
    .upload(nuevaRuta, bytes, { contentType: foto.type, upsert: false });

  if (errorSubida) {
    console.error("Error subiendo a Storage:", errorSubida);
    return NextResponse.json({ error: errorSubida.message }, { status: 500 });
  }

  const { data: clienteActualizado, error: errorActualizacion } =
    await supabaseService
      .from("clientes")
      .update({ foto_url: nuevaRuta })
      .eq("id", id)
      .select("id, foto_url")
      .single();

  if (errorActualizacion || !clienteActualizado) {
    console.error("Error actualizando cliente:", errorActualizacion);
    await supabaseService.storage.from(BUCKET).remove([nuevaRuta]);
    return NextResponse.json(
      { error: errorActualizacion?.message ?? "Cliente no actualizado" },
      { status: 500 },
    );
  }

  if (clienteActual.foto_url) {
    await supabaseService.storage.from(BUCKET).remove([clienteActual.foto_url]);
  }

  const { data: signedData } = await supabaseService.storage
    .from(BUCKET)
    .createSignedUrl(nuevaRuta, DURACION_SIGNED_URL_SEGUNDOS);

  return NextResponse.json({
    foto_url: clienteActualizado.foto_url,
    foto_signed_url: signedData?.signedUrl ?? null,
  });
}
