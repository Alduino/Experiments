import {CoroutineGeneratorYieldable} from "../../../types/CoroutineGenerator";
import ExoticCoroutineAwait from "../../../types/ExoticCoroutineAwait";

export default function isExoticAwaiter(awaiter: CoroutineGeneratorYieldable<never>): awaiter is ExoticCoroutineAwait<symbol> {
    if (!awaiter) return false;
    if (typeof awaiter !== "object") return false;
    const casted = awaiter as ExoticCoroutineAwait<symbol>;
    return typeof casted.marker === "symbol";
}
