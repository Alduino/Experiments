import ExoticCoroutineAwait from "../../../types/ExoticCoroutineAwait";

const marker = Symbol("dispose hook");

export interface ExoticCoroutineAwait_Dispose extends ExoticCoroutineAwait<typeof marker> {
    /**
     * Called when the coroutine is disposed.
     */
    callback(): void;
}

export function createDisposeHook(callback: () => void): ExoticCoroutineAwait_Dispose {
    return {
        marker,
        callback
    };
}

export function isDisposeHook(value: ExoticCoroutineAwait<symbol>): value is ExoticCoroutineAwait_Dispose {
    return value?.marker === marker;
}
