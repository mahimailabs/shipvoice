/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOKEN_ENDPOINT?: string;
  readonly VITE_AGENT_NAME?: string;
  readonly VITE_API_BASE_URL?: string;
  /**
   * "true" only in the public preview build (`pnpm build:demo`, .env.demo).
   * A string, not a boolean: Vite substitutes the literal from the env file.
   * Read it through src/demo/flag.ts rather than here.
   */
  readonly VITE_DEMO?: string;
  /** Where the preview bundle is served from, for example "/demo/". */
  readonly VITE_DEMO_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
