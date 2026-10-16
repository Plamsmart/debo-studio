// Los .md se importan como texto (regla raw en next.config.ts).
declare module '*.md' {
  const contenido: string
  export default contenido
}
