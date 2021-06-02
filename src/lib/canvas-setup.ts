import Vector2 from "./Vector2";
import {textWithBackground, TextWithBackgroundOptions} from "./imgui";

type CanvasFrameRenderer = (ctx: CanvasFrameContext) => void;

class MouseState {
    readonly left: boolean;
    readonly mid: boolean;
    readonly right: boolean;

    constructor(left: boolean, mid: boolean, right: boolean) {
        this.left = left;
        this.mid = mid;
        this.right = right;
    }

    valueOf() {
        return this.left || this.mid || this.right;
    }

    withLeft(state: boolean) {
        return new MouseState(state, this.mid, this.right);
    }

    withMid(state: boolean) {
        return new MouseState(this.left, state, this.right);
    }

    withRight(state: boolean) {
        return new MouseState(this.left, this.mid, state);
    }
}

class KeyState {
    static fromEntries(entries: [string, boolean][]): KeyState {
        const newState = new KeyState();

        for (const [key, state] of entries) {
            newState[key] = state;
        }

        return newState;
    }

    private readonly _keys: {[key: string]: boolean} = {};

    private clone() {
        const newState = new KeyState();
        Object.assign(newState._keys, this._keys);
        return newState;
    }

    with(key: string, state: boolean) {
        const newState = this.clone();
        newState._keys[key] = state;
        return newState;
    }

    get(key: string) {
        return this._keys[key] || false;
    }

    entries(): [string, boolean][] {
        return Object.entries(this._keys);
    }
}

export enum RenderTrigger {
    Always = 0,

    Resized = 1 << 0,

    MousePressed = 1 << 1,
    MouseReleased = 1 << 2,
    MouseMoved = 1 << 3,

    KeyPressed = 1 << 4,
    KeyReleased = 1 << 5,

    MouseChanged = RenderTrigger.MousePressed | RenderTrigger.MouseReleased | RenderTrigger.MouseMoved,
    KeyChanged = RenderTrigger.KeyPressed | RenderTrigger.KeyReleased
}

export interface CanvasFrameContext {
    /**
     * The low-level rendering class
     */
    renderer: CanvasRenderingContext2D;

    /**
     * The amount of seconds since the last frame
     */
    deltaTime: number;

    /**
     * The current FPS with no smoothing
     */
    fps: number;

    /**
     * The size in pixels of the canvas
     */
    screenSize: Vector2;

    /**
     * `.left`, `.mid`, `.right` each set with either `true` or `false` depending on if that mouse button has been
     * pressed down.
     *
     * To check if any mouse button is down, add a `+` before the reference (e.g. `+ctx.mouseDown`)
     */
    mouseDown: MouseState;

    /**
     * Same as `.mouseDown`, except the values are only set to `true` on the first frame that the button has been
     * pressed. (Rising edge)
     */
    mousePressed: MouseState;

    /**
     * Same as `.mouseDown`, except that the values are only set to `true` on the first frame that the button has been
     * released. (Falling edge)
     */
    mouseReleased: MouseState;

    /**
     * An object containing each Key name and its state, as well as each keyCode and its state
     */
    keyDown: KeyState;

    /**
     * Same as `.keyDown` but rising edge
     */
    keyPressed: KeyState;

    /**
     * Same as `.keyDown` but falling edge
     */
    keyReleased: KeyState;

    /**
     * The current position of the mouse
     */
    mousePos: Vector2;

    /**
     * Set to `true` in any frame where the mouse has moved since the last frame.
     */
    mouseMoved: boolean;

    /**
     * An array of functions that will be called with no parameters when the object is disposed
     */
    disposeListeners: Function[];
}

class CanvasFrameContextFactory {
    private static risingEdgeMouse(curr: MouseState, prev: MouseState): MouseState {
        return new MouseState(
            curr.left && !prev.left,
            curr.mid && !prev.mid,
            curr.right && !prev.right
        );
    }

    private static fallingEdgeMouse(curr: MouseState, prev: MouseState): MouseState {
        return new MouseState(
            !curr.left && prev.left,
            !curr.mid && prev.mid,
            !curr.right && prev.right
        );
    }

    private static risingEdgeKeys(curr: KeyState, prev: KeyState): KeyState {
        return KeyState.fromEntries(
            curr.entries()
                .map(([key, state]) => [key, state && !prev.get(key)])
        );
    }
    private static fallingEdgeKeys(curr: KeyState, prev: KeyState): KeyState {
        return KeyState.fromEntries(
            curr.entries()
                .map(([key, state]) => [key, !state && prev.get(key)])
        );
    }

    private _previousFrameTime: number = -1;
    private _currentFrameTime: number = -1;

