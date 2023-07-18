import ControllerManagerInterface from "./ControllerManagerInterface";
import FocusTargetOptions from "../FocusTargetOptions";
import FocusTarget from "../FocusTarget";
import {FOCUS_TARGET_OPTIONS_KEY} from "../constants";

export default class FocusTargetManager {
    #controllerInterface: ControllerManagerInterface;

    constructor(controllerInterface: ControllerManagerInterface) {
        this.#controllerInterface = controllerInterface;
    }

    createFocusTarget(options: FocusTargetOptions = {}): FocusTarget {
        const target: FocusTarget = {
            [FOCUS_TARGET_OPTIONS_KEY]: options,
            focus: () => this.#controllerInterface.focus(target),
            blur: () => this.#controllerInterface.blur(target)
        };

        return target;
    }

    createCombinedFocusTarget(sources: readonly FocusTarget[]): FocusTarget {
        const target: FocusTarget = {
            [FOCUS_TARGET_OPTIONS_KEY]: {},
            focus: () => this.#throwCombinedFocusError(),
            blur: () => this.#controllerInterface.blur(target)
        };

        this.#controllerInterface.registerCombinedFocusTarget(target, sources);

        return target;
    }

    #throwCombinedFocusError() {
        throw new Error("Cannot focus a combined focus target");
    }
}
