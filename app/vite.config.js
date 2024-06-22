import {defineConfig} from "vite";
import {readdirSync} from "fs";
import {resolve} from "path";

const inputHtmlFiles = [
    ...readdirSync(resolve(__dirname, "src")).filter(path => path.endsWith(".html")).map(path => resolve(__dirname, "src", path)),
    ...readdirSync(resolve(__dirname, "src/ex")).map(path => resolve(__dirname, "src/ex", path, "index.html"))
]

export default defineConfig({
    root: "src",
    build: {
        target: "esnext",
        rollupOptions: {
            input: inputHtmlFiles
        }
    }
})
