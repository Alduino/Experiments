import {defineConfig} from "tsup";

export default defineConfig(cfg => ({
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true
}));