    private _mouseState: MouseState = new MouseState(false, false, false);
    private _previousMouseState: MouseState = this._mouseState;

    private _keyState: KeyState = new KeyState();
    private _previousKeyState: KeyState = this._keyState;

    private _mousePos: Vector2 = new Vector2();
    private _previousMousePos: Vector2 = this._mousePos;

    private readonly _canv: HTMLCanvasElement;
    private readonly _ctx: CanvasRenderingContext2D;

    private handleMouseDown(ev: MouseEvent) {
        switch (ev.button) {
            case 0: this._mouseState = this._mouseState.withLeft(true); break;
            case 1: this._mouseState = this._mouseState.withMid(true); break;
            case 2: this._mouseState = this._mouseState.withRight(true); break;
        }
    }

    private handleMouseUp(ev: MouseEvent) {
        switch (ev.button) {
            case 0: this._mouseState = this._mouseState.withLeft(false); break;
            case 1: this._mouseState = this._mouseState.withMid(false); break;
            case 2: this._mouseState = this._mouseState.withRight(false); break;
        }
    }

    private handleMouseMove(ev: MouseEvent) {
        const canvasOffset = this._canv.getBoundingClientRect();
        const mousePagePos = new Vector2(ev.pageX, ev.pageY);
        const offset = new Vector2(canvasOffset.left, canvasOffset.top);
        this._mousePos = mousePagePos.subtract(offset);
    }

    private handleKeyChange(state: boolean, ev: KeyboardEvent) {
        this._keyState = this._keyState.with(ev.key, state);
    }

    public get ctx() {
        return this._ctx;
    }

    constructor(canv: HTMLCanvasElement) {
        this._canv = canv;
        this._ctx = canv.getContext("2d");

        canv.addEventListener("mousedown", this.handleMouseDown.bind(this));
        canv.addEventListener("mouseup", this.handleMouseUp.bind(this));
        canv.addEventListener("mousemove", this.handleMouseMove.bind(this));
        canv.addEventListener("keydown", this.handleKeyChange.bind(this, true));
        canv.addEventListener("keyup", this.handleKeyChange.bind(this, false));
    }

    preFrame() {
        if (this._currentFrameTime === -1) {
            this._currentFrameTime = this._previousFrameTime = performance.now();
        } else {
            this._previousFrameTime = this._currentFrameTime;
            this._currentFrameTime = performance.now();
        }
    }

    postFrame() {
        this._previousMousePos = this._mousePos;
        this._previousMouseState = this._mouseState;
        this._previousKeyState = this._keyState;
    }

    createContext(): CanvasFrameContext {
        const deltaTime = (this._currentFrameTime - this._previousFrameTime) / 1000;

        return {
            renderer: this._ctx,

            deltaTime: deltaTime,
            fps: 1 / deltaTime,

            screenSize: new Vector2(this._canv.width, this._canv.height),

            mouseDown: this._mouseState,
            mousePressed: CanvasFrameContextFactory.risingEdgeMouse(this._mouseState, this._previousMouseState),
            mouseReleased: CanvasFrameContextFactory.fallingEdgeMouse(this._mouseState, this._previousMouseState),

            mousePos: this._mousePos,
            mouseMoved: !this._mousePos.equal(this._previousMousePos),

            keyDown: this._keyState,
            keyPressed: CanvasFrameContextFactory.risingEdgeKeys(this._keyState, this._previousKeyState),
            keyReleased: CanvasFrameContextFactory.fallingEdgeKeys(this._keyState, this._previousKeyState),

            disposeListeners: []
        };
    }
}

interface DefaultPrevented {
    mousedown: boolean;
    mouseup: boolean;
    keydown: boolean;
    keyup: boolean;
}

type CoroutineAwaitResult_Continue<T> = T extends (void | never | undefined) ? {state: true | "aborted"} : {state: true | "aborted", data: T};

export type CoroutineAwaitResult<T> = CoroutineAwaitResult_Continue<T> | {state: false, data?: undefined};

export interface CoroutineAwait<T> {
    DID_YOU_FORGET_YIELD?: never;

    /**
     * Return true to complete this awaiter and exit the yield, or false to keep waiting.
     * The `aborted` state acts the same as `true`, except it also sets the `aborted` field on the context to be true.
     *
     * This function is called every frame, with that frame's context. As it is in the hot path, it should
     * ideally be well optimised and run fast.
     */
    shouldContinue(ctx: CanvasFrameContext): CoroutineAwaitResult<T>;
}

