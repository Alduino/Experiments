/**
 * @see displayName
 * @see require
 */
export default interface FocusTargetOptions {
    /**
     * A human-readable name for debugging focus targets.
     */
    displayName?: string;

    /**
     * Requires the focus target to be active before the coroutine can resume.
     * Instead of the default behaviour, where the coroutine also resumes if no focus target is active.
     */
    require?: boolean;
}
