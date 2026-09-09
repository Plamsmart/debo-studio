# Contexto del proyecto — Estudio Débora Pereira (debo-studio)

> Este documento existe para que cualquier conversación nueva con Claude (o
> Claude Code) pueda retomar este proyecto sin perder el contexto acumulado.
> Súbelo al inicio de un chat nuevo, o déjalo en la raíz del repo como
> `AGENTS.md`/`CLAUDE.md` para que Claude Code lo lea automáticamente.

## Qué es el proyecto

Plataforma web completa para **Estudio Débora Pereira**, un negocio de
estética integral y micropigmentación en Irun, Gipuzkoa (España). Pedro
(el desarrollador, primer proyecto de portafolio) lo está construyendo con
Claude, cobrando una tarifa de lanzamiento (700€ implementación + 100€/mes
mantenimiento) a cambio de usarlo como caso de referencia.

**Sitio en producción:** https://estudiodeborapereira.com (también responde
en https://debo-studio.vercel.app)
**Repositorio:** GitHub — `Plamsmart/debo-studio`, rama `main`
**Despliegue:** Vercel, auto-deploy en cada push a `main`

## Stack técnico

- **Next.js** (App Router, TypeScript) — framework principal
- **Supabase** — base de datos Postgres + autenticación (proyecto ref:
  `oujdpjwjiqehfsqawkbt`)
- **Stripe** — pagos (modo Test todavía, no se ha pasado a Live)
- **Resend** — emails transaccionales, dominio propio verificado
  (`reservas@estudiodeborapereira.com`)
- **Google Calendar API** — sincronización de citas (proyecto Google Cloud:
  "Debo-Studio", modo Testing con usuarios de prueba autorizados)
- **Vercel** — hosting
- **Namecheap** — registro del dominio

## Modelo de datos (Supabase, tablas principales)

- `servicios` — catálogo (56 reservables + 8 bonos + 3 formaciones, estos
  últimos con `reservable = false`, no aparecen en `/reservar`)
- `clientes` — sin cuenta de usuario obligatoria (reservas de invitado)
- `citas` — con `estado` (pendiente/confirmada/cancelada/completada/no_asistio),
  `google_event_id` (vínculo con el evento de Google Calendar)
- `pagos` — con `metodo_pago` (web/qr_local/efectivo), `cliente_id` y
  `servicio_id` directos (no solo a través de `cita_id`, para soportar
  cobros del local sin cita asociada)
- `usuarios_admin` — con `rol` ('admin' o 'staff'); staff tiene acceso
  restringido (sin notas de clientes, sin poder borrar, sin gestionar
  servicios)
- `google_calendar_config` — guarda el refresh_token de Google, tabla
  bloqueada con RLS sin políticas (solo `service_role` puede tocarla)

**RLS:** todas las tablas tienen Row Level Security. El patrón recurrente
de bug fue **falta de GRANT** (permiso a nivel de tabla, distinto de RLS) —
pasó con `servicios`, `citas`, `clientes` y `pagos` para el rol
`service_role`. Si algo nuevo empieza a fallar con "permission denied for
table X", primero revisar GRANTs, no solo políticas RLS.

## Decisiones de arquitectura importantes

- **Reservas sin cuenta:** el endpoint público `/api/citas` usa
  `service_role` (bypassa RLS) porque toda la validación pasa por el
  código del backend antes de insertar — es el único lugar del proyecto
  donde se hace esto intencionalmente para escritura pública.
- **Roles admin/staff:** protegidos en 3 capas (política RLS específica
  por rol, chequeo en el endpoint API, y ocultamiento en la UI) — patrón
  usado en `clientes` y `servicios`.
- **Tokens de diseño centralizados:** `app/marca-tokens.css` define todas
  las variables de color (`--marca-*`) en `:root`, importado una sola vez
  en `app/layout.tsx`. Antes cada componente admin redeclaraba sus propios
  colores — ya no, todo hereda de este archivo.
- **Tipografía:** Montserrat (next/font/google) cargada una sola vez en
  `app/layout.tsx`, disponible en toda la app vía `var(--font-montserrat)`.
  Es sustituto gratuito de Gotham (la fuente oficial del manual de marca,
  pendiente de decidir si se compra la licencia).

