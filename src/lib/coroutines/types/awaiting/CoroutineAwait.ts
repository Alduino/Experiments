import FocusTarget from "../../focus/FocusTarget";
import CoroutineAwaitResult from "./CoroutineAwaitResult";

export default interface CoroutineAwait<Context, Data> {
    /**
     * # Remember to `yield` this call!
     * You may get unexpected bugs if you don't.
     */
    ["Did you forget `yield`?"]?: never;

    /**
     * Identifies the awaiter, used for debugging.
     */
    identifier: string;
    /**
     * When defined, this awaiter is skipped until this promise resolves. Rejection is ignored.
     */
    delay?: Promise<void>;
    /**
     * The focus target to use to control this awaiter.
     *
     * @see FocusTargetManager.createFocusTarget
     */
    focusTarget?: FocusTarget;

    shouldContinue(ctx: Context): CoroutineAwaitResult<Data>;
}
