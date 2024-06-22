import ExoticCoroutineAwait from "../../../types/ExoticCoroutineAwait";
import CommonAwaiterOptions from "../../../types/awaiting/CommonAwaiterOptions";

const marker = Symbol("options hook");

export interface ExoticCoroutineAwait_Options extends ExoticCoroutineAwait<typeof marker> {
    options: CommonAwaiterOptions;
}

export function createOptionsHook(options: CommonAwaiterOptions): ExoticCoroutineAwait_Options {
    return {
        marker,
        options
    };
}

export function isOptionsHook(value: ExoticCoroutineAwait<symbol>): value is ExoticCoroutineAwait_Options {
    return value?.marker === marker;
}
