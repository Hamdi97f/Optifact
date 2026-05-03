/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_GATEWAY_URL: string;
  readonly VITE_API_GATEWAY_KEY: string;
  readonly VITE_TEST_USER_EMAIL?: string;
  readonly VITE_TEST_USER_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
