import Vector2 from "./Vector2";
import {measureText, textWithBackground, TextWithBackgroundOptions} from "./imgui";
import {getListenerAdder, MiniEventEmitter} from "./utils/MiniEventEmitter";
import {deref, Dereffable, Getter} from "./utils/ref";
import iter from "itiriri";
import consoleMarkdown from "./utils/consoleMarkdown";

type CanvasFrameRenderer = (ctx: InteractiveCanvasFrameContext) => void;

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

interface KeyStateValue {
    state: boolean;
    keyValue: string;
}

class KeyState {
    private readonly _keys: { [key: string]: KeyStateValue } = {};

    static fromEntries(entries: [string, KeyStateValue][]): KeyState {
        const newState = new KeyState();

        for (const [key, state] of entries) {
            newState._keys[key] = state;
        }

        return newState;
    }

    with(key: string, state: boolean, keyValue: string) {
        const newState = this.clone();
        newState._keys[key] = {state, keyValue};
        return newState;
    }

    get(key: string) {
        return this._keys[key]?.state || false;
    }

    getKeyValue(key: string): string | null {
        if (this.get(key)) return this._keys[key].keyValue;
        return null;
    }

    entries(): [string, KeyStateValue][] {
        return Object.entries(this._keys);
    }

    getActive(): string[] {
        return this.entries().filter(v => v[1].state).map(v => v[0]);
    }

