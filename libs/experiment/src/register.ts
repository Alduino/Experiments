import Experiment from "./Experiment";

const experiments = new Map<string, Experiment>();

export function registerExperiment(experiment: Experiment): void {
    if (experiments.has(experiment.id)) {
        throw new Error(`Experiment with ID ${experiment.id} already registered`);
    }

    experiments.set(experiment.id, experiment);
}

export function createExperimentRegistrar(experiment: Experiment): () => void {
    return () => registerExperiment(experiment);
}

export function combineExperimentRegistrars(...registrars: (() => void)[]): () => void {
    return () => {
        for (const registrar of registrars) {
            registrar();
        }
    };
}

export function listExperiments(): IterableIterator<Experiment> {
    return experiments.values();
}

export function getExperiment(id: string): Experiment {
    const experiment = experiments.get(id);
    if (!experiment) {
        throw new Error(`No experiment with ID ${id}`);
    }

    return experiment;
}
