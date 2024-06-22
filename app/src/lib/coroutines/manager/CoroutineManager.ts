import StartCoroutineResult from "../types/StartCoroutineResult";
import ExoticCoroutineAwait from "../types/ExoticCoroutineAwait";
import CommonAwaiterOptions from "../types/awaiting/CommonAwaiterOptions";
import CoroutineHandler from "./CoroutineHandler";
import FocusTargetManager from "../focus/manager/FocusTargetManager";
import FocusTargetController from "../focus/manager/FocusTargetController";
import {createDisposeHook} from "./awaiters/exotic/dispose";
import {createOptionsHook} from "./awaiters/exotic/options";
import ControllerManagerInterface from "./ControllerManagerInterface";
import CoroutineGeneratorFunction from "../types/CoroutineGeneratorFunction";

/**
 * Coroutine controls
 *
 * @param Context The type of the `ctx` property in the coroutine result.
 */
export default class CoroutineManager<Context> {
    readonly #controllerInterface: ControllerManagerInterface<Context>;

    readonly #focusTargetController = new FocusTargetController();
    readonly #focusTargetManager = this.#focusTargetController.createManager();

    constructor(controllerInterface: ControllerManagerInterface<Context>) {
        this.#controllerInterface = controllerInterface;
    }

    startCoroutine(coroutine: CoroutineHandler<Context> | CoroutineGeneratorFunction<Context>): StartCoroutineResult<Context> {
        if (coroutine instanceof CoroutineHandler) {
            coroutine.start({
                isFocused: target => this.#focusTargetController.isFocused(target),
                delete: () => this.#controllerInterface.deregisterCoroutine(coroutine),
                parentStackTrace: []
            });

            this.#controllerInterface.registerCoroutine(coroutine);

            return this.#createCoroutineResult(coroutine);
        } else {
            return this.startCoroutine(new CoroutineHandler({
                identifier: coroutine.name,
                coroutine
            }));
        }
    }

    getFocusTargetManager(): FocusTargetManager {
        return this.#focusTargetManager;
    }

    /**
     * When yielded, registers the callback to be called when this coroutine is about to be disposed.
     * This is always during a `yield` statement (which will never complete).
     */
    hookDispose(callback: () => void): ExoticCoroutineAwait<symbol> {
        return createDisposeHook(callback);
    }

    /**
     * When yielded, sets the default awaiter options for a coroutine, for any calls after this one.
     * Calling multiple times shallow merges the options.
     */
    hookOptions(options: CommonAwaiterOptions): ExoticCoroutineAwait<symbol> {
        return createOptionsHook(options);
    }

    isFocusGlobal() {
        return !this.#focusTargetController.isAnyFocusTargetActive();
    }

    #createCoroutineResult(coroutine: CoroutineHandler<Context>): StartCoroutineResult<Context> {
        return {
            stop: () => coroutine.dispose(),
        };
    }
}
