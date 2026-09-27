import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "runtime-deployment-in-dev",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const path = new URL(request.url ?? "/", "http://localhost").pathname;
          if (!/^\/(imd-deployment\.json|abi\/[A-Za-z0-9_]+\.json)$/.test(path))
            return next();
          try {
            response.setHeader("Content-Type", "application/json");
            response.end(
              await readFile(new URL("../dist" + path, import.meta.url)),
            );
          } catch {
            response.statusCode = 503;
            response.end(
              "Run npm run build to generate runtime deployment files.",
            );
          }
        });
      },
    },
  ],
  build: { outDir: "../dist", emptyOutDir: true, sourcemap: false },
});
