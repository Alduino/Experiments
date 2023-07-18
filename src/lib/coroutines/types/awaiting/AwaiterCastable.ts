import CoroutineAwait from "./CoroutineAwait";
import CoroutineGeneratorFunction from "../CoroutineGeneratorFunction";
import CoroutineHandler from "../../manager/CoroutineHandler";

/**
 * Each type that can be automatically casted to an awaiter.
 */
type AwaiterCastable<Context> =
    CoroutineAwait<Context, unknown>
    | CoroutineHandler<Context>
    | CoroutineGeneratorFunction<Context>
    | undefined;

export default AwaiterCastable;
