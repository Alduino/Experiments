const cleanupHandlers = new Set<() => void>();

export function onCleanup(handler: () => void) {
  cleanupHandlers.add(handler);
}

export function cleanupExperiment() {
    cleanupHandlers.forEach(handler => handler());
    cleanupHandlers.clear();
}
