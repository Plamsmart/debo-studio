// Loader de Turbopack: convierte un archivo de texto (los .md de contenido-legal/)
// en un módulo JS que exporta su contenido como string. Ver next.config.ts.
module.exports = function textoPlano(contenido) {
  return `export default ${JSON.stringify(contenido)};`
}
