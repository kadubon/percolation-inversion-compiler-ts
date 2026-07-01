import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/io/schema.ts",
    "src/agent/messages.ts",
    "src/packet/index.ts",
    "src/phase_lab/index.ts",
    "src/bit_engine/index.ts",
    "src/sqot_controller/index.ts",
    "src/alt_lift/index.ts",
    "src/trc_adapter/index.ts",
    "src/interop/ccr.ts",
    "src/cli/main.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: false,
  clean: true,
  splitting: false,
  target: "node20",
});
