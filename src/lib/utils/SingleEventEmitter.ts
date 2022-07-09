import Batch from "./Batch";

type EventHandler<Args extends unknown[]> = (...args: Args) => void;

export interface SingleEventListener<Args extends unknown[]> {
    /**
     * Adds a listener to the event. Returns a function that removes the listener.
     */
    listen(handler: EventHandler<Args>): () => void;
}

export default class SingleEventEmitter<Args extends unknown[] = []> implements SingleEventListener<Args> {
    readonly #handlers = new Set<EventHandler<Args>>();
    readonly #marker = Symbol();
    #batch: Batch | null = null;

    getListener(): SingleEventListener<Args> {
        return this;
    }

    listen(handler: EventHandler<Args>) {
        this.#handlers.add(handler);
        return () => this.#handlers.delete(handler);
    }

    emit(...args: Args) {
        if (this.#batch) {
            this.#batch.add(this.#marker, this.#runHandlers.bind(this, args));
        } else {
            this.#runHandlers(args);
        }
    }

    enableBatching(batch: Batch) {
        this.#batch = batch;
    }

    #runHandlers(args: Args) {
        this.#handlers.forEach(handler => handler(...args));
    }
}
