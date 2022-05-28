import Vector2 from "./Vector2";
import {measureText, textWithBackground, TextWithBackgroundOptions} from "./imgui";

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
    private readonly _keys: { [key: string]: boolean } = {};

    static fromEntries(entries: [string, boolean][]): KeyState {
        const newState = new KeyState();

        for (const [key, state] of entries) {
            newState._keys[key] = state;
        }

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

    getActive(): string[] {
        return this.entries().filter(v => v[1]).map(v => v[0]);
    }

    private clone() {
        const newState = new KeyState();
        Object.assign(newState._keys, this._keys);
        return newState;
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
     * A number that counts seconds
     */
    time: number;

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
    private readonly _startTime = performance.now() / 1000;

    constructor(canv: HTMLCanvasElement) {
        this._canv = canv;
        this._ctx = canv.getContext("2d");

        canv.addEventListener("mousedown", this.handleMouseDown.bind(this));
        canv.addEventListener("mouseup", this.handleMouseUp.bind(this));
        canv.addEventListener("mousemove", this.handleMouseMove.bind(this));
        canv.addEventListener("keydown", this.handleKeyChange.bind(this, true));
        canv.addEventListener("keyup", this.handleKeyChange.bind(this, false));
    }

    public get ctx() {
        return this._ctx;
    }

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

            time: performance.now() / 1000 - this._startTime,
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

    private handleMouseDown(ev: MouseEvent) {
        switch (ev.button) {
            case 0:
                this._mouseState = this._mouseState.withLeft(true);
                break;
            case 1:
                this._mouseState = this._mouseState.withMid(true);
                break;
            case 2:
                this._mouseState = this._mouseState.withRight(true);
                break;
        }
    }

    private handleMouseUp(ev: MouseEvent) {
        switch (ev.button) {
            case 0:
                this._mouseState = this._mouseState.withLeft(false);
                break;
            case 1:
                this._mouseState = this._mouseState.withMid(false);
                break;
            case 2:
                this._mouseState = this._mouseState.withRight(false);
                break;
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
}

interface DefaultPrevented {
    mousedown: boolean;
    mouseup: boolean;
    contextmenu: boolean;
    keydown: boolean;
    keyup: boolean;
}

export interface Collider {
    /**
     * Returns the closest signed distance to the shape from the point
     */
    getSignedDistance(point: Vector2): number;
}

export class RectangleCollider implements Collider {
    constructor(public readonly tl: Vector2, public readonly br: Vector2) {
    }

    getSignedDistance(point: Vector2): number {
        const halfSize = this.br.subtract(this.tl).divide(2);
        const samplePosition = point.subtract(this.tl).subtract(halfSize);

        // based on https://www.ronja-tutorials.com/post/034-2d-sdf-basics/#rectangle
        const componentWiseEdgeDistance = samplePosition.abs().subtract(halfSize);

        const outsideDistance = Vector2.max(componentWiseEdgeDistance, Vector2.zero).length();
        const insideDistance = Math.min(Math.max(componentWiseEdgeDistance.x, componentWiseEdgeDistance.y), 0);

        return outsideDistance + insideDistance;
    }

}

type CoroutineAwaitResult_Continue<T> = T extends (void | never | undefined) ? { state: true | "aborted", checkCount?: number } : { state: true | "aborted", data: T, checkCount?: number };

export type CoroutineAwaitResult<T> =
    CoroutineAwaitResult_Continue<T>
    | { state: false, data?: undefined, checkCount?: number };

interface CoroutineAwaitBase<T> {
    /**
     * Remember to `yield` this call! You may get unexpected bugs if you don't.
     */
    DID_YOU_FORGET_YIELD?: never;

    /**
     * Identifies the awaiter, used for debugging
     */
    identifier: string;

    /**
     * Return true to complete this awaiter and exit the yield, or false to keep waiting.
     * The `aborted` state acts the same as `true`, except it also sets the `aborted` field on the context to be true.
     *
     * This function is called every frame, with that frame's context. As it is in the hot path, it should
     * ideally be well optimised and run fast.
     */
    shouldContinue(ctx: CanvasFrameContext, signal: AbortSignal): CoroutineAwaitResult<T>;
}

interface NormalCoroutineAwait<T> extends CoroutineAwaitBase<T> {
    /**
     * If this is a promise, this awaiter (and its coroutine) will not be evaluated until it resolves. Promise rejection
     * will not be handled.
     *
     * You can use this if you know `shouldContinue()` will return `false` until the promise resolves, as an
     * optimisation if your awaiter is slow (`shouldContinue()` will not be called until the promise resolves).
     */
    delay?: Promise<void>;

    /**
     * Called when the awaiter is first called, but from the manager instead of the user.
     */
    init?(signal: AbortSignal): void;

    /**
     * Called after the awaiter is last used
     */
    uninit?(): void;
}

interface NestCoroutineAwait<T> extends CoroutineAwaitBase<T> {
    isNestAwait: true;

    delay?: never;

    /**
     * Called when the awaiter is first called, with that coroutine's traces as the parameter
     */
    init?(traces: string[]): void;

    /**
     * Called after the awaiter is last used
     */
    uninit?(): void;
}

export type CoroutineAwait<T> = NormalCoroutineAwait<T> | NestCoroutineAwait<T>;

function isNestCoroutineAwait<T>(awaiter: CoroutineAwait<T>): awaiter is NestCoroutineAwait<T> {
    return (awaiter as NestCoroutineAwait<T>).isNestAwait === true;
}

interface StartCoroutineAwait extends NormalCoroutineAwait<void> {
    // Used for nested coroutines, stops it accepting updates from the root controller, so that they can be controlled
    // by whatever nested them.
    cancelRootCheck(): void;

    // Used for nested coroutines, cancels this coroutine and forces its function to return.
    // Note that a coroutine can only be disposed where a `yield` is.
    dispose();

    /**
     * Adds some traces to the end of the coroutine's traces, used to show where an error came from
     */
    pushTraces(traces: string[]): void;

    /**
     * Adds some traces to the start of the coroutine's traces, used to show where an error came from
     * @param traces
     */
    addTraces(traces: string[]): void;

    /**
     * Removes the top N traces
     */
    removeTraces(count: number): void;

    /**
     * Returns all the traces
     */
    getTraces(): readonly string[];
}

function isStartCoroutineAwait(v: CoroutineAwait<void>): v is StartCoroutineAwait {
    if (!v) return false;
    return typeof (v as StartCoroutineAwait).cancelRootCheck === "function";
}

export interface CoroutineContext {
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

type GeneratorType = Generator<CoroutineAwait<unknown> | CoroutineGeneratorFunction | StartCoroutineResult, void, CoroutineContext>;

export type NestHandler<T> = (results: CoroutineAwaitResult<unknown>[]) => CoroutineAwaitResult<T>;
export type NestErrorHandler<T> = (error: Error, trace: string[], failedIndex: number) => CoroutineAwaitResult<T> | false;

/**
 * Various coroutine awaiters
 *
 * @remarks You can also make your own awaiter - it just needs to be some function that returns a `CoroutineAwait`.
 */
export const c = {
    /**
     * Passes the result of each awaiter to `handler`, which reduces them down to one result.
     *
     * This function's purpose is to be wrapped by other awaiters to allow nesting of coroutines. Note that this
     * function MUST be used for situations where a nested coroutine is possible (like waitForFirst, waitForAll etc),
     * as it can handle edge cases with coroutine awaiters that cannot be handled in third party code.
     *
     * @param identifier - Identifies the awaiter, used for debugging
     * @param awaiters - List of awaiters to handle
     * @param handler - Function that takes in the results, in order of passing, and reduces them down to a single one. Called every frame.
     * @param errorHandler - Called when a child awaiter throws an error, similar to `catch`. Return a result if it was handled, or false to propagate the error up.
     */
    nest<T>(identifier: string, awaiters: CoroutineAwait<unknown>[], handler: NestHandler<T>, errorHandler?: NestErrorHandler<T>): CoroutineAwait<T> {
        if (awaiters.length === 0) throw new Error("Must have at least one awaiter");

        const coroutineAwaiters = new Set<StartCoroutineAwait>();
        let traces: string[] = [];

        for (const awaiter of awaiters) {
            if (isStartCoroutineAwait(awaiter)) {
                awaiter.cancelRootCheck();
                coroutineAwaiters.add(awaiter);
            }
        }

        return {
            isNestAwait: true,
            identifier,
            init(initTraces: string[]) {
                traces = initTraces;
            },
            shouldContinue(ctx: CanvasFrameContext, signal: AbortSignal): CoroutineAwaitResult<T> {
                const results = new Array<CoroutineAwaitResult<unknown>>(awaiters.length);

                let lastTraceAwaiter: CoroutineAwait<unknown>, lastTraceIndex: number;
                try {
                    for (let i = 0; i < awaiters.length; i++) {
                        const awaiter = awaiters[i];
                        lastTraceAwaiter = awaiter;
                        lastTraceIndex = i;
                        results[i] = awaiter.shouldContinue(ctx, signal);
                    }
                } catch (err) {
                    if (lastTraceAwaiter) traces.unshift(lastTraceAwaiter.identifier);
                    if (isStartCoroutineAwait(lastTraceAwaiter)) {
                        const newTraces = lastTraceAwaiter.getTraces();
                        traces.unshift(...newTraces.slice(0, newTraces.length - 1));
                    }

                    const error = err instanceof Error ? err : new Error(err + "");
                    const handled = errorHandler ? errorHandler(error, traces, lastTraceIndex) : false;

                    for (const coroutineAwaiter of coroutineAwaiters) {
                        coroutineAwaiter.dispose();
                    }

                    if (handled === false) {
                        throw err;
                    } else {
                        return handled;
                    }
                }

                const result = handler(results);

                if (typeof result.checkCount === "undefined") {
                    result.checkCount = results.reduce((total, res) => total + (res.checkCount ?? 1), 0);
                }

                if (result.state) {
                    for (const coroutineAwaiter of coroutineAwaiters) {
                        coroutineAwaiter.dispose();
                    }
                }

                return result;
            }
        }
    },

    /**
     * Waits until the first awaiter is complete, or aborts
     * @returns The index of the awaiter that completed first
     * @remarks
     * - If two complete at the same time, will pick the first one passed
     * - If the passed signal is aborted, will return with data `-1`
     */
    waitForFirst(awaiters: CoroutineAwait<unknown>[], signal?: AbortSignal): CoroutineAwait<number> {
        return this.nest("c.waitForFirst", awaiters, results => {
            if (signal?.aborted) return {state: "aborted", data: -1};

            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                if (result.state) return {
                    state: result.state,
                    data: i
                };
            }

            return {state: false};
        });
    },

    /**
     * Waits until all awaiters are complete, or one aborts.
     * If an awaiter aborts, its index is returned. Otherwise, -1 is returned.
     */
    waitForAll(awaiters: CoroutineAwait<unknown>[], signal?: AbortSignal): CoroutineAwait<number> {
        return this.nest("c.waitForAll", awaiters, results => {
            if (signal?.aborted) return {state: "aborted", data: -1};

            let allComplete = true;
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                if (result.state === "aborted") return {
                    state: "aborted",
                    data: i
                };

                if (!result.state) allComplete = false;
            }

            if (allComplete) {
                return {state: true, data: -1};
            } else {
                return {state: false};
            }
        });
    },

    /**
     * Waits until the left mouse button is pressed
     */
    leftMousePressed(): CoroutineAwait<void> {
        return {
            identifier: "c.leftMousePressed",
            shouldContinue(ctx: CanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};
                return {state: ctx.mousePressed.left};
            }
        };
    },

    /**
     * Waits until the right mouse button is pressed
     */
    rightMousePressed(): CoroutineAwait<void> {
        return {
            identifier: "c.rightMousePressed",
            shouldContinue(ctx: CanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};
                return {state: ctx.mousePressed.right};
            }
        };
    },

    /**
     * Waits until the left mouse button is released
     */
    leftMouseReleased(): CoroutineAwait<void> {
        return {
            identifier: "c.leftMouseReleased",
            shouldContinue(ctx: CanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};
                return {state: ctx.mouseReleased.left};
            }
        };
    },

    /**
     * Waits until the specified key is pressed
     */
    keyPressed(key: string): CoroutineAwait<void> {
        return {
            identifier: "c.keyPressed",
            shouldContinue(ctx: CanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};
                return {state: ctx.keyPressed.get(key)};
            }
        };
    },

    /**
     * Waits until the specified key is released
     */
    keyReleased(key: string): CoroutineAwait<void> {
        return {
            identifier: "c.keyReleased",
            shouldContinue(ctx: CanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};
                return {state: ctx.keyReleased.get(key)};
            }
        };
    },

    /**
     * Waits until the mouse is moved
     */
    mouseMoved(): CoroutineAwait<void> {
        return {
            identifier: "c.mouseMoved",
            shouldContinue(ctx: CanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};
                return {state: ctx.mouseMoved};
            }
        }
    },

    /**
     * Waits until the mouse enters the shape.
     * @param shape A list of points that creates an outline.
     * @param mustStartOutside When true, the mouse has to have been outside before the awaiter can return.
     */
    mouseEntered(shape: Collider, mustStartOutside = false): CoroutineAwait<void> {
        let hasBeenOutside = !mustStartOutside;

        return {
            identifier: "c.mouseEntered",
            shouldContinue(ctx: CanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};

                const distance = shape.getSignedDistance(ctx.mousePos);

                if (hasBeenOutside) {
                    if (distance <= 0) return {state: true};
                } else if (distance > 0) {
                    hasBeenOutside = true;
                }

                return {state: false};
            }
        };
    },

    /**
     * Waits until the mouse exits the shape.
     * @param shape A list of points that creates an outline.
     * @param mustStartInside When true, the mouse has to have been inside before the awaiter can return.
     */
    mouseExited(shape: Collider, mustStartInside = false): CoroutineAwait<void> {
        let hasBeenInside = !mustStartInside;

        return {
            identifier: "c.mouseEntered",
            shouldContinue(ctx: CanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};

                const distance = shape.getSignedDistance(ctx.mousePos);

                if (hasBeenInside) {
                    if (distance > 0) return {state: true};
                } else if (distance <= 0) {
                    hasBeenInside = true;
                }

                return {state: false};
            }
        };
    },

    /**
     * Waits for the specified number of milliseconds. Note that it will still be aligned to a frame.
     */
    delay(ms: number, signal?: AbortSignal): CoroutineAwait<void> {
        let state = false;

        const timeout = setTimeout(() => state = true, ms);

        const delay = new Promise<void>(yay => {
            function handleAbort() {
                signal.removeEventListener("abort", handleAbort);
                clearTimeout(timeout);
                yay();
            }

            signal?.addEventListener("abort", handleAbort);
        });

        return {
            identifier: "c.delay",
            delay,
            shouldContinue() {
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
            identifier: "c.nextFrame",
            shouldContinue() {
                return {state: true};
            }
        }
    },

    /**
     * Calls the specified check function each frame, and completes when it returns true
     */
    check(chk: (ctx: CanvasFrameContext) => boolean): CoroutineAwait<void> {
        return {
            identifier: "c.check",
            shouldContinue(ctx: CanvasFrameContext, signal: AbortSignal) {
                if (signal?.aborted) return {state: "aborted"};
                return {state: chk(ctx)};
            }
        }
    }
};

