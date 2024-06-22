import AwaiterCastable from "./awaiting/AwaiterCastable";
import ExoticCoroutineAwait from "./ExoticCoroutineAwait";
import CoroutineContext from "./CoroutineContext";

export type CoroutineGeneratorYieldable<Context> = AwaiterCastable<Context> | ExoticCoroutineAwait<symbol>;

type CoroutineGenerator<Context> = Generator<CoroutineGeneratorYieldable<Context>, void, CoroutineContext<Context>>;
export default CoroutineGenerator;
