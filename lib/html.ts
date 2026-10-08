// Escapa texto para interpolarlo en el HTML de los emails. Los nombres llegan
// del formulario público y del chatbot: sin esto, un nombre con etiquetas
// acabaría como HTML en el correo.
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
