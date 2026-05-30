import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Playwright specs live in e2e/ and use their own runner — keep Vitest out.
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
