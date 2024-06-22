export default interface Experiment {
    /**
     * A unique ID for this experiment
     */
    id: string;

    name: string;
    description: string;

    run(): Promise<void>;
}
