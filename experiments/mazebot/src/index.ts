import {createExperimentRegistrar} from "@experiment-libs/experiment/experiment";

export default createExperimentRegistrar({
    id: "mazebot",
    name: "Mazebot",
    description: "Maze-solving robot in a light physics simulation",
    run: () => import("./experiment")
});
