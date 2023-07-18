/**
 * The value returned from a `yield` statement in a coroutine.
 */
export default interface CoroutineContext<Context> {
    /**
     * Per-step context from the manager.
     */
    ctx: Context;

    /**
     * Awaiter result data.
     */
    data: unknown;
}
