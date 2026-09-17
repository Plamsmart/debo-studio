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
11. **El patrón de GRANT faltante también aplica a `anon`/`authenticated`,
    no solo a `service_role`.** Pasó con `fotos_trabajos`: la policy RLS
    de lectura pública (`using (true)`) ya estaba bien creada, pero sin
    `GRANT SELECT ON fotos_trabajos TO anon, authenticated;` PostgREST
    seguía rechazando con "permission denied" — la policy sin el GRANT no
    alcanza. **Para cualquier tabla nueva con lectura pública (sin
    sesión), verificar ambas capas desde el inicio:** policy RLS +
    GRANT de tabla para el rol que corresponda (`anon` si es pública sin
    login, `authenticated` si requiere sesión, `service_role` si solo el
    backend escribe).
12. **En formularios de subida, el orden de las acciones debe ser a
    prueba de confusión.** En `/admin/fotos-trabajos`, el dropdown de
    servicio venía preseleccionado con el primer servicio de la lista y
    el input de archivo (`<input type="file">` nativo, "Choose File") era
    un elemento aparte del botón "Agregar foto" — Pedro le daba click a
    "Agregar foto" sin haber elegido el archivo, y solo salía un
    `alert()` de "Selecciona una foto". Se corrigió: el dropdown ahora
    exige selección explícita (placeholder obligatorio, sin
    preselección), y el botón "Agregar foto" es la única acción visible
    — funciona como disparador del selector de archivos y sube
    automáticamente al elegir la imagen, sin pasos intermedios. **Para
    cualquier formulario de subida futuro, preferir un solo botón que
    encadene las acciones, en vez de varios controles separados que el
    usuario deba completar en un orden no obvio.**

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
contrario).

**Cambio de alcance (11 sept 2026):** el plan original era "TicketBAI WS
solo para el canal web, ETPOS se queda intacto para el local". **Débora
quiere ir más allá: dejar de usar ETPOS por completo y tener un solo
sistema de facturación.** Esto no es solo un cambio de software de
facturación — ETPOS también es el que corre el datáfono físico del
local, así que dejarlo implica también resolver cómo se cobra con
tarjeta en el mostrador. La opción natural es migrar el cobro físico al
flujo que ya existe en `/admin/cobrar` (QR vía Stripe Checkout o efectivo
instantáneo), de forma que **todo** cobro — web, QR local, efectivo — se
inserte en `pagos` y dispare la llamada a TicketBAI WS, sin importar el
canal. Esto es consistente con el diseño original de la tabla `pagos`
(que ya contemplaba los tres `metodo_pago`).

**Decisión: migración gradual, no corte abrupto.** Débora seguirá usando
ETPOS como respaldo activo hasta confirmar al 100% que el nuevo sistema
funciona bien. Plan de acción:

1. Contratar TicketBAI WS e integrar primero solo el canal web (alcance
   original), validarlo a fondo.
2. Ir migrando gradualmente el cobro del local hacia `/admin/cobrar`,
   con ETPOS corriendo en paralelo como respaldo.
3. **Antes de apagar ETPOS definitivamente**, revisar la facturación
   mensual combinada real (ver nota de plan/Avanzado abajo) y confirmar
   que no hace falta subir de plan antes del corte final.

Es legal y normal tener series de facturación separadas por canal y tipo
bajo el mismo NIF (confirmado por soporte de TicketBAI WS, ver abajo).

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

**Respuesta de soporte@ticketbaiws.eus (10 sept 2026), confirmada:**

1. El límite de facturas/importe del plan se calcula **trimestralmente**,
   no mensualmente como sugiere la página de precios. Si se supera, avisan
   y conversan el cambio de plan — **no bloquean el envío** de forma
   automática.
2. La API no valida ningún importe máximo para factura simplificada — la
   responsabilidad de cumplir ese límite (normativa general de
   facturación) es del negocio, no de TicketBAI WS.
3. **Confirmado sin restricciones:** es "operativa muy habitual" tener
   varios software distintos emitiendo bajo el mismo NIF con series
   separadas. Único cuidado: que la combinación serie-número nunca se
   repita entre los sistemas.
