import {FOCUS_TARGET_OPTIONS_KEY} from "./constants";
import FocusTargetOptions from "./FocusTargetOptions";

/**
 * @see focus
 * @see blur
 */
export default interface FocusTarget {
    /**
     * The options passed to `createFocusTarget`.
     *
     * @internal
     */
    [FOCUS_TARGET_OPTIONS_KEY]: FocusTargetOptions;

    /**
     * Activates this focus target, allowing its coroutines to run.
     * As only one focus target can be active at a time, this also deactivates every other focus target.
     */
    focus(): void;

    /**
     * Deactivates this focus target, allowing every coroutine to run.
     *
     * If this focus target was created with `require: true`, any coroutines using it will pause.
     */
    blur(): void;
}
