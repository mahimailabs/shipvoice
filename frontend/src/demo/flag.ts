/**
 * Whether this bundle is the public preview of the console.
 *
 * Read here and nowhere else. Off for `pnpm dev` and `pnpm build`, on only for
 * `pnpm build:demo`, which loads .env.demo.
 *
 * The flag does not switch the data layer: vite.config.ts resolves the whole of
 * src/api.ts to src/demo/fixtures.ts in that build, so no page ever asks which
 * mode it is in. What is left for this boolean is the handful of things a
 * preview genuinely does differently: the router, the banner, and the test call
 * that cannot be simulated honestly.
 */
export const DEMO = import.meta.env.VITE_DEMO === "true";
