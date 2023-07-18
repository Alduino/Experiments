import FocusTarget from "../../focus/FocusTarget";

export default interface CommonAwaiterOptions {
    /**
     * The focus target to use to control this awaiter.
     * @see FocusTargetManager.createFocusTarget
     */
    focusTarget?: FocusTarget;
}
