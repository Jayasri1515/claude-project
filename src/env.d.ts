/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" to opt in to the built-in demo providers (see src/composition.ts). */
  readonly VITE_USE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