interface StartCoroutineResult {
    awaiter: CoroutineAwait<void>;
    abortController: AbortController;
}

function isStartCoroutineResult(test: unknown): test is StartCoroutineResult {
    if (!test || typeof test !== "object") return false;

    const casted = test as StartCoroutineResult;
    return casted.abortController instanceof AbortController && typeof casted.awaiter === "object";
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
    traces: string[];
    abortSignal: AbortSignal;
    rootCheckDisabled: boolean;
    waitingForDelay: boolean;
    lastResult?: CoroutineAwait<unknown>;
    traceShiftCount: number;

    onComplete(): void;
}

type CoroutineGeneratorFunction = (signal: AbortSignal) => GeneratorType;

class CoroutineManagerImpl implements CoroutineManager {
    private readonly _coroutines = new Set<StatefulCoroutine>();
    private incr = 0;
    private checkCount = 0;
    private lastCheckCount = 0;

    get size() {
        return this._coroutines.size;
    }

    get identifiers() {
        return Array.from(this._coroutines).map(item => item.identifier);
    }

    getLastCheckCount() {
        return this.lastCheckCount;
    }

    frame(ctx: CanvasFrameContext) {
        this.lastCheckCount = this.checkCount;
        this.checkCount = 0;

        for (const state of this._coroutines) {
            if (state.rootCheckDisabled) continue;
            this.handleCoroutine(ctx, state);
        }
    }

