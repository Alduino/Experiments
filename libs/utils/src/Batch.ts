export class Batch {
    readonly #waiting = new Map<symbol, () => void>();

    trigger() {
        this.#waiting.forEach(fn => fn());
        this.#waiting.clear();
    }

    add(distinctness: symbol, fn: () => void) {
        if (this.#waiting.has(distinctness)) return;
        this.#waiting.set(distinctness, fn);
    }
}
