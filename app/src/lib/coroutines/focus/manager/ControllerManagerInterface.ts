import FocusTarget from "../FocusTarget";

export default interface ControllerManagerInterface {
    focus(target: FocusTarget): void;
    blur(target: FocusTarget): void;

    registerCombinedFocusTarget(target: FocusTarget, sources: readonly FocusTarget[]): void;
}