    startCoroutine(identifier_fn: string | CoroutineGeneratorFunction, fn_opt?: CoroutineGeneratorFunction): StartCoroutineResult {
        const identifier = typeof identifier_fn === "string" ? identifier_fn : identifier_fn.name || `unq_${++this.incr}`;
        const fn = typeof identifier_fn === "function" ? identifier_fn : fn_opt;

        let isComplete = false;

        const abortController = new AbortController();
        const coroutine = fn(abortController.signal);

        const state: StatefulCoroutine = {
            coroutine,
            identifier,
            traces: [identifier],
            abortSignal: abortController.signal,
            rootCheckDisabled: false,
            waitingForDelay: false,
            traceShiftCount: 0,
            onComplete() {
                isComplete = true
            }
        };

        this._coroutines.add(state);

        if (process.env.NODE_ENV !== "production") {
            console.debug("Beginning coroutine", `"${identifier}"`);
        }

        const that = this;
        const awaiter: StartCoroutineAwait = {
            identifier,
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
            },
            pushTraces(traces: string[]) {
                state.traces.push(...traces);
            },
            addTraces(traces: string[]) {
                state.traces.unshift(...traces);
            },
            removeTraces(count: number) {
                state.traces.splice(0, count);
            },
            getTraces(): readonly string[] {
                return state.traces.slice();
            }
        };

