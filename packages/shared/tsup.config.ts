import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: {
    tsconfig: "./tsconfig.build.json",
  },
  tsconfig: "./tsconfig.build.json",
  clean: true,
  splitting: false,
  sourcemap: true,
  target: "es2020",
});
