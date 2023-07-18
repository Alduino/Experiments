export default interface StartCoroutineResult<Context> {
    /**
     * Disposes of and stops this coroutine.
     */
    stop(): void;
}