        return {
            abortController,
            awaiter
        };
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
        if (state.waitingForDelay) return;

        if (state.lastResult?.delay) {
            state.waitingForDelay = true;
            state.lastResult.delay.then(() => state.waitingForDelay = false);
            return;
        }

        if (state.lastResult) {
            state.traceShiftCount++;
            state.traces.unshift(state.lastResult.identifier);
        }

        try {
            const {
                state: shouldContinue,
                data,
                checkCount = 1
            } = state.lastResult?.shouldContinue(ctx, state.abortSignal) ?? {state: true};

            this.checkCount += checkCount;

            if (shouldContinue) {
                const aborted = shouldContinue === "aborted";

                let done = false, value: CoroutineAwait<unknown> | void;
                try {
                    const res = state.coroutine.next({ctx, aborted, data});
                    done = res.done;

                    const result = res.value;

                    if (typeof result === "function") {
                        value = this.startCoroutine(result).awaiter;
                    } else if (isStartCoroutineResult(result)) {
                        value = result.awaiter;
                    } else {
                        value = result;
                    }
                } finally {
                    if (state.lastResult) {
                        state.traces.splice(0, state.traceShiftCount);
                        state.traceShiftCount = 0;
                    }
                }

                if (done) {
                    this.disposeCoroutine(state);
                } else {
                    const res = value as CoroutineAwait<unknown>;

                    if (isNestCoroutineAwait(res)) res.init?.(state.traces);
                    else res.init?.(state.abortSignal);

                    state.lastResult = value as CoroutineAwait<unknown>;
                }
            } else if (state.lastResult) {
                state.lastResult.uninit?.();
                state.traces.splice(0, state.traceShiftCount);
                state.traceShiftCount = 0;
            }
        } catch (err) {
            if (!state.rootCheckDisabled) {
                const stack = state.traces.map(l => `  in ${l}`).join("\n");
                err.message += "\n" + stack;
            }

            console.log("Coroutine errored:", state.identifier, state.traces);

            this.disposeCoroutine(state);

            throw err;
        }
    }
}

