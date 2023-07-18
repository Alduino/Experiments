import ExoticCoroutineAwait from "../../../types/ExoticCoroutineAwait";
import AwaiterCastable from "../../../types/awaiting/AwaiterCastable";
import CoroutineAwaitResult from "../../../types/awaiting/CoroutineAwaitResult";

const marker = Symbol("nest");

export interface NestOptions<Context, Result> {
    /**
     * A debug identifier for this nest call.
     *
     * If `null`, no stack trace item is added for the nest call.
     */
    identifier: string | null;

    /**
     * The list of awaiters to nest.
     */
    awaiters: readonly AwaiterCastable<Context>[];

    /**
     * A method that is called once per tick to handle the current results of the awaiters.
     * @param ctx The coroutine context.
     * @param results A list of the results from each awaiter, in the same order as passed.
     */
    handler(ctx: Context, results: CoroutineAwaitResult<unknown>[]): CoroutineAwaitResult<Result>;
}

export type NextAwait = ExoticCoroutineAwait<symbol>;

export interface ExoticCoroutineAwait_Nest<Context, Result> extends ExoticCoroutineAwait<typeof marker> {
    options: NestOptions<Context, Result>;
}

export function nest<Context, Result>(options: NestOptions<Context, Result>): NextAwait {
    const awaiter: ExoticCoroutineAwait_Nest<Context, Result> = {
        marker,
        options
    };

    return awaiter;
}

export function isNestAwaiter(value: ExoticCoroutineAwait<symbol>): value is ExoticCoroutineAwait_Nest<never, never> {
    return value?.marker === marker;
}