interface StartCoroutineAwait extends CoroutineAwait<void> {
    // Used for nested coroutines, stops it accepting updates from the root controller, so that they can be controlled
    // by whatever nested them.
    cancelRootCheck(): void;

    // Used for nested coroutines, cancels this coroutine and forces its function to return.
    // Note that a coroutine can only be disposed where a `yield` is.
    dispose();
}

function isStartCoroutineAwait(v: CoroutineAwait<void>): v is StartCoroutineAwait {
    if (!v) return false;
    return typeof (v as StartCoroutineAwait).cancelRootCheck === "function";
}

interface CoroutineContext {
    /**
     * The context of the next frame that will be rendered
     */
    ctx: CanvasFrameContext;

    /**
     * Whether or not the awaiter was aborted by its signal
     */
    aborted: boolean;

    /**
     * Data returned by the awaiter
     */
    data: unknown;
}

type GeneratorType = Generator<CoroutineAwait<unknown>, void, CoroutineContext>;

/**
 * Various coroutine awaiters
 *
 * @remarks
 * You can also make your own awaiter - it just needs to be some function that returns a `CoroutineAwait`.
 */
export const c = {
    /**
     * Waits until the first awaiter is complete, or aborts
     * @returns The index of the awaiter that completed first
     * @remarks
     * - If two complete at the same time, will pick the first one passed
     * - If the passed signal is aborted, will return with data `-1`
     */
    waitForFirst(awaiters: CoroutineAwait<unknown>[], signal?: AbortSignal): CoroutineAwait<number> {
        const coroutineAwaiters = new Set<StartCoroutineAwait>();

        for (const awaiter of awaiters) {
            if (isStartCoroutineAwait(awaiter)) {
                awaiter.cancelRootCheck();
                coroutineAwaiters.add(awaiter);
            }
        }

        return {
            shouldContinue(ctx: CanvasFrameContext) {
                if (signal?.aborted) return {state: "aborted", data: -1};

                for (let i = 0; i < awaiters.length; i++){
                    const awaiter = awaiters[i];
                    const result = awaiter.shouldContinue(ctx);

                    if (result.state) {
                        // if the awaiter is a coroutine, abort it
                        for (const otherAwaiter of coroutineAwaiters) {
                            if (otherAwaiter === awaiter) continue;
                            otherAwaiter.dispose();
                        }

                        return {state: result.state, data: i};
                    }
                }

                return {state: false};
            }
        };
    },

    /**
     * Waits until the left mouse button is pressed
     */
    leftMousePressed(signal?: AbortSignal): CoroutineAwait<void> {
        return {
            shouldContinue(ctx: CanvasFrameContext) {
                if (signal?.aborted) return {state: "aborted"};
                return {state: ctx.mousePressed.left};
            }
        };
    },

    /**
     * Waits until the left mouse button is released
     */
    leftMouseReleased(signal?: AbortSignal): CoroutineAwait<void> {
        return {
            shouldContinue(ctx: CanvasFrameContext) {
                if (signal?.aborted) return {state: "aborted"};
                return {state: ctx.mouseReleased.left};
            }
        };
    },

    /**
     * Waits until the mouse is moved
     */
    mouseMoved(signal?: AbortSignal): CoroutineAwait<void> {
        return {
            shouldContinue(ctx: CanvasFrameContext) {
                if (signal?.aborted) return {state: "aborted"};
                return {state: ctx.mouseMoved};
            }
        }
    },

    /**
     * Waits for the specified number of milliseconds. Note that it will still be aligned to a frame.
     */
    delay(ms: number, signal?: AbortSignal): CoroutineAwait<void> {
        let state = false;

        const timeout = setTimeout(() => state = true, ms);

        function handleAbort() {
            signal.removeEventListener("abort", handleAbort);
            clearTimeout(timeout);
        }

        signal?.addEventListener("abort", handleAbort);

        return {
            shouldContinue(ctx: CanvasFrameContext) {
                if (signal?.aborted) return {state: "aborted"};
                return {state};
            }
        };
    },

    /**
     * Waits until the next frame
     */
    nextFrame(): CoroutineAwait<void> {
        return {
            shouldContinue() {
                return {state: true};
            }
        }
    }
};

interface StartCoroutineResult {
    awaiter: CoroutineAwait<void>;
    abortController: AbortController;
}

