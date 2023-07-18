import AwaiterCastable from "../../types/awaiting/AwaiterCastable";
import {nest, NextAwait} from "./exotic/nest";

/**
 * Waits until every awaiter has finished.
 */
export default function all<Context>(awaiters: readonly AwaiterCastable<Context>[]): NextAwait {
    return nest({
        identifier: "waitUntil.one",
        awaiters,
        handler(_ctx, results) {
            let allDone = true;

            for (let i = 0; i < results.length; i++) {
                const result = results[i];

                if (!result.done) {
                    allDone = false;
                    break;
                }
            }

            return {done: allDone, data: undefined};
        }
    })
}
