import ExperimentContext from "./ExperimentContext";

const symbol = Symbol.for("experiment-data");

export interface ExperimentData {
    context: ExperimentContext;
}

function readData(): ExperimentData {
    const data = window[symbol];

    if (!data) {
        throw new Error("Experiment data not found");
    }

    return data;
}

export function getCanvas(): HTMLCanvasElement {
    return readData().context.canvas;
}

export function getContainer(): HTMLElement {
    return readData().context.container;
}

export function setData(data: ExperimentData) {
    window[symbol] = data;
}
