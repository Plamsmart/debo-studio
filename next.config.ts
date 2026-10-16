import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      // Los textos legales (contenido-legal/*.md) se importan como string en
      // el build: son la única fuente de verdad de las páginas y avisos (lib/legal.ts).
      "*.md": {
        loaders: ["./lib/loaders/texto-plano.cjs"],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
