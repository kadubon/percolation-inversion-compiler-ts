import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/io/schema.ts",
    "src/agent/messages.ts",
    "src/packet/index.ts",
    "src/cli/main.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: false,
  clean: true,
  splitting: false,
  target: "node20",
});
