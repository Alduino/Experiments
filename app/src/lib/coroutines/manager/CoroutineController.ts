import CoroutineManager from "./CoroutineManager";
import ControllerManagerInterface from "./ControllerManagerInterface";
import CoroutineHandler from "./CoroutineHandler";

export default class CoroutineController<Context> {
    readonly #manager = new CoroutineManager<Context>(this.#createControllerManagerInterface());

    readonly #coroutines = new Set<CoroutineHandler<Context>>();

    #disposedCountThisTick = 0;
    #activeFocusTarget: string | null | undefined = null;

    getManager(): CoroutineManager<Context> {
        return this.#manager;
    }

    /**
     * Runs all coroutines.
     * @param ctx Context returned as `.ctx` from any `yield`s.
     */
    tick(ctx: Context) {
        this.#disposedCountThisTick = 0;

        for (const coroutine of this.#coroutines) {
            coroutine.handle(ctx);
        }
    }

    /**
     * Returns the number of coroutines currently registered.
     *
     * Useful for showing debug information.
     */
    getCoroutineCount(): number {
        return this.#coroutines.size;
    }

    /**
     * Returns the number of `shouldContinue` calls that ran in the last `tick()` call.
     *
     * Useful for showing debug information.
     */
    getLastCheckCount() {
        let count = 0;

        for (const coroutine of this.#coroutines) {
            count += coroutine.getLastCheckCount();
        }

        return count;
    }

    /**
     * Returns the number of coroutines that were disposed in the last `tick()` call.
     *
     * Useful for showing debug information.
     */
    getDisposedCountThisTick() {
        return this.#disposedCountThisTick;
    }

    getRegisteredIdentifiers() {
        return Array.from(this.#coroutines).map(c => c.getIdentifier());
    }

    getActiveFocusTargetIdentifier() {
        return this.#activeFocusTarget;
    }

    #createControllerManagerInterface(): ControllerManagerInterface<Context> {
        return {
            registerCoroutine: coroutine => this.#registerCoroutine(coroutine),
            deregisterCoroutine: coroutine => this.#deregisterCoroutine(coroutine),
            handleActiveFocusTargetChanged: identifier => this.#activeFocusTarget = identifier
        };
    }

    #registerCoroutine(coroutine: CoroutineHandler<Context>) {
        this.#coroutines.add(coroutine);
    }

    #deregisterCoroutine(coroutine: CoroutineHandler<Context>) {
        if (!this.#coroutines.has(coroutine)) {
            throw new Error("Coroutine was never registered or has already been deregistered");
        }

        this.#coroutines.delete(coroutine);
        this.#disposedCountThisTick++;
    }
}
