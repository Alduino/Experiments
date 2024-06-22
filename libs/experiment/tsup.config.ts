import {defineConfig} from "tsup";

export default defineConfig({
    entry: {
        app: "./src/app-entry.ts",
        experiment: "./src/experiment-entry.ts"
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
});
