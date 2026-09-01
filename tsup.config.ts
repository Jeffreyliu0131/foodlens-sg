import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm"],
  outDir: "dist-node",
  clean: true,
  sourcemap: true,
  splitting: false,
  target: "node22",
});
