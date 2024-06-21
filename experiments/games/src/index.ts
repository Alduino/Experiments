import {combineExperimentRegistrars, createExperimentRegistrar} from "@experiment-libs/experiment/experiment";

export default combineExperimentRegistrars(
    createExperimentRegistrar({
        id: "connect-four",
        name: "Connect 4",
        description: "An implementation based around state stored in an integer.",
        async run() {
            await import("./connect-4/experiment");
        }
    })
);
