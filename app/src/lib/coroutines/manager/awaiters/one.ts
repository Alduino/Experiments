import AwaiterCastable from "../../types/awaiting/AwaiterCastable";
import {nest, NextAwait} from "./exotic/nest";

/**
 * Waits until one of the awaiters finishes, then returns the index of that awaiter.
 */
export default function one<Context>(awaiters: readonly AwaiterCastable<Context>[]): NextAwait {
    return nest({
        identifier: "waitUntil.one",
        awaiters,
        handler(_ctx, results) {
            for (let i = 0; i < results.length; i++) {
                const result = results[i];

                if (result.done) {
                    return {
                        done: true,
                        data: i
                    }
                }
            }

            return {done: false};
        }
    })
}
