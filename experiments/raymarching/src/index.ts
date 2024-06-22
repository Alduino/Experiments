import {createExperimentRegistrar} from "@experiment-libs/experiment/experiment";

export default createExperimentRegistrar({
    id: "raymarching",
    name: "Raymarching",
    description: "A simple 2D raymarching demo",
    async run() {
        await import("./experiment")
    }
})
