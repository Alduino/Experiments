import {defineConfig} from "tsup";

declare const process: {
    env: {
        NODE_ENV: "development" | "production";
    };
}

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    define: {
        __DEV__: process.env.NODE_ENV === "development" ? "true" : "false"
    }
});
