// Textos legales: la ÚNICA fuente de verdad son los .md de contenido-legal/.
// Se importan como texto en el build (regla '*.md' -> raw en next.config.ts),
// así que editar el .md y desplegar actualiza la web y los emails, sin copiar
// la redacción en el código.
import privacidadMd from '../contenido-legal/privacidad.md'
import avisoLegalMd from '../contenido-legal/aviso-legal.md'
import cookiesMd from '../contenido-legal/cookies.md'
import avisosCortosMd from '../contenido-legal/avisos-cortos.md'

export const URL_SITIO = 'https://estudiodeborapereira.com'

// ---------------------------------------------------------------------------
// Conversor Markdown -> HTML mínimo. Cubre SOLO lo que usan estos textos:
// títulos (#, ##, ###), párrafos, listas con "- ", tablas con "|",
// **negrita**, *cursiva*, `código`, [enlaces](url) y URLs http(s) sueltas.
// Todo el texto se escapa antes de insertar etiquetas.
// ---------------------------------------------------------------------------

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type OpcionesEnlaces = {
  // Prefijo para las rutas relativas ("/privacidad"): en los emails hace falta la URL absoluta.
  base?: string
  // Abrir en otra pestaña (avisos del formulario y del chat: no perder lo escrito).
  nuevaPestana?: boolean
}

const PATRON_INLINE =
  /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|(https?:\/\/[^\s<)]*[^\s<).,;:])/g

function enlace(texto: string, url: string, op: OpcionesEnlaces): string {
  const href = url.startsWith('/') && op.base ? op.base + url : url
  const externo = /^https?:\/\//.test(url)
  const destino = op.nuevaPestana || (externo && !url.startsWith(URL_SITIO))
    ? ' target="_blank" rel="noopener noreferrer"'
    : ''
  return `<a href="${escapar(href)}"${destino}>${texto}</a>`
}

function inline(texto: string, op: OpcionesEnlaces): string {
  let html = ''
  let ultimo = 0
  for (const m of texto.matchAll(PATRON_INLINE)) {
    html += escapar(texto.slice(ultimo, m.index))
    const [completo, codigo, textoEnlace, url, negrita, cursiva, urlSuelta] = m
    if (codigo !== undefined) html += `<code>${escapar(codigo)}</code>`
    else if (textoEnlace !== undefined) html += enlace(inline(textoEnlace, op), url, op)
    else if (negrita !== undefined) html += `<strong>${inline(negrita, op)}</strong>`
    else if (cursiva !== undefined) html += `<em>${inline(cursiva, op)}</em>`
    else if (urlSuelta !== undefined) html += enlace(escapar(urlSuelta), urlSuelta, op)
    ultimo = m.index + completo.length
  }
  return html + escapar(texto.slice(ultimo))
}

function idDeTitulo(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function celdas(fila: string): string[] {
  return fila.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
}

export function markdownAHtml(md: string, op: OpcionesEnlaces = {}): string {
  const lineas = md.replace(/\r\n/g, '\n').split('\n')
  const bloques: string[] = []
  let i = 0

  while (i < lineas.length) {
    const linea = lineas[i]

    if (!linea.trim()) {
      i++
      continue
    }

    const titulo = /^(#{1,3})\s+(.*)$/.exec(linea)
    if (titulo) {
      const nivel = titulo[1].length
      const id = nivel > 1 ? ` id="${idDeTitulo(titulo[2])}"` : ''
      bloques.push(`<h${nivel}${id}>${inline(titulo[2], op)}</h${nivel}>`)
      i++
      continue
    }

    if (/^\s*[-*]\s+/.test(linea)) {
      const items: string[] = []
      while (i < lineas.length && /^\s*[-*]\s+/.test(lineas[i])) {
        items.push(`<li>${inline(lineas[i].replace(/^\s*[-*]\s+/, ''), op)}</li>`)
        i++
      }
      bloques.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    // Tabla: fila de cabecera + fila separadora (| --- | --- |) + filas.
    if (linea.trim().startsWith('|') && /^\s*\|?\s*:?-{3,}/.test(lineas[i + 1] ?? '')) {
      const cabecera = celdas(linea)
      i += 2
      const filas: string[][] = []
      while (i < lineas.length && lineas[i].trim().startsWith('|')) {
        filas.push(celdas(lineas[i]))
        i++
      }
      // data-label: en móvil cada fila se muestra como tarjeta con el nombre de la columna.
      bloques.push(
        `<div class="tabla-legal"><table><thead><tr>${cabecera.map((c) => `<th scope="col">${inline(c, op)}</th>`).join('')}</tr></thead><tbody>` +
          filas
            .map(
              (f) =>
                `<tr>${f.map((c, j) => `<td data-label="${escapar(cabecera[j] ?? '')}">${inline(c, op)}</td>`).join('')}</tr>`
            )
            .join('') +
          `</tbody></table></div>`
      )
      continue
    }

    // Párrafo: líneas seguidas hasta una vacía o el inicio de otro bloque.
    const parrafo: string[] = []
    while (
      i < lineas.length &&
      lineas[i].trim() &&
      !/^(#{1,3})\s+/.test(lineas[i]) &&
      !/^\s*[-*]\s+/.test(lineas[i]) &&
      !lineas[i].trim().startsWith('|')
    ) {
      parrafo.push(lineas[i].trim())
      i++
    }
    bloques.push(`<p>${inline(parrafo.join(' '), op)}</p>`)
  }

  return bloques.join('\n')
}

// ---------------------------------------------------------------------------
// Páginas legales
// ---------------------------------------------------------------------------

export type PaginaLegal = 'privacidad' | 'aviso-legal' | 'cookies'

const FUENTES: Record<PaginaLegal, string> = {
  privacidad: privacidadMd,
  'aviso-legal': avisoLegalMd,
  cookies: cookiesMd,
}

// Título = el "# ..." del .md (también sirve para el <title>); html = el resto.
export function paginaLegal(pagina: PaginaLegal): { titulo: string; html: string } {
  const md = FUENTES[pagina]
  const titulo = /^#\s+(.+)$/m.exec(md)?.[1].trim() ?? ''
  return { titulo, html: markdownAHtml(md) }
}

// ---------------------------------------------------------------------------
// Avisos cortos (avisos-cortos.md). Cada uno es una sección "## A. ...".
// Dentro de la sección, los párrafos que terminan en ":" son indicaciones de
// dónde va el aviso ("Debajo del botón «Solicitar cita»:") y no se publican.
// ---------------------------------------------------------------------------

export type AvisoCorto = 'A' | 'B' | 'C' | 'D'

export function avisoCortoMarkdown(letra: AvisoCorto): string {
  const secciones = avisosCortosMd.split(/^##\s+/m)
  const seccion = secciones.find((s) => s.startsWith(`${letra}.`))
  if (!seccion) throw new Error(`avisos-cortos.md: no existe la sección "## ${letra}."`)

  return seccion
    .split('\n')
    .slice(1) // la línea del título
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !p.endsWith(':'))
    .join('\n\n')
}

export function avisoCortoHtml(letra: AvisoCorto, op: OpcionesEnlaces = {}): string {
  return markdownAHtml(avisoCortoMarkdown(letra), op)
}

// Pie de los emails a clientas (aviso C), con estilos en línea para los clientes de correo.
export function pieLegalEmail(): string {
  const html = markdownAHtml(avisoCortoMarkdown('C'), { base: URL_SITIO }).replace(
    /<p>/g,
    '<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#8a8d90;">'
  )
  return `<hr style="border:none;border-top:1px solid #f0e8dc;margin:28px 0 14px;" />${html}`
}
