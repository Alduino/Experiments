import {createExperimentRegistrar} from "@experiment-libs/experiment/experiment";

export default createExperimentRegistrar({
    id: "citysim",
    name: "Scale City Simulator",
    description: "Simulates cars driving around in a tiny scale city",
    async run() {
        await import("./experiment");
    }
});