## Identidad de marca (manual oficial de Débora)

- Bronce institucional (Pantone 876C): `#8F654D`
- Gris institucional (Cool Gray 11C): `#53565A`
- Cobre oscuro/claro (degradado del emblema): `#AF6F49` / `#E0B689`
- Logo: extraído en alta calidad directo del PDF vectorial del manual
  (no de capturas) — `public/emblema.png` (solo la flor),
  `public/logo-vertical.png`, `public/logo-horizontal.png`

## Bugs recurrentes / patrones a recordar

1. **`.select()` con string armado en variable + ternario** rompe la
   inferencia de tipos de `postgrest-js` (TypeScript no puede inferir el
   resultado). Solución: separar en 2 bloques completos con el string
   del select inline en cada uno. Ya pasó 2 veces (`admin/citas`,
   `admin/clientes`).
2. **Cambios de esquema en Supabase requieren regenerar
   `lib/supabase/database.types.ts`** con
   `npx supabase gen types typescript --project-id oujdpjwjiqehfsqawkbt > lib/supabase/database.types.ts`
   — si no, `npm run build` falla aunque `npm run dev` no se queje.
3. **`next/image` con `width`/`height` que no coinciden con la proporción
   real del archivo** distorsiona la imagen (el navegador usa esos
   atributos para el aspect-ratio, no el archivo real). Para el emblema,
   se resolvió usando `<img>` simple sin esos atributos, controlando el
   tamaño solo por CSS.
4. **Resend NO lanza excepción cuando rechaza un envío** (modo test,
   restricción de dominio) — devuelve `{ data, error }` sin throw. Hay
   que revisar el campo `error` explícitamente, no solo `try/catch`. Ya
   corregido en los 4 archivos que envían emails.
5. **El truco `+alias@gmail.com`** (ej. `zorionagencia+prueba1@gmail.com`)
   sirve para simular clientes/usuarios distintos en Supabase, pero
   **Resend en modo test solo entrega al email EXACTO** con el que te
   registraste — los alias con `+` se rechazan con 403 silencioso si no
   se revisan los logs de Resend.
6. **Descargas de archivos con el mismo nombre** — Chrome les agrega
   `(1)`, `(2)` etc. Varias veces se copió el archivo equivocado por
   descuido. Verificar siempre con `ls -la` que el tamaño/fecha coincida
   con lo esperado antes de asumir que el reemplazo funcionó.
7. **Vercel: dominio sin `www` con redirect a `www`** rompe los webhooks
   de Stripe (Stripe no sigue redirects 308). El webhook debe apuntar a
   la URL exacta que responde 200 directo (en este caso, con `www`).
8. **WhatsApp Business API** cambia a cobrar TODOS los mensajes
   (incluyendo respuestas de servicio) desde el 1 de octubre de 2026 —
   por eso el chatbot arranca solo en el widget web (sin costo de Meta),
   WhatsApp queda como fase futura con su propio costo aparte.
9. **Falta de GRANT con `service_role`, otra vez** — pasó ahora con la
   subida de foto de cliente: el `SELECT` sobre `clientes` funcionaba con
   `service_role`, pero el `UPDATE` fallaba con "permission denied for
   table clientes" porque nunca se le había otorgado ese permiso
   específico. Se resolvió con `GRANT UPDATE ON clientes TO
   service_role;` en el SQL Editor. Ya son 5 casos del mismo patrón
   (`servicios`, `citas`, `clientes`, `pagos`, y ahora el `UPDATE` de
   `clientes` en concreto) — **antes de tocar cualquier tabla nueva o
   nueva operación (INSERT/UPDATE/DELETE) con `service_role`, revisar
   GRANTs de una vez**, no solo cuando ya falló.