4. **Dato nuevo importante, no contemplado en el diseño original:** la
   normativa exige **series separadas por tipo de factura** (simplificada
   / completa / rectificativa), no solo por canal. Esto afecta el
   esquema de series: en vez de una sola `"WEB-"`, se necesitan variantes
   como `"WEB-SIMP-"`, `"WEB-COMP-"` (si alguna vez se emite con NIF del
   cliente) y `"WEB-RECT-"` para anulaciones/rectificativas.

**Plan contratado: Profesional** (14,99€/mes anual o 17,99€/mes mensual
— se empieza con mensual por flexibilidad, mismo criterio que con el
Básico originalmente). Razón: aunque el volumen total del negocio es
~600 facturas/mes, durante la fase de transición (con ETPOS todavía
activo) solo una fracción de eso pasa por TicketBAI WS, así que el
Básico se quedaría corto pero el Avanzado sería prematuro.

**⚠️ Checkpoint pendiente antes de apagar ETPOS definitivamente:** la
facturación mensual total del negocio (repartida hoy entre ETPOS y
TicketBAI WS) ronda cerca de los 30.000€/mes **sin superarlos** — que es
justo el tope del Plan Profesional. El riesgo es que, al migrar el 100%
del volumen a un solo sistema, se supere ese tope (más aún si el negocio
sigue creciendo). **Antes de dar la migración por completa, revisar la
facturación mensual combinada real de un mes con datos representativos y
decidir si toca subir a Avanzado (29,99-35,99€/mes, sin límites, hasta 3
NIFs) antes del corte**, no después.
'web'`(no se toca ETPOS ni el resto de canales), con una serie propia
tipo "WEB-", guardando`huella_tbai`y el QR devueltos (columna nueva en`pagos`o`citas`) e incluyéndolos en el email de confirmación que ya se
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

## Carrusel de fotos de trabajos en la home (implementado)

A pedido de Débora, sección con fotos de trabajos realizados
(micropigmentación, estética), cada una asociada a un servicio, en
carrusel de 3 visibles a la vez en la home pública, gestionadas por
`admin` desde el panel. **Verificado de punta a punta en producción,
funcionando correctamente.**

- **Supabase:** tabla `fotos_trabajos` (`id`, `servicio_id` → FK a
  `servicios`, `storage_path`, `orden`, `creado_en`). RLS habilitado con
  policy de **lectura pública** (`using (true)` en `select`) — a
  diferencia de `clientes-fotos`, esta tabla sí necesita ser legible por
  `anon` porque el carrusel vive en la home sin sesión. GRANTs:
  `service_role` con `select/insert/update/delete`, y **`anon`,
  `authenticated` con `select`** (ver bug #11 abajo). Bucket
  `fotos-trabajos` — **público** (a diferencia de `clientes-fotos`,
  privado), 5MB, `image/jpeg`/`image/png`/`image/webp`.
- **Backend:** `POST /api/fotos-trabajos` (sube foto + `servicio_id`,
  calcula `orden` siguiente, solo `admin`), `PATCH` y `DELETE
