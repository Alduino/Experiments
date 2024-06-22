export type EventHandler<Args extends unknown[]> = (...args: Args) => void;

export class MiniEventEmitter<Events extends Record<string, unknown[]>> {
    private readonly handlers = new Map<keyof Events, Set<EventHandler<unknown[]>>>();

    addListener<Event extends keyof Events>(event: Event, handler: EventHandler<Events[Event]>) {
        const handlersSet = this.initAndGetHandlersSet(event);
        handlersSet.add(handler);

        return () => {
            handlersSet.delete(handler);
            this.cleanupHandlersSet(event);
        };
    }

    emit<Event extends keyof Events>(event: Event, ...params: Events[Event]) {
        const handlersSet = this.handlers.get(event);
        if (!handlersSet) return;

        handlersSet.forEach(handler => handler(...params));
    }

    private initAndGetHandlersSet(event: keyof Events) {
        const existing = this.handlers.get(event);
        if (existing) return existing;

        const newSet = new Set<EventHandler<unknown[]>>();
        this.handlers.set(event, newSet);
        return newSet;
    }

    private cleanupHandlersSet(event: keyof Events) {
        const set = this.handlers.get(event);
        if (!set || set.size > 0) return;
        this.handlers.delete(event);
    }
}

export function getListenerAdder<Events extends Record<string, unknown[]>>(emitter: MiniEventEmitter<Events>): MiniEventEmitter<Events>["addListener"] {
    return emitter.addListener.bind(emitter);
}

export function getEventEmitter<Events extends Record<string, unknown[]>>(emitter: MiniEventEmitter<Events>): MiniEventEmitter<Events>["emit"] {
    return emitter.emit.bind(emitter);
}
