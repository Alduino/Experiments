import invariant from "tiny-invariant";
import CoroutineGeneratorFunction from "../types/CoroutineGeneratorFunction";
import CoroutineAwait from "../types/awaiting/CoroutineAwait";
import CoroutineContext from "../types/CoroutineContext";
import CoroutineGenerator, {CoroutineGeneratorYieldable} from "../types/CoroutineGenerator";
import isExoticAwaiter from "./awaiters/exotic/isExoticAwaiter";
import {isDisposeHook} from "./awaiters/exotic/dispose";
import {isOptionsHook} from "./awaiters/exotic/options";
import CommonAwaiterOptions from "../types/awaiting/CommonAwaiterOptions";
import AwaiterCastable from "../types/awaiting/AwaiterCastable";
import nextTick from "./awaiters/nextTick";
import FocusTarget from "../focus/FocusTarget";
import {ExoticCoroutineAwait_Nest, isNestAwaiter, nest, NestOptions} from "./awaiters/exotic/nest";
import NestedCoroutineHandler from "./NestedCoroutineHandler";
import ExoticCoroutineAwait from "../types/ExoticCoroutineAwait";

const ERROR_AWAITER_SYMBOL = Symbol();

export interface CoroutineHandlerOptions<Context> {
    /**
     * A debug identifier for this coroutine.
     */
    identifier: string;

    /**
     * The coroutine function itself.
     */
    coroutine: CoroutineGeneratorFunction<Context>;
}

export interface CoroutineHandlerStartInterface {
    /**
     * The parent coroutine's stack trace.
     */
    parentStackTrace: readonly string[];

    /**
     * Stops the coroutine from being updated by removing it from the active list.
     */
    delete(): void;

    /**
     * Checks if the passed focus target is currently focused.
     */
    isFocused(focusTarget: FocusTarget): boolean;
}

export default class CoroutineHandler<Context> {
    readonly #identifier: string;
    readonly #coroutineFn: CoroutineGeneratorFunction<Context>;

    readonly #disposeHandlers = new Set<() => void>();

    #coroutineOrNull: CoroutineGenerator<Context> | null = null;

    #startInterfaceOrNull: CoroutineHandlerStartInterface | null = null;

    #stackTraceOrNull: readonly string[] | null = null;

    /**
     * Whether the coroutine has been disposed.
     */
    #isDisposed = false;

    /**
     * An error holding the stack trace for the first time this coroutine was disposed.
     * Helpful for debugging why a coroutine was disposed twice.
     */
    #firstDisposalTrace: Error | null = null;

    /**
     * Whether the coroutine is waiting for a {@link CoroutineAwait.delay} delay.
     */
    #waitingForDelay = false;

    /**
     * The awaiter returned by the last `yield` call.
     */
    #currentAwaiter: CoroutineAwait<Context, unknown> | null = null;

    #currentNest: NestedCoroutineHandler<Context, never> | null = null;

    /**
     * Awaiter options used as the base.
     */
    #baseAwaiterOptions: CommonAwaiterOptions = {};

    #checkCount = 0;

    constructor({identifier, coroutine}: CoroutineHandlerOptions<Context>) {
        this.#identifier = identifier;
        this.#coroutineFn = coroutine;
    }

    get #startInterface(): CoroutineHandlerStartInterface {
        invariant(this.#startInterfaceOrNull !== null, "Coroutine has not been started yet");
        return this.#startInterfaceOrNull;
    }

    get #coroutine(): CoroutineGenerator<Context> {
        invariant(this.#coroutineOrNull !== null, "Coroutine has not been started yet");
        return this.#coroutineOrNull;
    }

    get #stackTrace(): readonly string[] {
        invariant(this.#stackTraceOrNull !== null, "Coroutine has not been started yet");
        return this.#stackTraceOrNull;
    }

