import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Security-rules tests. They need the Firestore emulator, so run them with
// `npm run test:rules`, which starts it first.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/rules/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