10. **Los `catch` que devuelven 500 sin loguear el error real cuestan
    mucho tiempo de diagnóstico** — pasó con el endpoint de fotos:
    varios bloques `if (error) return NextResponse.json({error: "mensaje
    genérico"}, {status: 500})` sin `console.error(error)` antes,
    dejando el error real de Supabase invisible tanto en la terminal
    como en el Response del navegador. Costó varias rondas de
    diagnóstico a ciegas (env vars, bucket, nombres) hasta agregar los
    logs y ver el mensaje real. **Convención a partir de ahora: todo
    `catch`/bloque de error que vaya a producción debe loguear el error
    original (`console.error`) antes de devolver un mensaje al
    cliente**, aunque el mensaje que ve el usuario sea genérico por
    seguridad.

## Panel de administración — secciones

- `/admin/citas` — lista con pestañas (Pendientes/Confirmadas/Todas)
- `/admin/calendario` — vista de día estilo Google Calendar + lista de
  citas del día lado a lado, con horario real por día de la semana
- `/admin/servicios` — CRUD del catálogo (solo admin puede modificar)
- `/admin/clientes` — historial de pagos por cliente, notas (solo admin)
- `/admin/cobrar` — cobro en el local (QR vía Stripe Checkout, o efectivo
  instantáneo)
- `/admin/integraciones` — conectar/ver estado de Google Calendar

## TicketBAI (facturación electrónica, en evaluación)

Estudio Débora Pereira está en Irun (Gipuzkoa), así que le aplica la
normativa foral TicketBAI (obligatoria en Gipuzkoa desde el 1 de junio de
2023, con matices de calendario según sector). Se investigaron opciones
para generar el fichero XML firmado y el código QR en cada cobro,
independientemente del canal (`pagos.metodo_pago`: web/qr_local/efectivo).

**Requisito legal clave:** el software que genera y firma los ficheros
TBAI (propio o de terceros) debe estar inscrito en el registro de
software garante de la Hacienda Foral correspondiente. Externalizar la
tarea a un proveedor no exime al negocio de la obligación — Débora sigue
siendo responsable de que se cumpla.

**Descartado:** desarrollo propio homologado. Implica registrar el
software, mantenerlo actualizado con cada cambio normativo, y asumir
sanciones si falla (hasta 30.000€ al fabricante de software no conforme).
Desproporcionado para el tamaño del proyecto.

**Hallazgo clave — Débora ya está cumpliendo TicketBAI hoy:** usa un TPV
llamado **ETPOS** (software de SDI Lab, muy usado en hostelería/comercio
en España) para los cobros en el local (efectivo y tarjeta), con su
propio módulo de certificación TicketBAI anual (200€/año — coincide con
lo que ya paga). Es un sistema cerrado, sin API para inyectar ventas
externas (confirmado por Pedro, no hay evidencia pública de lo
contrario). **Esto reduce el alcance real del proyecto:** no hay que
sustituir nada de lo que ya funciona en el local (~600 cobros/mes); solo
falta cubrir el canal nuevo que introduce la web (pagos con Stripe, hoy
inexistente en producción). Es legal y normal tener series de facturación
separadas por canal bajo el mismo NIF (ej. serie "LOCAL" en ETPOS, serie
"WEB" en el proveedor elegido).

**Opciones evaluadas:**
- **Itcons** (conector Stripe–TicketBAI) — empresa de Gipuzkoa,
  referenciada por Stripe, homologada. Pero solo cubre cobros que pasan
  por Stripe Invoices; no tiene API genérica conocida. Descartado por no
  encajar con el flujo de pagos.
- **B2Brouter** — API REST genérica, homologada en los tres territorios
  forales, marca blanca. Planes desde Basic/gratuito hasta Enterprise a
  medida (contactar para precio): https://www.b2brouter.net/es/api-ticketbai/
