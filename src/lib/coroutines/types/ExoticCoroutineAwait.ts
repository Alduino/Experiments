/**
 * Exotic awaiters have special behaviour when `yield`ed.
 *
 * Their fields are internal and subject to change.
 */
export default interface ExoticCoroutineAwait<Marker extends symbol> {
    marker: Marker;
}
