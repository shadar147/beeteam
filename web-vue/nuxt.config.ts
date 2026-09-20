// BeeTeam web (Vue). SPA + Nitro BFF: the browser never talks to the Rust API
// directly — server/api/* maps the httpOnly session cookie to a Bearer header.
export default defineNuxtConfig({
  compatibilityDate: "2026-01-01",
  // Internal tool behind a login: no SEO need, so render client-side only.
  // Nitro still serves server/api and server/middleware.
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  modules: ["@nuxtjs/tailwindcss", "@pinia/nuxt"],
  css: ["~/assets/css/main.css"],
  tailwindcss: { cssPath: false, configPath: "tailwind.config.ts" },
  // Keep component names 1:1 with the file name (no directory prefix):
  // components/grades/GradeHero.vue → <GradeHero>.
  components: [{ path: "~/components", pathPrefix: false, extensions: [".vue"] }],
  imports: { dirs: ["stores"] },
  runtimeConfig: {
    // Override with NUXT_API_INTERNAL_URL.
    apiInternalUrl: "http://localhost:8080",
  },
  app: {
    head: {
      title: "BeeTeam",
      htmlAttrs: { lang: "ru", "data-theme": "light", "data-density": "regular" },
      meta: [{ name: "description", content: "1-2-1 трекинг для лидов" }],
      link: [{ rel: "icon", href: "/favicon.ico" }],
    },
  },
  typescript: {
    strict: true,
    // node types are needed by tests that read files (tokens.test.ts).
    tsConfig: { compilerOptions: { types: ["node"] } },
  },
});
