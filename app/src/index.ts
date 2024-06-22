import {cleanupExperiment, listExperiments, setDataForExperiment} from "@experiment-libs/experiment/app";

await Promise.all([
    import("@experiments/games"),
    // import("@experiments/citysim"),
    import("@experiments/raymarching")
].reverse().map(experiment => experiment.then(({default: register}) => register())));

const $experimentList = document.getElementById("experiment-list")!;
const $frame = document.getElementById("frame")!;

const experimentActivators = new Map<string, {
    activate(): void;
    deactivate(): void;
}>();

let activeExperimentId: string | null = null;

function activate(id: string) {
    if (activeExperimentId) experimentActivators.get(activeExperimentId)?.deactivate();
    activeExperimentId = id;

    $frame.innerHTML = "";

    const $container = document.createElement("div");
    const $canvas = document.createElement("canvas");
    $canvas.tabIndex = 0;
    $container.appendChild($canvas);

    $container.classList.add("container");

    $frame.appendChild($container);

    setDataForExperiment({
        context: {
            container: $container,
            canvas: $canvas
        }
    });

    experimentActivators.get(activeExperimentId)?.activate();
}

for (const experiment of listExperiments()) {
    const $link = document.createElement("a");
    $link.href = `/#${experiment.id}`;
    $link.textContent = experiment.name;
    $link.setAttribute("data-description", experiment.description);

    $link.addEventListener("click", ev => {
        ev.preventDefault();
        location.hash = experiment.id;
    });

    $experimentList.prepend($link);

    experimentActivators.set(experiment.id, {
        activate() {
            $link.classList.add("description-visible");
            experiment.run();
        },
        deactivate() {
            cleanupExperiment();
            $link.classList.remove("description-visible");
        }
    });
}

onhashchange = () => {
    activate(location.hash.substring(1));
};

// @ts-expect-error Event isn't used
onhashchange();