    private clone() {
        const newState = new KeyState();
        Object.assign(newState._keys, Object.fromEntries(Object.entries(this._keys)));
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
     * The size in pixels of the canvas
     */
    screenSize: Vector2;

    /**
     * An array of functions that will be called with no parameters when the object is disposed
     */
    disposeListeners: Function[];
}

export interface InteractiveCanvasFrameContext extends CanvasFrameContext {
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
     * The amount that the mouse has scrolled since the last frame.
     * A negative value means the user scrolled down, and positive means the user scrolled up.
     */
    mouseScroll: number;

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
}

class InteractiveCanvasFrameContextFactory {
    private _previousFrameTime: number = -1;
    private _currentFrameTime: number = -1;
    private _mouseState: MouseState = new MouseState(false, false, false);
    private _previousMouseState: MouseState = this._mouseState;
    private _keyState: KeyState = new KeyState();
    private _previousKeyState: KeyState = this._keyState;
    private _mousePos: Vector2 = new Vector2();
    private _previousMousePos: Vector2 = this._mousePos;
    private _scrollIntegral: number = 0;
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
        canv.addEventListener("wheel", this.handleMouseWheel.bind(this));
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
                .map(([key, {state, keyValue}]) => [key, {state: state && !prev.get(key), keyValue}])
        );
    }

    private static fallingEdgeKeys(curr: KeyState, prev: KeyState): KeyState {
        return KeyState.fromEntries(
            curr.entries()
                .map(([key, {state, keyValue}]) => [key, {state: !state && prev.get(key), keyValue}])
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
        this._scrollIntegral = 0;
    }

    createContext(): InteractiveCanvasFrameContext {
        const deltaTime = (this._currentFrameTime - this._previousFrameTime) / 1000;

        return {
            renderer: this._ctx,

            time: performance.now() / 1000 - this._startTime,
            deltaTime: deltaTime,
            fps: 1 / deltaTime,

            screenSize: new Vector2(this._canv.width, this._canv.height),

            mouseDown: this._mouseState,
            mousePressed: InteractiveCanvasFrameContextFactory.risingEdgeMouse(this._mouseState, this._previousMouseState),
            mouseReleased: InteractiveCanvasFrameContextFactory.fallingEdgeMouse(this._mouseState, this._previousMouseState),

            mousePos: this._mousePos,
            mouseMoved: !this._mousePos.equal(this._previousMousePos),
            mouseScroll: this._scrollIntegral,

            keyDown: this._keyState,
            keyPressed: InteractiveCanvasFrameContextFactory.risingEdgeKeys(this._keyState, this._previousKeyState),
            keyReleased: InteractiveCanvasFrameContextFactory.fallingEdgeKeys(this._keyState, this._previousKeyState),

            disposeListeners: []
        };
    }

    createGlobalContext(): CanvasFrameContext {
        return {
            renderer: this.ctx,
            screenSize: new Vector2(this._canv.width, this._canv.height),
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

    private handleMouseWheel(ev: WheelEvent) {
        this._scrollIntegral += ev.deltaY;
    }

    private handleKeyChange(state: boolean, ev: KeyboardEvent) {
        this._keyState = this._keyState.with(ev.code, state, ev.key);
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
    private readonly halfSize: Vector2;
    private readonly offset: Vector2;

    constructor(topLeft: Vector2, bottomRight: Vector2) {
        this.halfSize = bottomRight.subtract(topLeft).divide(2);
        this.offset = topLeft.add(this.halfSize);
    }

    getSignedDistance(point: Vector2): number {
        const samplePosition = point.subtract(this.offset);

        // based on https://www.ronja-tutorials.com/post/034-2d-sdf-basics/#rectangle
        const componentWiseEdgeDistance = samplePosition.abs().subtract(this.halfSize);

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
    shouldContinue(ctx: InteractiveCanvasFrameContext, signal: AbortSignal): CoroutineAwaitResult<T>;
}

interface NormalCoroutineAwait<T> extends CoroutineAwaitBase<T> {
    isNestAwait?: never;

    /**
     * If this is a promise, this awaiter (and its coroutine) will not be evaluated until it resolves. Promise rejection
     * will not be handled.
     *
     * You can use this if you know `shouldContinue()` will return `false` until the promise resolves, as an
     * optimisation if your awaiter is slow (`shouldContinue()` will not be called until the promise resolves).
     */
    delay?: Promise<void>;

    /**
     * The focus target to use to control this awaiter.
     * @see CoroutineManager.createFocusTarget
     */
    focusTarget?: FocusTarget;

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

    focusTarget?: never;

    /**
     * Disposes of all the children `StartCoroutineAwait`ers
     */
    dispose(): void;

    /**
     * Called when the awaiter is first called, with that coroutine's traces as the parameter
     */
    init?(traces: string[], cm: CoroutineManager): void;

    /**
     * Called after the awaiter is last used
     */
    uninit?(): void;
}

interface StartCoroutineAwait extends NormalCoroutineAwait<void> {
    // Used for nested coroutines, stops it accepting updates from the root controller, so that they can be controlled
    // by whatever nested them.
    cancelRootCheck(): void;

    /**
     * Returns true if `cancelRootCheck` has been called.
     */
    isRootCheckCancelled(): boolean;

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

export interface ExoticCoroutineAwait<Symbol extends symbol> {
    marker: Symbol;
}

interface ExoticCoroutineAwait_Dispose extends ExoticCoroutineAwait<typeof disposeFunctionMarker> {
    callback(): void;
}

interface ExoticCoroutineAwait_Options extends ExoticCoroutineAwait<typeof defaultOptionsMarker> {
    options: CommonAwaiterOptions;
}

type ExoticCoroutineAwaitTypes = ExoticCoroutineAwait_Dispose | ExoticCoroutineAwait_Options;

function isExoticCoroutineAwait(awaiter: unknown): awaiter is ExoticCoroutineAwait<symbol> {
    if (!awaiter) return false;
    if (typeof awaiter !== "object") return false;
    const casted = awaiter as ExoticCoroutineAwait<symbol>;
    return typeof casted.marker === "symbol";
}

export type CoroutineAwait<T> = NormalCoroutineAwait<T> | NestCoroutineAwait<T>;

function isNestCoroutineAwait<T>(awaiter: CoroutineAwait<T>): awaiter is NestCoroutineAwait<T> {
    return (awaiter as NestCoroutineAwait<T>).isNestAwait === true;
}

function isStartCoroutineAwait(v: unknown): v is StartCoroutineAwait {
    if (!v) return false;
    return typeof (v as StartCoroutineAwait).cancelRootCheck === "function";
}

export interface CoroutineContext {
    /**
     * The context of the next frame that will be rendered
     */
    ctx: InteractiveCanvasFrameContext;

    /**
     * Whether or not the awaiter was aborted by its signal
     */
    aborted: boolean;

    /**
     * Data returned by the awaiter
     */
    data: unknown;
}

type AwaiterCastable = CoroutineAwait<unknown> | CoroutineGeneratorFunction | StartCoroutineResult;
export type CoroutineGenerator = Generator<AwaiterCastable | ExoticCoroutineAwait<symbol>, void, CoroutineContext>;

function getAwaiter(manager: CoroutineManager, awaiterCastable: AwaiterCastable): CoroutineAwait<unknown> {
    if (typeof awaiterCastable === "function") {
        return manager.startCoroutine(awaiterCastable).awaiter;
    } else if (isStartCoroutineResult(awaiterCastable)) {
        return awaiterCastable.awaiter;
    } else {
        return awaiterCastable;
    }
}

export type NestHandler<T> = (results: CoroutineAwaitResult<unknown>[]) => CoroutineAwaitResult<T>;
export type NestErrorHandler<T> = (error: Error, trace: string[], failedIndex: number) => CoroutineAwaitResult<T> | false;

export interface CommonAwaiterOptions {
    /**
     * The focus target to use to control this awaiter.
     * @see CoroutineManager.createFocusTarget
     */
    focusTarget?: FocusTarget;
}

export interface MouseEnteredOptions extends CommonAwaiterOptions {
    /**
     * When true, the mouse has to have been outside before the awaiter can return.
     */
    mustStartOutside?: boolean;
}

export interface MouseExitedOptions extends CommonAwaiterOptions {
    /**
     * When true, the mouse has to have been inside before the awaiter can return.
     */
    mustStartInside?: boolean;

    /**
     * The distance away from the collider before the awaiter can return.
     */
    minDistance?: number;
}

export interface MousePressedOptions extends CommonAwaiterOptions {
    /**
     * When set, only returns if user presses the mouse while it's inside the collider.
     */
    collider?: Collider | Getter<Collider>;

    /**
     * When true, only returns if the user presses the mouse while it's _outside_ the collider, instead of inside it.
     *
     * Requries the `collider` option.
     */
    invertCollider?: boolean;
}

export interface AnyKeyPressedOptions extends CommonAwaiterOptions {
    /**
     * A list of keys to ignore
     */
    ignore?: readonly string[];
}

/**
 * Various coroutine awaiters
 *
 * @remarks You can also make your own awaiter - it just needs to be some function that returns a `CoroutineAwait`.
 */
export const waitUntil = {
    /**
     * Passes the result of each awaiter to `handler`, which reduces them down to one result.
     *
     * This function's purpose is to be wrapped by other awaiters to allow nesting of coroutines. Note that this
     * function MUST be used for situations where a nested coroutine is possible (like `.one`, `.all`, etc),
     * as it can handle edge cases with coroutine awaiters that cannot be handled in third party code.
     *
     * @param identifier - Identifies the awaiter, used for debugging
     * @param awaiters - List of awaiters to handle
     * @param handler - Function that takes in the results, in order of passing, and reduces them down to a single one. Called every frame.
     * @param errorHandler - Called when a child awaiter throws an error, similar to `catch`. Return a result if it was handled, or false to propagate the error up.
     */
    nested<T>(identifier: string, awaiters: AwaiterCastable[], handler: NestHandler<T>, errorHandler?: NestErrorHandler<T>): CoroutineAwait<T> {
        if (awaiters.length === 0) throw new Error("Must have at least one awaiter");

        const castedAwaiters = new Map<AwaiterCastable, CoroutineAwait<unknown>>();
        const coroutineAwaiters = new Set<StartCoroutineAwait>();

        let traces: string[] = [];
        let cm: CoroutineManager;

        for (const awaiter of awaiters) {
            if (isStartCoroutineAwait(awaiter)) {
                awaiter.cancelRootCheck();
                coroutineAwaiters.add(awaiter);
            }
        }

        return {
            isNestAwait: true,
            identifier,
            init(initTraces: string[], coroutineManager: CoroutineManager) {
                traces = initTraces;
                cm = coroutineManager;
            },
            dispose() {
                for (const coroutineAwaiter of coroutineAwaiters) {
                    coroutineAwaiter.dispose();
                }
            },
            shouldContinue(ctx: InteractiveCanvasFrameContext, signal: AbortSignal): CoroutineAwaitResult<T> {
                const results = new Array<CoroutineAwaitResult<unknown>>(awaiters.length);

                let lastTraceAwaiter: CoroutineAwait<unknown>, lastTraceIndex: number;
                try {
                    for (let i = 0; i < awaiters.length; i++) {
                        const castable = awaiters[i];

                        // can't do this outside as `cm` isn't set yet
                        const awaiter = castedAwaiters.get(castable) ?? getAwaiter(cm, castable);
                        castedAwaiters.set(castable, awaiter);

                        if (isStartCoroutineAwait(awaiter) && !coroutineAwaiters.has(awaiter)) {
                            awaiter.cancelRootCheck();
                            coroutineAwaiters.add(awaiter);
                        }

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
        };
    },

    /**
     * Waits until the first awaiter is complete, or aborts
     * @returns The index of the awaiter that completed first
     * @remarks
     * - If two complete at the same time, will pick the first one passed
     * - If the passed signal is aborted, will return with data `-1`
     */
    one(awaiters: AwaiterCastable[], signal?: AbortSignal): CoroutineAwait<number> {
        return waitUntil.nested("waitUntil.one", awaiters, results => {
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
    all(awaiters: AwaiterCastable[], signal?: AbortSignal): CoroutineAwait<number> {
        return waitUntil.nested("waitUntil.all", awaiters, results => {
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
    leftMousePressed(options: MousePressedOptions = {}): CoroutineAwait<void> {
        const {collider: colliderRef, invertCollider, ...commonOptions} = options;

        if (invertCollider && !colliderRef) {
            throw new Error("`invertCollider` option requires `collider` to be set");
        }

        return {
            ...commonOptions,
            identifier: "waitUntil.leftMousePressed",
            shouldContinue(ctx: InteractiveCanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};

                if (!colliderRef) {
                    return {state: ctx.mousePressed.left};
                }

                if (ctx.mousePressed.left) {
                    const collider = deref(colliderRef);
                    const distance = collider.getSignedDistance(ctx.mousePos);

                    if (!invertCollider && distance <= 0) {
                        return {state: true};
                    } else if (invertCollider && distance > 0) {
                        return {state: true};
                    } else {
                        return {state: false};
                    }
                } else {
                    return {state: false};
                }
            }
        };
    },

    /**
     * Waits until the right mouse button is pressed
     */
    rightMousePressed(options: MousePressedOptions = {}): CoroutineAwait<void> {
        const {collider: colliderRef, invertCollider, ...commonOptions} = options;

        if (invertCollider && !colliderRef) {
            throw new Error("`invertCollider` option requires `collider` to be set");
        }

        return {
            ...commonOptions,
            identifier: "waitUntil.rightMousePressed",
            shouldContinue(ctx: InteractiveCanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};

                if (!colliderRef) {
                    return {state: ctx.mousePressed.right};
                }

                if (ctx.mousePressed.right) {
                    const collider = deref(colliderRef);
                    const distance = collider.getSignedDistance(ctx.mousePos);

                    if (!invertCollider && distance <= 0) {
                        return {state: true};
                    } else if (invertCollider && distance > 0) {
                        return {state: true};
                    } else {
                        return {state: false};
                    }
                } else {
                    return {state: false};
                }
            }
        };
    },

    /**
     * Waits until the left mouse button is released
     */
    leftMouseReleased(options: CommonAwaiterOptions = {}): CoroutineAwait<void> {
        return {
            ...options,
            identifier: "waitUntil.leftMouseReleased",
            shouldContinue(ctx: InteractiveCanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};
                return {state: ctx.mouseReleased.left};
            }
        };
    },

    /**
     * Waits until the specified key is pressed
     */
    keyPressed(key: string | string[], options: CommonAwaiterOptions = {}): CoroutineAwait<void> {
        const keys = Array.isArray(key) ? key : [key];

        return {
            ...options,
            identifier: "waitUntil.keyPressed",
            shouldContinue(ctx: InteractiveCanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};
                return {state: keys.some(key => ctx.keyPressed.get(key))};
            }
        };
    },

    /**
     * Waits until the specified key is pressed
     */
    anyKeyPressed(options: AnyKeyPressedOptions = {}): CoroutineAwait<string> {
        const {ignore, ...awaiterOptions} = options;

        return {
            ...awaiterOptions,
            identifier: "waitUntil.keyPressed",
            shouldContinue(ctx: InteractiveCanvasFrameContext) {
                const lastUsedKeyPressed = iter(ctx.keyPressed.getActive())
                    .findLast(key => !ignore || !ignore.includes(key));

                if (lastUsedKeyPressed) {
                    return {state: true, data: lastUsedKeyPressed}
                } else {
                    return {state: false};
                }
            }
        };
    },

    /**
     * Waits until the specified key is released
     */
    keyReleased(key: string | string[], options: CommonAwaiterOptions = {}): CoroutineAwait<void> {
        const keys = Array.isArray(key) ? key : [key];

        return {
            ...options,
            identifier: "waitUntil.keyReleased",
            shouldContinue(ctx: InteractiveCanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};
                return {state: keys.some(key => ctx.keyReleased.get(key))};
            }
        };
    },

    /**
     * Waits until the mouse is moved
     */
    mouseMoved(options: CommonAwaiterOptions = {}): CoroutineAwait<void> {
        return {
            ...options,
            identifier: "waitUntil.mouseMoved",
            shouldContinue(ctx: InteractiveCanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};
                return {state: ctx.mouseMoved};
            }
        }
    },

    /**
     * Waits until the mouse enters the shape.
     * @param shape A list of points that creates an outline.
     * @param options Various options to control the awaiter
     */
    mouseEntered(shape: Dereffable<Collider>, options: MouseEnteredOptions = {}): CoroutineAwait<void> {
        const {mustStartOutside = false, ...optionsRest} = options;

        let hasBeenOutside = !mustStartOutside;

        return {
            ...optionsRest,
            identifier: "waitUntil.mouseEntered",
            shouldContinue(ctx: InteractiveCanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};

                const distance = deref(shape).getSignedDistance(ctx.mousePos);

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
     * @param options Various options to control the awaiter
     */
    mouseExited(shape: Dereffable<Collider>, options: MouseExitedOptions = {}): CoroutineAwait<void> {
        const {minDistance = 0, mustStartInside = false, ...optionsRest} = options;

        let hasBeenInside = !options.mustStartInside;

        return {
            ...optionsRest,
            identifier: "waitUntil.mouseEntered",
            shouldContinue(ctx: InteractiveCanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};

                const distance = deref(shape).getSignedDistance(ctx.mousePos);

                if (hasBeenInside) {
                    if (distance > minDistance) return {state: true};
                } else if (distance <= minDistance) {
                    hasBeenInside = true;
                }

                return {state: false};
            }
        };
    },

    /**
     * Waits until the user scrolls
     */
    mouseScrolled(options: CommonAwaiterOptions = {}): CoroutineAwait<void> {
        return {
            ...options,
            identifier: "waitUntil.mouseScrolled",
            shouldContinue(ctx: InteractiveCanvasFrameContext, signal: AbortSignal) {
                if (signal.aborted) return {state: "aborted"};

                return {state: ctx.mouseScroll !== 0};
            }
        };
    },

    /**
     * Waits for the specified number of milliseconds. Note that it will still be aligned to a frame.
     */
    delay(ms: number, options: CommonAwaiterOptions = {}): CoroutineAwait<void> {
        let state = false;

        let timeout: NodeJS.Timeout;

        const delay = new Promise<void>(yay => {
            timeout = setTimeout(() => {
                state = true;
                yay();
            }, ms);
        });

        return {
            ...options,
            identifier: "waitUntil.delay",
            delay,
            shouldContinue() {
                return {state};
            }
        };
    },

    /**
     * Waits until the next frame
     */
    nextFrame(options: CommonAwaiterOptions = {}): CoroutineAwait<void> {
        return {
            ...options,
            identifier: "waitUntil.nextFrame",
            shouldContinue() {
                return {state: true};
            }
        }
    },

    /**
     * Calls the specified check function each frame, and completes when it returns true
     */
    check(chk: (ctx: InteractiveCanvasFrameContext) => boolean, options: CommonAwaiterOptions = {}): CoroutineAwait<void> {
        return {
            ...options,
            identifier: "waitUntil.check",
            shouldContinue(ctx: InteractiveCanvasFrameContext, signal: AbortSignal) {
                if (signal?.aborted) return {state: "aborted"};
                return {state: chk(ctx)};
            }
        }
    }
};

export interface StartCoroutineResult {
    awaiter: CoroutineAwait<void>;
    abortController: AbortController;

    /**
     * Stops and disposes of the coroutine (always at a `yield` statement).
     * @remarks Any dispose handlers run immediately and synchronously, not on the next frame.
     */
    stop(): void;
}

function isStartCoroutineResult(test: unknown): test is StartCoroutineResult {
    if (!test || typeof test !== "object") return false;

    const casted = test as StartCoroutineResult;
    return casted.abortController instanceof AbortController && typeof casted.awaiter === "object";
}

const disposeFunctionMarker = Symbol("exotic:hookDispose()");
const defaultOptionsMarker = Symbol("exotic:hookOptions()");

const focusTargetOptionsKey = Symbol("options");

export interface FocusTargetOptions {
    /**
     * A human-readable name for the focus target for debugging.
     */
    displayName?: string;

    /**
     * Requires the focus target to actually be focused before allowing coroutines to run,
     * instead of the default behaviour of also allowing them to run when nothing is focused.
     */
    require?: boolean;
}

export interface FocusTarget {
    [focusTargetOptionsKey]: FocusTargetOptions;

    /**
     * Activates this focus target, allowing its coroutines to run.
     * Deactivates every other focus target.
     */
    focus(): void;

    /**
     * Deactivates this focus target, allowing every coroutine to run.
     */
    blur(): void;
}

export interface CoroutineManager {
    /**
     * Begins a new coroutine. Code runs before each frame is rendered.
     *
     * - The point of this method is to create a function that can have delays that depend on what is happening
     *   inside the canvas, e.g. waiting for a mouse button to be pressed, or a key moved. There is various
     *   methods to do this inside the `waitFor` export, which you can `yield` inside a generator function passed here.
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
     *   methods to do this inside the `waitFor` export, which you can `yield` inside a generator function passed here.
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

    /**
     * Focus targets can be used to make sure only one coroutine can use awaiters at any time.
     * If you pass a focus target to an awaiter, that awaiter can never run unless the passed focus target is the
     * currently active one, or no focus targets are active.
     *
     * Call the `.focus()` method on a focus target to set it as the currently active one.
     * Doing this makes all other focus targets become inactive.
     *
     * Calling `.blur()` stops the target being active.
     * Until you activate another focus target, every awaiter can run.
     */
    createFocusTarget(options?: FocusTargetOptions): FocusTarget;

    /**
     * Creates a focus target that is active when any one of the passed sources are active.
     *
     * @remarks Calling `.focus()` on the result throws an error, as that method doesn't make senses here.
     */
    createCombinedFocusTarget(...sources: readonly FocusTarget[]): FocusTarget;

    /**
     * Returns true when no focus targets are focused.
     */
    isFocusGlobal(): boolean;

    /**
     * The callback supplied to this function will be called when the coroutine is about to be disposed.
     * This will happen during one of the `yield` statements.
     * That `yield` statement will never complete.
     */
    hookDispose(callback: () => void): ExoticCoroutineAwait<typeof disposeFunctionMarker>;

    /**
     * This hook sets the default awaiter options for any awaiter calls after it in one coroutine.
     * Calling multiple times merges the options, with later calls overwriting the earlier calls' values.
     */
    hookOptions(options: CommonAwaiterOptions): ExoticCoroutineAwait<typeof defaultOptionsMarker>;
}

class FocusTargetManager {
    #combinedFocusTargets = new WeakMap<FocusTarget, readonly FocusTarget[]>();
    #currentFocusTarget: FocusTarget | null = null;

    createFocusTarget(options: FocusTargetOptions = {}): FocusTarget {
        const target: FocusTarget = {
            focus: () => this.#focus(target),
            blur: () => this.#blur(target),
            [focusTargetOptionsKey]: options
        };

        return target;
    };

    createCombinedFocusTarget(sources: readonly FocusTarget[]): FocusTarget {
        const target: FocusTarget = {
            focus() {
                throw new Error("Cannot focus a combined focus target");
            },
            blur: () => this.#blur(target),
            [focusTargetOptionsKey]: {}
        };

        this.#combinedFocusTargets.set(target, sources);

        return target;
    }

    isFocused(target: FocusTarget) {
        const combined = this.#combinedFocusTargets.get(target);

        if (combined) {
            return combined.some(target => this.isFocused(target));
        } else {
            const options = target[focusTargetOptionsKey];

            if (!options.require && this.#currentFocusTarget === null) return true;
            return this.#currentFocusTarget === target;
        }
    }

    getActiveFocusTargetDisplayName(): null | undefined | string {
        if (this.#currentFocusTarget === null) return null;
        return this.#currentFocusTarget[focusTargetOptionsKey].displayName;
    }

    hasActiveFocusTarget() {
        return !!this.#currentFocusTarget;
    }

    #focus(target: FocusTarget) {
        this.#currentFocusTarget = target;
    }

    #blur(target: FocusTarget) {
        if (this.#currentFocusTarget !== target) return;
        this.#currentFocusTarget = null;
    }
}

interface StatefulCoroutine {
    defaultOptions: CommonAwaiterOptions;
    disposeHandlers: Set<() => void>;
    coroutine: CoroutineGenerator;
    identifier: string;
    traces: string[];
    abortSignal: AbortSignal;
    rootCheckDisabled: boolean;
    waitingForDelay: boolean;
    lastResult?: CoroutineAwait<unknown>;
    traceShiftCount: number;
    lastWaitingPromise?: Promise<void>;
    disposalStack?: Error;

    onComplete(): void;
}

export type CoroutineGeneratorFunction = (signal: AbortSignal) => CoroutineGenerator;

function generateHash() {
    const dataArray = new Uint8Array(3);
    crypto.getRandomValues(dataArray);
    return Array.from(dataArray).map(el => el.toString(16).padStart(2, "0")).join("");
}

function getCoroutineName(baseName: string) {
    if (/handle[A-Z]/.test(baseName)) {
        const name = baseName.substring("handle".length);
        return name[0].toLowerCase() + name.substring(1);
    }

    return baseName;
}

class CoroutineManagerImpl implements CoroutineManager {
    private readonly _coroutines = new Set<StatefulCoroutine>();
    private checkCount = 0;
    private lastCheckCount = 0;
    private disposalCount = 0;
    #focusTargetManager = new FocusTargetManager();

    get size() {
        return this._coroutines.size;
    }

    get identifiers() {
        return Array.from(this._coroutines).map(item => item.identifier);
    }

    /**
     * The number of disposal handlers that need to be called eventually.
     */
    get waitingDisposalCount() {
        return Array.from(this._coroutines)
            .reduce((prev, curr) => prev + curr.disposeHandlers.size, 0);
    }

    /**
     * The number of disposal handlers that were called in this frame.
     */
    get thisFrameDisposalCount() {
        return this.disposalCount;
    }

    get currentFocusTargetDisplayName() {
        return this.#focusTargetManager.getActiveFocusTargetDisplayName();
    }

    isFocusGlobal() {
        return !this.#focusTargetManager.hasActiveFocusTarget();
    }

    getLastCheckCount() {
        return this.lastCheckCount;
    }

    frame(ctx: InteractiveCanvasFrameContext) {
        this.lastCheckCount = this.checkCount;
        this.checkCount = 0;
        this.disposalCount = 0;

        for (const state of this._coroutines) {
            if (state.rootCheckDisabled) continue;
            this.handleCoroutine(ctx, state);
        }
    }

    startCoroutine(identifier_fn: string | CoroutineGeneratorFunction, fn_opt?: CoroutineGeneratorFunction): StartCoroutineResult {
        const identifier = typeof identifier_fn === "string" ? identifier_fn : getCoroutineName(identifier_fn.name) || `CR_${generateHash()}`;
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
            defaultOptions: {},
            onComplete() {
                isComplete = true
            },
            disposeHandlers: new Set()
        };

        this._coroutines.add(state);

        const that = this;
        const awaiter: StartCoroutineAwait = {
            identifier,
            shouldContinue(ctx) {
                if (state.disposalStack) {
                    // the coroutine has already been disposed - this shouldn't really happen but we will just ignore it
                    isComplete = true;
                } else {
                    that.handleCoroutine(ctx, state);
                }

                return {
                    state: isComplete ? abortController.signal.aborted ? "aborted" : true : false
                }
            },
            cancelRootCheck() {
                state.rootCheckDisabled = true;
            },
            isRootCheckCancelled() {
                return state.rootCheckDisabled;
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
            awaiter,
            stop: () => this.disposeCoroutine(state)
        };
    }

    public createFocusTarget(options?: FocusTargetOptions) {
        return this.#focusTargetManager.createFocusTarget(options);
    }

    public createCombinedFocusTarget(...sources): FocusTarget {
        return this.#focusTargetManager.createCombinedFocusTarget(sources);
    }

    public hookDispose(callback: () => void): ExoticCoroutineAwait_Dispose {
        return {
            marker: disposeFunctionMarker,
            callback
        };
    }

    public hookOptions(options: CommonAwaiterOptions): ExoticCoroutineAwait_Options {
        return {
            marker: defaultOptionsMarker,
            options
        };
    }

    private disposeCoroutine(state: StatefulCoroutine) {
        if (!this._coroutines.has(state)) {
            throw new Error(`Attempted to dispose a coroutine that has already been disposed: \`${state.identifier}\``, {
                cause: state.disposalStack
            });
        }

        state.disposalStack = new Error(`Coroutine "${state.identifier}" disposed`);

        state.disposeHandlers.forEach(handler => handler());
        this.disposalCount += state.disposeHandlers.size;

        state.coroutine.return();
        this._coroutines.delete(state);
        state.onComplete();
    }

    private handleCoroutine(ctx: InteractiveCanvasFrameContext, state: StatefulCoroutine) {
        if (state.disposalStack) {
            throw new Error(`Handling disposed coroutine \`${state.identifier}\``);
        }

        if (state.waitingForDelay) return;

        if (state.lastResult?.delay && state.lastResult.delay !== state.lastWaitingPromise) {
            state.waitingForDelay = true;
            const promise = state.lastResult.delay;
            state.lastResult.delay.then(() => {
                if (state.lastResult.delay !== promise) return;
                state.lastWaitingPromise = promise;
                return state.waitingForDelay = false;
            });
            return;
        }

        if (state.lastResult?.focusTarget && !this.#focusTargetManager.isFocused(state.lastResult.focusTarget)) {
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
                    let res = state.coroutine.next({ctx, aborted, data});
                    done = res.done;

                    while (res.value && isExoticCoroutineAwait(res.value)) {
                        const value = res.value as ExoticCoroutineAwaitTypes;

                        switch (value.marker) {
                            case disposeFunctionMarker:
                                state.disposeHandlers.add(value.callback);
                                break;
                            case defaultOptionsMarker:
                                Object.assign(state.defaultOptions, value.options);
                                break;
                            default:
                                throw new Error(`Invalid marker "${(value as { marker: symbol }).marker.description}". This is a bug.`);
                        }

                        res = state.coroutine.next({ctx, aborted, data});
                    }

                    if (process.env.NODE_ENV !== "production" && isStartCoroutineResult(res.value)) {
                        const awaiter = res.value.awaiter as StartCoroutineAwait;

                        if (!awaiter.isRootCheckCancelled()) {
                            console.warn(...consoleMarkdown(`
                                Coroutine \`${state.identifier}\` nested the coroutine \`${awaiter.identifier}\` without using a proper nesting awaiter.
                                Instead of yielding the result of \`cm.startCoroutine\`, yield the coroutine function directly.
                            `));
                        }
                    }

                    value = res.value ? getAwaiter(this, res.value as AwaiterCastable) : undefined;
                } finally {
                    if (state.lastResult) {
                        state.traces.splice(0, state.traceShiftCount);
                        state.traceShiftCount = 0;
                    }
                }

                if (done) {
                    this.disposeCoroutine(state);
                } else {
                    if (isNestCoroutineAwait(value)) {
                        value.init?.(state.traces, this);
                        state.disposeHandlers.add(value.dispose);
                    } else {
                        value.init?.(state.abortSignal);
                    }

                    state.lastResult = {...state.defaultOptions, ...value} as CoroutineAwait<unknown>;
                }
            } else if (state.lastResult) {
                state.lastResult.uninit?.();
                state.traces.splice(0, state.traceShiftCount);
                state.traceShiftCount = 0;

                if (isNestCoroutineAwait(state.lastResult)) {
                    this.disposalCount++;
                    state.disposeHandlers.delete(state.lastResult.dispose);
                }
            }
        } catch (err) {
            if (!state.rootCheckDisabled) {
                const stack = state.traces.map(l => `  in ${l}`).join("\n");
                err.message += "\n" + stack;
            }

            console.log("Coroutine errored:", state.identifier, state.traces);

            if (!state.disposalStack) {
                this.disposeCoroutine(state);
            }

            throw err;
        }
    }
}

export interface Canvas {
    get size(): Vector2;
}

interface CursorStackItem {
    index: number;
    cursor: string;
}

type InteractiveCanvasEvents = {
    resize: [Vector2];
}

export default class InteractiveCanvas implements Canvas {
    /**
     * The frame rate to target. Zero means the maximum possible.
     */
    targetFrameRate = 0;

    /**
     * When true, coroutines won't run
     */
    pauseCoroutines = false;

    private readonly _canv: HTMLCanvasElement;
    private readonly eventEmitter = new MiniEventEmitter<InteractiveCanvasEvents>();
    public readonly addListener = getListenerAdder(this.eventEmitter);
    private _running: boolean = false;
    private _trigger: RenderTrigger = RenderTrigger.Always;
    private _contextFactory: InteractiveCanvasFrameContextFactory;
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
    private cursorUpdateSchedule = 0;
    private usingManualCoroutineTiming = false;
    private coroutinesRunThisFrame = false;
    private currentFrameContext?: InteractiveCanvasFrameContext;

    public constructor(id: string) {
        this._canv = document.getElementById(id) as HTMLCanvasElement;
        this._contextFactory = new InteractiveCanvasFrameContextFactory(this._canv);

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

    get size() {
        return new Vector2(this._canv.width, this._canv.height);
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

    get context() {
        return this._contextFactory.createGlobalContext();
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

    /**
     * Stars each frame rendering.
     * @param frame A function that can render to the canvas, called once per frame.
     * @param renderTrigger When set, the render function is only called when the specified events happen.
     *
     * ## Frame Actions Order
     * 1. Context setup / creation
     * 2. Coroutines
     * 3. `frame` handler
     * 4. Context disposal handlers
     * 5. Scheduled cursor updates
     * 6. Context cleanup
     */
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
        this._defaultKeysPrevented = this._defaultKeysPrevented.with(key, prevent, null);
    }

    public getCoroutineManager(): CoroutineManager {
        return this._coroutineManager;
    }

    public drawDebug(ctx: InteractiveCanvasFrameContext) {
        this.drawCustomDebug(ctx, "tl", {
            FPS: `${ctx.fps.toFixed(1)} / ${(ctx.deltaTime * 1000).toFixed(1)}`,
            M: ctx.mousePos.toString(),
            D: ctx.disposeListeners.length.toFixed(0),
            _C: this._coroutineManager.size.toFixed(0),
            _SC: this._coroutineManager.getLastCheckCount().toFixed(0),
            DW: this._coroutineManager.waitingDisposalCount.toFixed(0),
            _DF: this._coroutineManager.thisFrameDisposalCount.toFixed(0),
            CN: this._coroutineManager.identifiers.join(", "),
            FT: this._coroutineManager.currentFocusTargetDisplayName === null
                ? "N/A"
                : (this._coroutineManager.currentFocusTargetDisplayName || "Unnamed")
        });
    }

    public drawCustomDebug(ctx: CanvasFrameContext, corner: "tl" | "bl" | "tr" | "br", messages: Record<string, string>) {
        let offsetY = 5;

        let messagesToWrite: { name: string, message: string }[] = [];

        for (const [name, message] of Object.entries(messages)) {
            const sameLine = name.startsWith("_");

            if (!sameLine && messagesToWrite.length > 0) {
                offsetY = InteractiveCanvas.drawDebugLine(ctx, corner, offsetY, messagesToWrite);
                messagesToWrite.length = 0;
            }

            const displayName = sameLine ? name.substring(1) : name;
            messagesToWrite.push({name: displayName, message});
        }

        if (messagesToWrite.length > 0) {
            InteractiveCanvas.drawDebugLine(ctx, corner, offsetY, messagesToWrite);
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
        this.scheduleUrgentCursorUpdate();

        return () => {
            if (item.index === -1) return;
            this.deleteCursorStackItem(item.index);
            this.scheduleNonUrgentCursorUpdate();
        };
    }

    useManualCoroutineTiming() {
        this.usingManualCoroutineTiming = true;

        return () => {
            if (!this.usingManualCoroutineTiming) {
                throw new Error("The coroutine handler was called after manual coroutine timing was disabled");
            }

            this.handleCoroutines();
        };
    }

    useAutomaticCoroutineTiming() {
        this.usingManualCoroutineTiming = false;
    }

    private deleteCursorStackItem(index: number) {
        const [removedCursor] = this.cursorStack.splice(index, 1);
        removedCursor.index = -1;

        for (const item of this.cursorStack.slice(index)) {
            item.index--;
        }
    }

    private handleFrame(frame: CanvasFrameRenderer) {
        try {
            this._contextFactory.preFrame();

            const ctx = this._contextFactory.createContext();
            this.currentFrameContext = ctx;
            if (!this.usingManualCoroutineTiming) this.handleCoroutines();
            frame(ctx);
            ctx.disposeListeners.forEach(listener => listener());

            if (this.cursorUpdateSchedule === 1) {
                this.updateCursorFromStack();
            }

            if (this.cursorUpdateSchedule) {
                this.cursorUpdateSchedule--;
            }

            this._contextFactory.postFrame();

            if (!this.coroutinesRunThisFrame) throw new Error("The coroutine handler was not called in this frame");
            this.coroutinesRunThisFrame = false;
            this.currentFrameContext = undefined;
        } catch (err) {
            this._running = false;
            console.error("To prevent overloading the browser with error logs, rendering has been stopped because of:\n", err);

            const displayMessage = "An error occurred, please check the console.";

            this._contextFactory.ctx.font = "32px sans-serif";

            this._contextFactory.ctx.fillStyle = "#700";
            this._contextFactory.ctx.fillRect(30, this.size.y - 82, this._contextFactory.ctx.measureText(displayMessage).width + 20, 52);

            this._contextFactory.ctx.fillStyle = "white";
            this._contextFactory.ctx.textBaseline = "top";
            this._contextFactory.ctx.fillText(displayMessage, 40, this.size.y - 72);
        }
    }

    private async beginRunningFrames(frame: CanvasFrameRenderer) {
        while (this._running) {
            let thisFrameStartTime = performance.now();

            this.handleFrame(frame);
            await new Promise(yay => requestAnimationFrame(yay));

            if (this.targetFrameRate !== 0) {
                let nextFrameStartTime = performance.now();
                const expectedFrameDuration = 1000 / this.targetFrameRate;
                const actualFrameDuration = nextFrameStartTime - thisFrameStartTime;
                const frameDurationDiff = expectedFrameDuration - actualFrameDuration;

                if (frameDurationDiff > 0) {
                    await new Promise(yay => setTimeout(yay, frameDurationDiff));
                }
            }
        }
    }

    private handleResize() {
        const parent = this._canv.parentElement;
        if (!parent) return;

        const parentRect = parent.getBoundingClientRect();
        this._canv.width = parentRect.width;
        this._canv.height = parentRect.height;

        this.eventEmitter.emit("resize", this.size);
    }

    private handleTrigger(cause: RenderTrigger) {
        if (this._trigger & cause) this.handleFrame(this._callback);
    }

    private maybePreventKey(ev: KeyboardEvent) {
        if (this._defaultKeysPrevented.get(ev.key)) ev.preventDefault();
    }

    /**
     * Synchronously updates the cursor to be the latest on the stack.
     * Don't use this method—use one of the asynchronous methods instead.
     */
    private updateCursorFromStack() {
        this.cursor = this.cursorStack.at(-1)?.cursor ?? "default";
    }

    /**
     * Schedules the cursor to update on the next fram
     */
    private scheduleUrgentCursorUpdate() {
        this.scheduleCursorUpdate(0);
    }

    /**
     * Schedules the cursor to update in a few frames
     */
    private scheduleNonUrgentCursorUpdate() {
        this.scheduleCursorUpdate(2);
    }

    /**
     * Schedules the cursor to update in the specified number of frames.
     * Cursor updates always align with a frame.
     */
    private scheduleCursorUpdate(frames: number) {
        if (!this.cursorUpdateSchedule) this.cursorUpdateSchedule = frames + 1;
        else this.cursorUpdateSchedule = Math.min(this.cursorUpdateSchedule, frames + 1);
    }

    private handleCoroutines() {
        if (!this.currentFrameContext) throw new Error("The coroutine handler was called outside of the frame loop");
        if (this.coroutinesRunThisFrame) throw new Error("The coroutine handler was called twice in one frame");
        this.coroutinesRunThisFrame = true;
        if (!this.pauseCoroutines) this._coroutineManager.frame(this.currentFrameContext);
    }
}

export class OffscreenCanvas implements Canvas {
    private readonly canvas = document.createElement("canvas");
    private readonly ctx = this.canvas.getContext("2d");

    constructor(size: Vector2) {
        this.setSizeAndClear(size);
    }

    get size() {
        return new Vector2(this.canvas.width, this.canvas.height);
    }

    saveToBlob(type?: string, quality?: number) {
        return new Promise<Blob>(yay => this.canvas.toBlob(yay, type, quality));
    }

    setSizeAndClear(newSize: Vector2) {
        this.canvas.width = newSize.x;
        this.canvas.height = newSize.y;
    }

    getContext(): CanvasFrameContext {
        return {
            renderer: this.ctx,
            screenSize: this.size,
            disposeListeners: []
        };
    }

    getCanvasElement() {
        return this.canvas;
    }
}
