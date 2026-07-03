import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

// Build-time feature flag: set CHOPSTICKS_NO_REMOTE_CPU=1 to drop the "CPU:
// remote" adapter (see src/lib/cpu.js). Static hosts like GitHub Pages can't
// reach a localhost engine, so the Pages build excludes it. Defaults to on, so
// `npm run dev` and the test suites keep the adapter.
const includeRemoteCpu = process.env.CHOPSTICKS_NO_REMOTE_CPU !== "1";

// Vite + Vitest share one config. `test` is read by Vitest; the dev/build
// pipeline ignores it.
export default defineConfig({
  plugins: [vue()],
  define: {
    __REMOTE_CPU__: JSON.stringify(includeRemoteCpu),
  },
  server: { port: 8741, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/**/*.test.js"],
  },
});
