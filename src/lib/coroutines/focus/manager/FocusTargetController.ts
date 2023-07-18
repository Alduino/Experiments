import FocusTarget from "../FocusTarget";
import ControllerManagerInterface from "./ControllerManagerInterface";
import FocusTargetManager from "./FocusTargetManager";
import {FOCUS_TARGET_OPTIONS_KEY} from "../constants";

export default class FocusTargetController {
    #combinedFocusTargets = new WeakMap<FocusTarget, readonly FocusTarget[]>();
    #currentFocusTarget: FocusTarget | null = null;

    createManager(): FocusTargetManager {
        const controllerInterface = this.#createControllerManagerInterface();
        return new FocusTargetManager(controllerInterface);
    }

    /**
     * Checks if the provided focus target is currently active.
     */
    isFocused(target: FocusTarget): boolean {
        const combined = this.#combinedFocusTargets.get(target);

        if (combined) {
            return combined.some(t => this.isFocused(t));
        } else {
            const options = target[FOCUS_TARGET_OPTIONS_KEY];

            if (!options.require && this.#currentFocusTarget === null) return true;
            if (this.#currentFocusTarget === target) return true;
        }
    }

    isAnyFocusTargetActive(): boolean {
        return this.#currentFocusTarget !== null;
    }

    /**
     * Returns `null` if there is no active focus target,
     * `undefined` if there is but it has no name set,
     * or the name if it's set.
     */
    getActiveFocusTargetDisplayName(): null | undefined | string {
        if (this.#currentFocusTarget === null) {
            return null;
        } else {
            const options = this.#currentFocusTarget[FOCUS_TARGET_OPTIONS_KEY];
            return options.displayName;
        }
    }

    #createControllerManagerInterface(): ControllerManagerInterface {
        return {
            focus: this.#focus.bind(this),
            blur: this.#blur.bind(this),
            registerCombinedFocusTarget: this.#registerCombinedFocusTarget.bind(this)
        };
    }

    #focus(target: FocusTarget) {
        this.#currentFocusTarget = target;
    }

    #blur(target: FocusTarget) {
        if (this.#currentFocusTarget === target) {
            this.#currentFocusTarget = null;
        }
    }

    #registerCombinedFocusTarget(target: FocusTarget, sources: readonly FocusTarget[]) {
        this.#combinedFocusTargets.set(target, sources);
    }
}