export interface CoroutineManager {
    /**
     * Begins a new coroutine. Code runs before each frame is rendered.
     *
     * - The point of this method is to create a function that can have delays that depend on what is happening
     *   inside the canvas, e.g. waiting for a mouse button to be pressed, or a key moved. There is various
     *   methods to do this inside the `c` export, which you can `yield` inside a generator function passed here.
     *   `yield` used inside this function acts similarly to `await` inside an async function.
     * - Note that any code inside this function (other than in the `yield` statements) will run synchronously
     *   before the next frame. The `ctx` value returned by `yield`s is the same value that is used in the next
     *   frame.
     * - Every `yield` statement is guaranteed to run on its own frame - two awaiters that complete instantly will still
     *   run on separate frames.
     *
     * @param fn - Coroutine function. If possible, the function's name will be used as the debug identifier.
     * @returns An abort controller to cancel the coroutine, and an awaiter that completes when this coroutine completes, for nesting.
     */
    startCoroutine(fn: CoroutineGeneratorFunction): StartCoroutineResult;

    /**
     * Begins a new coroutine. Code runs before each frame is rendered.
     *
     * - The point of this method is to create a function that can have delays that depend on what is happening
     *   inside the canvas, e.g. waiting for a mouse button to be pressed, or a key moved. There is various
     *   methods to do this inside the `c` export, which you can `yield` inside a generator function passed here.
     *   `yield` used inside this function acts similarly to `await` inside an async function.
     * - Note that any code inside this function (other than in the `yield` statements) will run synchronously
     *   before the next frame. The `ctx` value returned by `yield`s is the same value that is used in the next
     *   frame.
     * - Every `yield` statement is guaranteed to run on its own frame - two awaiters that complete instantly will still
     *   run on separate frames.
     *
     * @param identifier - Debug identifier for development-only logs
     * @param fn - Coroutine function
     * @returns An abort controller to cancel the coroutine, and an awaiter that completes when this coroutine completes, for nesting.
     */
    startCoroutine(identifier: string, fn: CoroutineGeneratorFunction): StartCoroutineResult;
}

interface StatefulCoroutine {
    coroutine: GeneratorType;
    identifier: string;
    rootCheckDisabled: boolean;
    lastResult?: CoroutineAwait<unknown>;
    onComplete(): void;
}

type CoroutineGeneratorFunction = (signal: AbortSignal) => GeneratorType;

class CoroutineManagerImpl implements CoroutineManager {
    private readonly _coroutines = new Set<StatefulCoroutine>();

    get size() {
        return this._coroutines.size;
    }

    private disposeCoroutine(state: StatefulCoroutine) {
        if (process.env.NODE_ENV !== "production") {
            console.debug("Coroutine", `"${state.identifier}"`, "has finished running");
        }

        state.coroutine.return();
        this._coroutines.delete(state);
        state.onComplete();
    }

    private handleCoroutine(ctx: CanvasFrameContext, state: StatefulCoroutine) {
        const {state: shouldContinue, data} = state.lastResult?.shouldContinue(ctx) ?? {state: true};

        if (shouldContinue) {
            const aborted = shouldContinue === "aborted";
            const {done, value} = state.coroutine.next({ctx, aborted, data});

            if (done) {
                this.disposeCoroutine(state);
            } else {
                state.lastResult = value as CoroutineAwait<unknown>;
            }
        }
    }

    frame(ctx: CanvasFrameContext) {
        for (const state of this._coroutines) {
            if (state.rootCheckDisabled) continue;
            this.handleCoroutine(ctx, state);
        }
    }

    private incr = 0;
    startCoroutine(identifier_fn: string | CoroutineGeneratorFunction, fn_opt?: CoroutineGeneratorFunction): StartCoroutineResult {
        const identifier = typeof identifier_fn === "string" ? identifier_fn : identifier_fn.name || `unq_${++this.incr}`;
        const fn = typeof identifier_fn === "function" ? identifier_fn : fn_opt;

        let isComplete = false;

        const abortController = new AbortController();
        const coroutine = fn(abortController.signal);

        const state: StatefulCoroutine = {
            coroutine,
            identifier,
            rootCheckDisabled: false,
            onComplete() { isComplete = true }
        };

        this._coroutines.add(state);

        if (process.env.NODE_ENV !== "production") {
            console.debug("Beginning coroutine", `"${identifier}"`);
        }

        const that = this;
        const awaiter: StartCoroutineAwait = {
            shouldContinue(ctx) {
                that.handleCoroutine(ctx, state);

                return {
                    state: isComplete ? abortController.signal.aborted ? "aborted" : true : false
                }
            },
            cancelRootCheck() {
                state.rootCheckDisabled = true;
            },
            dispose() {
                that.disposeCoroutine(state);
            }
        };

        return {
            abortController,
            awaiter
        };
    }
}

export default class Canvas {
    private readonly _canv: HTMLCanvasElement;

