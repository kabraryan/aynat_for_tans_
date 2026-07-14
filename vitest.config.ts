import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/setup/test-env.ts"],
    globalSetup: ["tests/setup/global-setup.ts"],
    // DB tests share one database — avoid cross-file interleaving
    fileParallelism: false,
  },
});
