import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@continuum/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@continuum/editor": path.resolve(__dirname, "packages/editor/src/index.ts"),
      "@continuum/storage": path.resolve(__dirname, "packages/storage/src/index.ts"),
      "@continuum/storage/types": path.resolve(
        __dirname,
        "packages/storage/src/types.ts",
      ),
      "@continuum/sync": path.resolve(__dirname, "packages/sync/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts"],
    passWithNoTests: false,
  },
})
