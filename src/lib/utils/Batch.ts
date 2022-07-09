export default class Batch {
    readonly #waiting = new Map<symbol, () => void>();

    trigger() {
        if (this.#waiting.size > 0) console.debug("Running", this.#waiting.size, "batched updates");
        this.#waiting.forEach(fn => fn());
        this.#waiting.clear();
    }

    add(distinctness: symbol, fn: () => void) {
        if (this.#waiting.has(distinctness)) return;
        this.#waiting.set(distinctness, fn);
    }
}