- **TicketBAI WS** (Berein Internet S.L., Vitoria-Gasteiz) — **opción
  elegida para evaluar en profundidad**. API REST/JSON genérica,
  agnóstica del método de cobro. +10M facturas en producción, ~2.000
  empresas activas, software garante acreditado en Araba/Bizkaia/Gipuzkoa
  y colaborador social de la AEAT para Verifactu.
  - **Precios:** Básico 4,99€/mes anual (5,99€ mensual) — hasta 30
    facturas/mes, hasta 6.000€ facturación/mes, 1 NIF · Profesional
    14,99€/mes anual (17,99€ mensual) — sin límite de facturas, hasta
    30.000€/mes, 1 NIF · Avanzado 29,99€/mes anual (35,99€ mensual) — sin
    límites, hasta 3 NIFs. https://ticketbaiws.eus/es/tarifas/
  - **API:** `POST https://{entorno}.ticketbaiws.eus/tbai/` (entornos
    `api-test` y `api`), headers `Token` + `Nif`. Payload JSON con
    fecha/hora, `serie`+`numero` (texto libre, permite series separadas
    tipo "WEB-"), `simplificada: true` para ticket sin NIF/dirección del
    cliente, `lineas[]` con importe/tipo_iva. Devuelve `huella_tbai`, `qr`
    (base64) y `url` de validación. Endpoints adicionales: anular
    (`DEL`), rectificar (`rectificativa` + `rectificadas[]`), forzar
    reenvío, webhooks (alta/modificación/consulta), listado/descarga
    (XML, FacturaE, PDF). Documentación completa:
    https://ticketbaiws.eus/es/documentacion-api/
  - **No requiere certificado digital propio** — solo registrar su
    certificado de dispositivo o completar el documento de
    representación ante la Hacienda Foral correspondiente.
  - **Sandbox:** existe (`api-test.ticketbaiws.eus`), pero no es
    autoservicio — hay que escribir a soporte para que den de alta el NIF
    en el entorno de test antes de contratar.
  - **Reintentos automáticos** si Hacienda no responde; el ticket ya se
    imprime con su identificador mientras tanto.
  - Contacto: soporte@ticketbaiws.eus / +34 945 13 84 93.

**Correo enviado a soporte@ticketbaiws.eus (9 sept 2026), pendiente de
respuesta.** Preguntas sin resolver por la documentación pública:
1. Qué pasa exactamente al superar el límite de facturas del plan a
   mitad de mes (cobro extra / bloqueo / subida de plan).
2. Importe máximo por operación para factura simplificada (límite legal
   general, no específico de la API — hay que confirmarlo por si algún
   tratamiento de micropigmentación lo supera).
3. Confirmación explícita de que no hay restricción de Hacienda para
   tener dos software distintos (ETPOS + TicketBAI WS) emitiendo bajo el
   mismo NIF con series separadas (técnicamente no debería haber problema
   según la API, pero se pidió confirmación).

**Enfoque de integración recomendado:** llamar a la API de TicketBAI WS
justo después de insertar el registro en `pagos` cuando `metodo_pago =
'web'` (no se toca ETPOS ni el resto de canales), con una serie propia
tipo "WEB-", guardando `huella_tbai` y el QR devueltos (columna nueva en
`pagos` o `citas`) e incluyéndolos en el email de confirmación que ya se
envía por Resend.

**Pendiente de resolver antes de implementar:**
1. Certificado de dispositivo / documento de representación — falta que
   Débora complete el trámite con la Hacienda Foral de Gipuzkoa una vez
   se confirme el proveedor.
2. Respuesta de TicketBAI WS a las 3 preguntas pendientes de arriba.

## Foto de perfil circular en /admin/clientes (implementado)

A pedido de Débora, se agregó una foto de perfil circular por cliente en
el panel de administración, con subida de archivo (no URL pegada).

- **Supabase:** columna `foto_url text` (nullable) en `clientes`. Bucket
  de Storage **`clientes-fotos`** — privado, límite 5MB, solo
  `image/jpeg`, `image/png`, `image/webp`. Sin políticas de
  `storage.objects` a propósito: por RLS, solo `service_role` puede
  escribir/leer, nunca expuesto al navegador. Decisión tomada por ser
  rostros de clientes reales (dato sensible bajo GDPR) — se usan
  **signed URLs de corta duración (24h)** en vez de bucket público.
- **Endpoint:** `POST /api/clientes/[id]/foto` — valida sesión + rol
  (admin o staff, ambos permitidos por ahora, es dato visual no
  sensible), valida tipo/tamaño, sube con `service_role`, actualiza
  `foto_url` (se guarda solo la ruta, no la URL firmada), borra la foto
  anterior si existía, devuelve una signed URL fresca.
