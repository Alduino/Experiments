/**
 * Returns a signal that aborts after the specified timeout, or when the passed signal aborts
 * @param ms - Timeout in milliseconds until abort
 * @param signal - Signal to cancel timeout and abort immediately
 */
export function timeout(ms: number, signal?: AbortSignal): AbortSignal {
    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), ms);

    signal?.addEventListener("abort", () => {
        clearTimeout(timeout);
        controller.abort();
    });

    return controller.signal;
}

/**
 * Aborts when the first signal aborts
 * @param signals - Any number of signals to join together
 */
export function join(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();

    function handler() {
        controller.abort();
        signals.forEach(s => s.removeEventListener("abort", handler));
    }

    signals.forEach(s => s.addEventListener("abort", handler));

    return controller.signal;
}