interface CursorStackItem {
    index: number;
    cursor: string;
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
        contextmenu: false,
        keydown: false,
        keyup: false
    };

    private _defaultKeysPrevented: KeyState = new KeyState();

    private readonly _coroutineManager = new CoroutineManagerImpl();
    private readonly cursorStack: CursorStackItem[] = [];

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

    get cursor() {
        return this._canv.style.cursor ?? "default";
    }

    /**
     * Sets the cursor on the canvas. Overwrites the cursor stack, until the stack changes.
     */
    set cursor(value: string) {
        this._canv.style.cursor = value;
    }

    public get ctx() {
        return this._contextFactory.ctx;
    }

    private static drawDebugLine(ctx: CanvasFrameContext, corner: "tl" | "bl" | "tr" | "br", offsetY: number, items: { name: string, message: string }[]) {
        const opts: TextWithBackgroundOptions = {
            text: {font: "12px sans-serif", align: "left", fill: "white"},
            background: {fill: "#0009"},
            padding: new Vector2(4, 4)
        };

        const isRight = corner.endsWith("r");
        const isBottom = corner.startsWith("b");

        let maxHeight = 0;

        let xPos = isRight ? ctx.screenSize.x - 5 : 5;
        const yPos = isBottom ? ctx.screenSize.y - offsetY - 20 : offsetY;

        for (const {name, message} of items) {
            const text = `${name}: ${message}`;
            const {
                width: textWidth,
                actualBoundingBoxAscent,
                actualBoundingBoxDescent
            } = measureText(ctx, text, opts.text);

            maxHeight = Math.max(maxHeight, actualBoundingBoxAscent + actualBoundingBoxDescent);

            if (isRight) xPos -= textWidth;
            textWithBackground(ctx, new Vector2(xPos, yPos), text, opts);

            if (!isRight) xPos += textWidth + 15;
            else xPos -= 15;
        }

        return offsetY + maxHeight + 10;
    }

    public start(frame: CanvasFrameRenderer, renderTrigger: RenderTrigger = RenderTrigger.Always) {
        this._trigger = renderTrigger;

        if (this._trigger === RenderTrigger.Always) {
            this._running = true;
            this.beginRunningFrames(frame);
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
        this.drawCustomDebug(ctx, "tl", {
            FPS: `${ctx.fps.toFixed(1)} / ${(ctx.deltaTime * 1000).toFixed(1)}`,
            M: ctx.mousePos.toString(),
            D: ctx.disposeListeners.length.toFixed(0),
            _C: this._coroutineManager.size.toFixed(0),
            _SC: this._coroutineManager.getLastCheckCount().toFixed(0),
            CN: this._coroutineManager.identifiers.join(", ")
        });
    }

    public drawCustomDebug(ctx: CanvasFrameContext, corner: "tl" | "bl" | "tr" | "br", messages: Record<string, string>) {
        let offsetY = 5;

        let messagesToWrite: { name: string, message: string }[] = [];

        for (const [name, message] of Object.entries(messages)) {
            const sameLine = name.startsWith("_");

            if (!sameLine && messagesToWrite.length > 0) {
                offsetY = Canvas.drawDebugLine(ctx, corner, offsetY, messagesToWrite);
                messagesToWrite.length = 0;
            }

            const displayName = sameLine ? name.substring(1) : name;
            messagesToWrite.push({name: displayName, message});
        }

        if (messagesToWrite.length > 0) {
            Canvas.drawDebugLine(ctx, corner, offsetY, messagesToWrite);
        }
    }

    /**
     * Pushes a cursor onto the cursor stack for the canvas to use, until something else pushes a new cursor,
     * or you pull this cursor off the stack.
     * @param cursor The CSS name of the cursor.
     * @returns The function that pulls the cursor off the stack.
     */
    pushCursor(cursor: string): () => void {
        const index = this.cursorStack.length;

        const item: CursorStackItem = {
            index, cursor
        };

        this.cursorStack.push(item);
        this.updateCursorFromStack();

        return () => {
            this.deleteCursorStackItem(item.index);
            this.updateCursorFromStack();
        };
    }

    private deleteCursorStackItem(index: number) {
        this.cursorStack.splice(index, 1);

        for (const item of this.cursorStack.slice(index)) {
            item.index--;
        }
    }

    private handleFrame(frame: CanvasFrameRenderer) {
        try {
            this._contextFactory.preFrame();

            const ctx = this._contextFactory.createContext();
            frame(ctx);
            this._coroutineManager.frame(ctx);
            ctx.disposeListeners.forEach(listener => listener());

            this._contextFactory.postFrame();
        } catch (err) {
            this._running = false;
            console.error("To prevent overloading the browser with error logs, rendering has been stopped because of:", err);
        }
    }

    private async beginRunningFrames(frame: CanvasFrameRenderer) {
        while (this._running) {
            this.handleFrame(frame);
            await new Promise(yay => requestAnimationFrame(yay));
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

    private updateCursorFromStack() {
        this.cursor = this.cursorStack[0]?.cursor ?? "default";
    }
}