    start(startInterface: CoroutineHandlerStartInterface) {
        this.#startInterfaceOrNull = startInterface;
        this.#coroutineOrNull = this.#coroutineFn();

        this.#stackTraceOrNull = [
            ...startInterface.parentStackTrace,
            this.#identifier
        ];
    }

    dispose() {
        if (this.#isDisposed) {
            throw new Error("Coroutine has already been disposed", {
                cause: this.#firstDisposalTrace
            });
        }

        for (const disposeHandler of this.#disposeHandlers) {
            disposeHandler();
        }

        this.#isDisposed = true;
        this.#currentNest?.dispose();
        this.#startInterface.delete();
        this.#firstDisposalTrace = new Error("Coroutine disposed here");
    }

    handle(ctx: Context) {
        if (this.#isDisposed) {
            throw new Error("Cannot handle a coroutine after it has been disposed", {
                cause: this.#firstDisposalTrace
            })
        }

        this.#checkCount = 0;

        try {
            if (this.#isDelaying()) return;
            if (this.#isOutOfFocus()) return;

            if (this.#handleNest(ctx)) return;

            if (this.#handleCurrentAwaiter(ctx)) return;

            this.#loadNextAwaiter(ctx, {
                done: true,
                data: undefined
            });
        } catch (err) {
            throw this.#addTraceToError(err);
        }
    }

    /**
     * Returns the identifier of this coroutine.
     *
     * Useful for displaying debug information.
     */
    getIdentifier() {
        return this.#identifier;
    }

    /**
     * Returns the number of `shouldContinue` calls that ran on the last `handle` call.
     *
     * Useful for displaying debugging information.
     */
    getLastCheckCount() {
        return 0;
    }

    #isDelaying() {
        if (this.#waitingForDelay) return true;

        const delayPromise = this.#currentAwaiter?.delay;
        if (!delayPromise) return false;

        this.#waitingForDelay = true;

        delayPromise.then(() => {
            this.#waitingForDelay = false;
        });

        return true;
    }

    #isOutOfFocus() {
        const focusTarget = this.#currentAwaiter?.focusTarget;
        if (!focusTarget) return false;

        return !this.#startInterface.isFocused(focusTarget);

    }

    #handleNest(ctx: Context) {
        if (!this.#currentNest) return false;

        const awaiterResult = this.#currentNest.handle(ctx);
        this.#checkCount += this.#currentNest.getLastCheckCount();

        if (awaiterResult.done) {
            this.#currentNest = null;
            this.#loadNextAwaiter(ctx, awaiterResult.data);
        }

        return true;
    }

    #loadNextAwaiter(ctx: Context, awaiterResult: unknown) {
        let nextAwaiter = this.#getNextAwaiter(ctx, awaiterResult);
        let nextAwaiterValue = nextAwaiter.value && this.#castAwaiter(nextAwaiter.value);

        while (nextAwaiterValue && isExoticAwaiter(nextAwaiterValue)) {
            this.#handleExoticAwaiter(nextAwaiterValue);
            if (this.#currentNest) return;

            nextAwaiter = this.#getNextAwaiter(ctx, awaiterResult);
            nextAwaiterValue = this.#castAwaiter(nextAwaiter.value);
        }

        invariant(!isExoticAwaiter(nextAwaiterValue), "Coroutine hook was not handled");

        if (nextAwaiter.done) {
            this.dispose();
        } else {
            this.#currentAwaiter = nextAwaiterValue;
        }
    }

    #getNextAwaiter(ctx: Context, awaiterResult: unknown): IteratorResult<CoroutineGeneratorYieldable<Context>> {
        return this.#coroutine.next(this.#createYieldResult(ctx, awaiterResult))
    }

    #createYieldResult(ctx: Context, data: unknown): CoroutineContext<Context> {
        return {
            ctx,
            data
        };
    }

    #handleExoticAwaiter(hook: ExoticCoroutineAwait<symbol>) {
        if (isDisposeHook(hook)) {
            this.#disposeHandlers.add(hook.callback);
        } else if (isOptionsHook(hook)) {
            Object.assign(this.#baseAwaiterOptions, hook.options);
        } else if (isNestAwaiter(hook)) {
            this.#startNestedCoroutine(hook.options);
        } else {
            const markerDescription = hook.marker?.description;
            throw new Error(`Invalid hook marker: ${markerDescription ?? JSON.stringify(hook)}`);
        }
    }

    #castAwaiter(awaiter: AwaiterCastable<Context> | ExoticCoroutineAwait<symbol>): CoroutineAwait<Context, unknown> | ExoticCoroutineAwait<symbol> {
        if (!awaiter) {
            return nextTick();
        } else if (awaiter instanceof CoroutineHandler || typeof awaiter === "function") {
            return nest({
                identifier: null,
                handler: (_ctx, results) => results[0],
                awaiters: [awaiter]
            }) as ExoticCoroutineAwait_Nest<Context, unknown>;
        } else {
            return awaiter;
        }
    }

    #startNestedCoroutine(options: NestOptions<never, never>) {
        this.#currentNest = new NestedCoroutineHandler<Context, never>({
            ...options,
            isFocused: this.#startInterface.isFocused,
            parentStackTrace: this.#stackTrace
        });
    }

    #handleCurrentAwaiter(ctx: Context) {
        if (!this.#currentAwaiter) return false;

        try {
            const result = this.#currentAwaiter.shouldContinue(ctx);

            this.#checkCount++;

            if (result.done) {
                this.#loadNextAwaiter(ctx, result);
            }

            return true;
        } catch (err) {
            if (!(err instanceof Error)) throw err;

            err[ERROR_AWAITER_SYMBOL] = this.#currentAwaiter.identifier;
            throw err;
        }
    }

    #addTraceToError(err: unknown): unknown {
        if (!(err instanceof Error)) return err;

        const trace = [...this.#stackTrace];

        if (err[ERROR_AWAITER_SYMBOL]) {
            trace.push(err[ERROR_AWAITER_SYMBOL]);
            delete err[ERROR_AWAITER_SYMBOL];
        }

        const traceText = trace.map(line => `  at ${line}`).join("\n");
        err.message += `\n\n${traceText}`;

        return err;
    }
}
