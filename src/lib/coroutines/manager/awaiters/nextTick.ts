import CommonAwaiterOptions from "../../types/awaiting/CommonAwaiterOptions";
import CoroutineAwait from "../../types/awaiting/CoroutineAwait";

/**
 * An awaiter that waits until the next tick.
 *
 * For example, if the coroutine is running in a requestAnimationFrame loop, this will wait until the next frame.
 */
export default function nextTick(options: CommonAwaiterOptions = {}): CoroutineAwait<never, void> {
    return {
        ...options,
        identifier: "nextTick",
        shouldContinue() {
            return {done: true};
        }
    };
}
