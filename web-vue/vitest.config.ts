import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { "~": resolve(__dirname, "app"), "@": resolve(__dirname, "app") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Playwright specs live in e2e/ and use their own runner — keep Vitest out.
    exclude: ["**/node_modules/**", "**/e2e/**", "**/.nuxt/**", "**/.output/**"],
  },
});