/api/fotos-trabajos/[id]` (reordenar/reasignar, borrar fila + archivo).
  Todos loguean el error real con `console.error` antes de responder
  (aplicando la lección de la sesión anterior).
- **Admin:** sección nueva `/admin/fotos-trabajos` — grid con miniatura,
  servicio asociado, botones de reordenar y eliminar; formulario de
  subida con dropdown de los 56 servicios reservables (sin preselección,
  placeholder "Selecciona un servicio…" obligatorio). Visible solo para
  `admin` en el nav (staff no lo ve, mismo patrón que `servicios`).
- **Público:** `CarruselTrabajos.tsx` en la home — 3 fotos visibles en
  desktop / 1 en mobile, autoplay con pausa en hover, flechas y dots, se
  oculta por completo si no hay fotos. Lee la tabla con el cliente normal
  (`createClient()`), no con `service_role` — mínimo privilegio,
  consistente con el resto del proyecto.
- **Consentimiento de imagen:** las fotos que sube Débora ya están
  publicadas previamente en su Instagram, por lo que ya cuenta con el
  consentimiento de las clientas para uso público/marketing. Si en el
  futuro sube fotos que **no** vengan ya publicadas en redes, vale la
  pena confirmar el mismo consentimiento antes de subirlas a la web.

## Sección de reseñas en la home (implementado)

A pedido de Débora, sección de reseñas/testimonios (generales del
negocio, no asociadas a un servicio), con calificación de 1-5 estrellas
y foto opcional de la clienta, cargadas manualmente por Débora desde su
panel. Ubicada en la home, justo después de `CarruselTrabajos.tsx`.

- **Supabase:** tabla `resenas` (`id`, `nombre_clienta`, `texto`,
  `calificacion` smallint 1-5 con `check`, `orden`, `creado_en`,
  `foto_url` nullable agregada después). Mismo patrón de RLS/GRANTs que
  `fotos_trabajos`: `service_role` con todos los permisos, RLS con
  policy de lectura pública, GRANT `select` para `anon`/`authenticated`.
- **Foto opcional:** reutiliza el bucket `fotos-trabajos` (no se creó uno
  nuevo) bajo el prefijo `resenas/{id}/...` — mismo criterio de "no
  fragmentar infraestructura" que ya se venía aplicando.
- **Backend:** `POST`/`PATCH`/`DELETE /api/resenas` (y `/[id]`), solo
  `admin`, multipart para la foto opcional, logs de error en todos los
  catch.
- **Admin:** `/admin/resenas` — selector de estrellas clicable, foto
  opcional con el mismo patrón de subida ya corregido (botón dispara el
  selector de archivos, sube al elegir). **Detalle de UX a verificar:**
  en modo creación la foto se sube junto con el resto del formulario (no
  de inmediato, porque no hay `id` todavía); en modo edición sí sube al
  instante — comportamiento intencional pero asimétrico, revisar que se
  sienta bien en el uso real.
- **Público:** `SeccionResenas.tsx` — grid de tarjetas (no carrusel, por
  ser pocas reseñas al inicio), avatar circular solo si hay foto, se
  oculta si no hay reseñas.
- **Consentimiento de imagen:** mismo criterio que fotos de trabajos —
  asumir que Débora tiene permiso de las clientas antes de subir su foto.

## Refactor de `app/home.css` (11-17 sept 2026)

`home.css` había crecido a ~800 líneas mezclando estilos de secciones
distintas, con al menos una regla que parecía duplicada
(`.hero__eyebrow`, aparecía dos veces) y que en realidad era una regla
base + un override específico del Hero (color + animación) — se
consolidaron en una sola sin cambiar el resultado visual. Los estilos de
`SeccionResenas` se movieron a su propio archivo
(`components/SeccionResenas.css`), siguiendo el patrón ya usado en
`PanelClientes.css`/`PanelFotosTrabajos.css`/`PanelResenas.css` — **cada
componente nuevo debe traer su propio `.css`, no agregarse a
`home.css`.** `home.css` sigue siendo grande y compartido entre Hero,
Filosofía, header, servicios, footer, etc. — no se hizo un refactor
completo, solo se evitó seguir agrandándolo.

## Cambio de color del Hero (11-17 sept 2026)

A pedido de Débora, el Hero (y la sección "Filosofía", que comparte el
mismo contenedor `.zona-oscura`) pasó de fondo negro a fondo claro
(`var(--marca-crema)`), con los textos a `var(--marca-gris)`.

**Se decidió explícitamente NO agregar un toggle dark/light** — Débora
pidió un cambio de color puntual, no una funcionalidad de elegir tema;
agregar eso habría sido alcance no solicitado ni presupuestado (mismo
tipo de expansión silenciosa que se viene vigilando con el presupuesto).

**Lección clave de esta sesión — colores codificados a mano vs.
variables:** el cambio de `.zona-oscura` reveló varios lugares con
colores claros escritos directo en el selector (no a través de las
variables `--hero-texto`/`--hero-texto-suave`/`--hero-dorado-claro`),
pensados para el fondo oscuro original y que quedaron ilegibles
(texto claro sobre fondo claro) hasta encontrarlos uno por uno:

- `.header__nombre`, `.header__nav a`, `.nav-movil__toggle span` — texto
  del header cuando flota sobre el Hero (antes de scroll).
- `.hero .btn--outline:hover` — usaba `color: var(--hero-fondo)`, se
  arregló solo al remapear la variable en sí.
- `.filosofia__texto--secundario` — color fijo `#cdb99c`, no detectado
  por el cambio de variable porque no pasaba por ninguna.