    private _running: boolean = false;
    private _trigger: RenderTrigger = RenderTrigger.Always;
    private _contextFactory: CanvasFrameContextFactory;
    private _callback: CanvasFrameRenderer | null = null;

    private _defaultPrevented: DefaultPrevented = {
        mousedown: false,
        mouseup: false,
        keydown: false,
        keyup: false
    };

    private _defaultKeysPrevented: KeyState = new KeyState();

    private readonly _coroutineManager = new CoroutineManagerImpl();

    public get ctx() {
        return this._contextFactory.ctx;
    }

    private handleFrame(frame: CanvasFrameRenderer) {
        if (!this._running) return;
        requestAnimationFrame(this.handleFrame.bind(this, frame));

        try {
            this._contextFactory.preFrame();

            const ctx = this._contextFactory.createContext();
            frame(ctx);
            ctx.disposeListeners.forEach(listener => listener());

            this._coroutineManager.frame(ctx);

            this._contextFactory.postFrame();
        } catch (err) {
            this._running = false;
            console.error("To prevent overloading the browser with error logs, rendering has been stopped because of:", err);
        }
    }

    private handleResize() {
        const parent = this._canv.parentElement;
        if (!parent) return;

        const parentRect = parent.getBoundingClientRect();
        this._canv.width = parentRect.width;
        this._canv.height = parentRect.height;
    }

    private handleTrigger(cause: RenderTrigger) {
        if (this._trigger & cause) this.handleFrame(this._callback);
    }

    private maybePreventKey(ev: KeyboardEvent) {
        if (this._defaultKeysPrevented.get(ev.key)) ev.preventDefault();
    }

    public constructor(id: string) {
        this._canv = document.getElementById(id) as HTMLCanvasElement;
        this._contextFactory = new CanvasFrameContextFactory(this._canv);

        window.addEventListener("resize", this.handleResize.bind(this));
        this.handleResize();

        this._canv.addEventListener("mousedown", this.handleTrigger.bind(this, RenderTrigger.MousePressed));
        this._canv.addEventListener("mouseup", this.handleTrigger.bind(this, RenderTrigger.MouseReleased));
        this._canv.addEventListener("mousemove", this.handleTrigger.bind(this, RenderTrigger.MouseMoved));
        this._canv.addEventListener("keydown", this.handleTrigger.bind(this, RenderTrigger.KeyPressed));
        this._canv.addEventListener("keyup", this.handleTrigger.bind(this, RenderTrigger.KeyReleased));

        this._canv.addEventListener("keydown", this.maybePreventKey.bind(this));
        this._canv.addEventListener("keyup", this.maybePreventKey.bind(this));

        Object.keys(this._defaultPrevented).map(ev => {
            this._canv.addEventListener(ev, event => {
                if (this._defaultPrevented[ev]) event.preventDefault();
            });
        });

        if (process.env.NODE_ENV !== "production") {
            if (!this._canv.hasAttribute("tabindex")) {
                console.error("Canvas must have a tab index when keyboard states are used\n\n" +
                    "This message will only be shown in development builds.");
            }
        }
    }

    public start(frame: CanvasFrameRenderer, renderTrigger: RenderTrigger = RenderTrigger.Always) {
        this._trigger = renderTrigger;

        if (this._trigger === RenderTrigger.Always) {
            this._running = true;
            requestAnimationFrame(this.handleFrame.bind(this, frame));
        } else {
            this._callback = frame;
        }
    }

    public stop() {
        this._running = false;
        this._trigger = RenderTrigger.Always;
        this._callback = null;
    }

    public setDefaultPrevented(event: keyof DefaultPrevented, prevent: boolean) {
        this._defaultPrevented[event] = prevent;
    }

    public preventKeyDefault(key: string, prevent: boolean) {
        this._defaultKeysPrevented = this._defaultKeysPrevented.with(key, prevent);
    }

    public getCoroutineManager(): CoroutineManager {
        return this._coroutineManager;
    }

    public drawDebug(ctx: CanvasFrameContext) {
        let offsetTop = 5;

        const opts: TextWithBackgroundOptions = {
            text: {font: "12px sans-serif", align: "left", fill: "white"},
            background: {fill: "gray"},
            padding: new Vector2(4, 4)
        };

        textWithBackground(ctx, new Vector2(5, offsetTop), `FPS: ${ctx.fps.toFixed(1)} / ${(ctx.deltaTime * 1000).toFixed(1)}`, opts);
        offsetTop += 20;

        textWithBackground(ctx, new Vector2(5, offsetTop), `DI: ${ctx.disposeListeners.length} C: ${this._coroutineManager.size}`, opts);
        offsetTop += 20;
    }
}
