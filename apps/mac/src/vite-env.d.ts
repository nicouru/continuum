/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DIARIO_ADMIN_BASE_URL?: string
  readonly VITE_DIARIO_ADMIN_BEARER_TOKEN?: string
  readonly VITE_DIARIO_ADMIN_SESSION_COOKIE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