- **UI:** avatar circular en `PanelClientes.tsx` con fallback de
  iniciales si no hay foto, input estilizado como botón
  "Agregar/Cambiar foto". Estilos con los tokens de `marca-tokens.css`.
- **Bug encontrado y resuelto:** falta de GRANT de `UPDATE` sobre
  `clientes` para `service_role` — ver bug #9 en la lista de arriba.

## Pendiente / próximos pasos

1. **Chatbot con IA** (siguiente sesión de trabajo) — adaptar el proyecto
   `zorion-chat` (repo separado: `Plamsmart/zorion-chat`, construido
   originalmente para un gimnasio con integración a AimHarder) hacia
   `debo-studio`. Decisión ya tomada: **clonar y simplificar el código
   dentro de `debo-studio`** (no conectar como tenant de zorion-chat), por
   temas de aislamiento de seguridad/datos entre clientes futuros.
   Las herramientas de reserva del bot deben reescribirse para llamar a
   `/api/disponibilidad` y `/api/citas` (las propias), no a AimHarder.
   Ya incluido en el presupuesto formal (700€) con límite de 300
   conversaciones/mes en el mantenimiento.
2. **Licencia de Gotham** — pendiente de que Débora confirme si ya la
   tiene. Por ahora se usa Montserrat (gratis) como sustituto.
3. **Stripe en modo Live** — sigue en Test, falta decidir cuándo pasar a
   cobros reales (requiere cuenta bancaria de Débora conectada).
4. **Documento de presupuesto formal** — ya generado
   (`Presupuesto_Estudio_Debora_Pereira.docx`), pendiente de enviárselo a
   Débora para su aceptación.
5. **WhatsApp** — pausado indefinidamente, se retomará como fase aparte
   con presupuesto propio si el negocio lo pide más adelante.
6. **TicketBAI** — en fase de evaluación de proveedor (ver sección
   dedicada arriba). Correo enviado a TicketBAI WS, pendiente de
   respuesta (3 preguntas sin resolver). Falta también el trámite de
   certificado de dispositivo/documento de representación con Débora.
7. **Carrusel de fotos de trabajos en la web pública** (siguiente sesión)
   — Débora quiere una sección con fotos de los trabajos realizados
   (micropigmentación, estética), mostradas en un carrusel en la web
   pública, con capacidad de subir/quitar fotos desde su propio panel de
   administración. Pendiente de diseñar: dónde vive en el panel (¿sección
   nueva, o dentro de `/admin/servicios`?), modelo de datos (tabla nueva
   tipo `fotos_trabajos` vs. array en Storage con metadata), y si se
   asocian a un servicio específico o son una galería general. Aplicar
   la lección de hoy desde el inicio: loguear errores reales en los
   `catch`, y revisar/otorgar GRANTs de `service_role` para la tabla
   nueva antes de probar en vez de descubrirlo por error 500.

## Cuentas y credenciales (dónde viven, no los valores)

- Supabase: proyecto `debo-studio`, org `zorion.Org`
- Vercel: proyecto `debo-studio`, cuenta de Pedro
- Stripe: cuenta "Estudio Débora Pereira" (separada de otros proyectos de
  Pedro), modo Test
- Google Cloud: proyecto "Debo-Studio"
- Resend: cuenta `zorionagencia@gmail.com`, dominio
  `estudiodeborapereira.com` verificado
- Namecheap: dominio `estudiodeborapereira.com` comprado

## Convención de trabajo con Claude Code

Cuando se piden cambios grandes que tocan archivos ya existentes, mejor
dar **instrucciones precisas** (qué buscar, qué reemplazar) en vez de
sobrescribir el archivo completo a ciegas — varias veces el archivo real
en el proyecto había cambiado desde la última copia que Claude tenía, y
sobrescribirlo completo revirtió trabajo sin querer. Siempre pedir
verificación con `npm run build` (no solo `npm run dev`, que es menos
estricto con TypeScript) antes de dar un cambio por bueno.