- `.filosofia__linea` — línea decorativa con `#e8c68c` fijo, remapeada a
  `var(--hero-dorado-claro)` (rol de acento, no de texto).
  El footer (`--footer-fondo`, `--footer-texto`, `--footer-dorado`) es
  oscuro por diseño propio e independiente de `.zona-oscura` — no se tocó,
  correctamente identificado como fuera de alcance.

**Convención a partir de ahora:** cualquier cambio de fondo/tema en una
sección debe ir acompañado de una búsqueda explícita de colores
codificados a mano dentro de esa sección (`grep` de los hex conocidos),
no solo del cambio de la(s) variable(s) principal(es) — las variables no
capturan los colores que nunca pasaron por ellas.

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
4. **Documento de presupuesto formal — EN REVISIÓN (17 sept 2026),
   pendiente de cerrar número final antes de enviarlo a Débora.**
   El documento original (`Presupuesto_Estudio_Debora_Pereira.docx`,
   700€ implementación) **nunca llegó a comunicarse a Débora** — ni
   siquiera verbalmente, así que no hay ningún número previo que
   "actualizar" de cara a ella, es su primera propuesta formal.
   Se armó un desglose de alcance actualizado
   (`desglose-alcance-presupuesto.md`, generado en esta sesión) que
   cubre: plataforma base, panel de admin, fotos de clientes, carrusel
   de fotos de trabajos, sección de reseñas (con foto opcional),
   cumplimiento TicketBAI, y chatbot con IA. El mantenimiento mensual de
   100€ se desglosó explícitamente (dominio, base de datos activa,
   conexión OpenAI) para que quede claro que no es solo soporte —
   corre infraestructura real cada mes. El límite de 300
   conversaciones/mes del chatbot se dejó explícito como "etapa inicial,
   ajustable si el uso crece" en vez de una promesa rígida o ilimitada.
   **Pendiente de esta tarde/próxima sesión:** cerrar el número final de
   implementación (se habló de 1.000€ como piso, sin decisión definitiva
   todavía) y decidir si el costo mensual de TicketBAI WS
   (~15-18€/mes) se traslada como línea aparte o se absorbe en el
   mantenimiento — la sección de "Estructura de costos propuesta" del
   desglose ya lo deja como línea aparte, confirmar que es la decisión
   final antes de pasar el documento a Word.
5. **WhatsApp** — pausado indefinidamente, se retomará como fase aparte
   con presupuesto propio si el negocio lo pide más adelante.
6. **TicketBAI** — proveedor decidido: **TicketBAI WS, Plan Profesional**
   (ver sección dedicada arriba, con las respuestas de soporte ya
   confirmadas). Alcance ampliado: no solo canal web, sino reemplazo
   gradual completo de ETPOS (con ETPOS como respaldo activo hasta
   confirmar el nuevo sistema al 100%). Próximos pasos: dar de alta a
   Débora en el entorno de pruebas, implementar primero solo el canal web
   con el esquema de series correcto (separadas por canal Y por tipo:
   simplificada/completa/rectificativa), completar el trámite de
   certificado de dispositivo/documento de representación, y — antes de
   apagar ETPOS — revisar el checkpoint de facturación mensual combinada
   vs. el tope de 30.000€/mes del plan.
7. **Proyecto de aprendizaje aparte (sin fecha, después de cerrar
   debo-studio):** implementación directa de TicketBAI (sin proveedor
   intermedio) como ejercicio técnico personal de Pedro — generación de
   XML, firma XAdES-BES, encadenado, envío telemático. Explícitamente
   **desconectado de la producción real de Débora** — usar entorno de
   pruebas de Hacienda con NIF/certificado de prueba propios, no tocar la
   facturación real del negocio. Motivación: no existe librería madura en
   Node/TypeScript para TicketBAI (solo hay una en PHP,
   `Barnetik/tbai-php-lib`, y un ejemplo en Java) — sería una pieza de
   portafolio diferenciada. Se descartó para producción por: registro
   como entidad desarrolladora vía declaración responsable (baja barrera
   legal, pero implica responsabilidad como fabricante de software ante
   fallos, hasta 30.000€ de sanción), la firma XAdES-BES es genuinamente
   compleja de implementar bien sin librería de apoyo, y el certificado
   digital de Débora tendría que vivir en la infraestructura del
   proyecto — riesgo desproporcionado frente al costo de un proveedor
   (~15-18€/mes) para un solo cliente en producción.

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
