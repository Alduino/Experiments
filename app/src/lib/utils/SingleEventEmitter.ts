import Batch from "./Batch";
import {JobScheduler, Priority} from "./JobScheduler";

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
    #lastArgs: Args | null = null;
    #batch: Batch | null = null;
    #jobScheduler: JobScheduler | null = null;

    getListener(): SingleEventListener<Args> {
        return this;
    }

    listen(handler: EventHandler<Args>) {
        this.#handlers.add(handler);
        return () => this.#handlers.delete(handler);
    }

    emit(...args: Args) {
        this.#lastArgs = args;

        if (this.#jobScheduler) {
            this.#jobScheduler.schedule(this.#marker);
        } else if (this.#batch) {
            this.#batch.add(this.#marker, this.#runHandlers.bind(this));
        } else {
            this.#runHandlers();
        }
    }

    enableBatching(batch: Batch) {
        this.#batch = batch;
    }

    enableJobScheduling(scheduler: JobScheduler, priority: Priority) {
        this.#jobScheduler = scheduler;

        scheduler.register(this.#marker, {
            priority,
            fn: this.#runHandlers.bind(this)
        });
    }

    #runHandlers() {
        this.#handlers.forEach(handler => handler(...this.#lastArgs));
    }
}
