/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public base path of the deployed app. Read at build time by vite.config.ts (see scripts/baseUrl.mjs and .env.example). */
  readonly VITE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
