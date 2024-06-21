import {deref, Dereffable, Getter, SingleEventEmitter, Vector2} from "@experiment-libs/utils";
import iter from "itiriri";
import {
    AwaiterCastable,
    CommonAwaiterOptions,
    CoroutineAwait,
    CoroutineController,
    CoroutineGenerator as GenericCoroutineGenerator,
    CoroutineGeneratorFunction as GenericCoroutineGeneratorFunction,
    CoroutineManager as GenericCoroutineManager,
    NestOptions,
    NextAwait,
    waitUntil as builtInWaitUntil
} from "@alduino/coroutines";
import {PerformanceGraph} from "./PerformanceGraph";

type CanvasFrameRenderer = (ctx: InteractiveCanvasFrameContext) => void;

export type CoroutineGenerator = GenericCoroutineGenerator<InteractiveCanvasFrameContext>;
export type CoroutineGeneratorFunction = GenericCoroutineGeneratorFunction<InteractiveCanvasFrameContext>;
export type CoroutineManager = GenericCoroutineManager<InteractiveCanvasFrameContext>;

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
    renderer: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

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
    ...builtInWaitUntil,

    /**
     * @inheritDoc nest
     */
    nested<T>(identifier: string, awaiters: AwaiterCastable<InteractiveCanvasFrameContext>[], handler: NestOptions<InteractiveCanvasFrameContext, T>["handler"]): NextAwait {
        return builtInWaitUntil.nest({
            identifier,
            awaiters,
            handler
        });
    },

    /**
     * Waits until the first awaiter is complete, or aborts
     * @returns The index of the awaiter that completed first
     * @remarks
     * - If two complete at the same time, will pick the first one passed
     * - If the passed signal is aborted, will return with data `-1`
     */
    oneCompletes(awaiters: AwaiterCastable<InteractiveCanvasFrameContext>[]): NextAwait {
        return builtInWaitUntil.one(awaiters);
    },

    /**
     * Waits until all awaiters are complete, or one aborts. No data is returned.
     */
    allComplete(awaiters: AwaiterCastable<InteractiveCanvasFrameContext>[]): NextAwait {
        return builtInWaitUntil.all(awaiters);
    },

    /**
     * Waits until the left mouse button is pressed
     */
    leftMousePressed(options: MousePressedOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, void> {
        const {collider: colliderRef, invertCollider, ...commonOptions} = options;

        if (invertCollider && !colliderRef) {
            throw new Error("`invertCollider` option requires `collider` to be set");
        }

        return {
            ...commonOptions,
            identifier: "waitUntil.leftMousePressed",
            shouldContinue(ctx: InteractiveCanvasFrameContext) {
                if (!colliderRef) {
                    return {done: ctx.mousePressed.left};
                }

                if (ctx.mousePressed.left) {
                    const collider = deref(colliderRef);
                    const distance = collider.getSignedDistance(ctx.mousePos);

                    if (!invertCollider && distance <= 0) {
                        return {done: true};
                    } else if (invertCollider && distance > 0) {
                        return {done: true};
                    } else {
                        return {done: false};
                    }
                } else {
                    return {done: false};
                }
            }
        };
    },

    /**
     * Waits until the right mouse button is pressed
     */
    rightMousePressed(options: MousePressedOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, void> {
        const {collider: colliderRef, invertCollider, ...commonOptions} = options;

        if (invertCollider && !colliderRef) {
            throw new Error("`invertCollider` option requires `collider` to be set");
        }

        return {
            ...commonOptions,
            identifier: "waitUntil.rightMousePressed",
            shouldContinue(ctx: InteractiveCanvasFrameContext) {
                if (!colliderRef) {
                    return {done: ctx.mousePressed.right};
                }

                if (ctx.mousePressed.right) {
                    const collider = deref(colliderRef);
                    const distance = collider.getSignedDistance(ctx.mousePos);

                    if (!invertCollider && distance <= 0) {
                        return {done: true};
                    } else if (invertCollider && distance > 0) {
                        return {done: true};
                    } else {
                        return {done: false};
                    }
                } else {
                    return {done: false};
                }
            }
        };
    },

    /**
     * Waits until the left mouse button is released
     */
    leftMouseReleased(options: CommonAwaiterOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, void> {
        return {
            ...options,
            identifier: "waitUntil.leftMouseReleased",
            shouldContinue(ctx: InteractiveCanvasFrameContext) {
                return {done: ctx.mouseReleased.left};
            }
        };
    },

    /**
     * Waits until the specified key is pressed
     */
    keyPressed(key: string | string[], options: CommonAwaiterOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, void> {
        const keys = Array.isArray(key) ? key : [key];

        return {
            ...options,
            identifier: "waitUntil.keyPressed",
            shouldContinue(ctx: InteractiveCanvasFrameContext) {
                return {done: keys.some(key => ctx.keyPressed.get(key))};
            }
        };
    },

    /**
     * Waits until the specified key is pressed
     */
    anyKeyPressed(options: AnyKeyPressedOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, string> {
        const {ignore, ...awaiterOptions} = options;

        return {
            ...awaiterOptions,
            identifier: "waitUntil.keyPressed",
            shouldContinue(ctx: InteractiveCanvasFrameContext) {
                const lastUsedKeyPressed = iter(ctx.keyPressed.getActive())
                    .findLast(key => !ignore || !ignore.includes(key));

                if (lastUsedKeyPressed) {
                    return {done: true, data: lastUsedKeyPressed}
                } else {
                    return {done: false};
                }
            }
        };
    },

    /**
     * Waits until the specified key is released
     */
    keyReleased(key: string | string[], options: CommonAwaiterOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, void> {
        const keys = Array.isArray(key) ? key : [key];

        return {
            ...options,
            identifier: "waitUntil.keyReleased",
            shouldContinue(ctx: InteractiveCanvasFrameContext) {
                return {done: keys.some(key => ctx.keyReleased.get(key))};
            }
        };
    },

    /**
     * Waits until the mouse is moved
     */
    mouseMoved(options: CommonAwaiterOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, void> {
        return {
            ...options,
            identifier: "waitUntil.mouseMoved",
            shouldContinue(ctx: InteractiveCanvasFrameContext) {
                return {done: ctx.mouseMoved};
            }
        }
    },

    /**
     * Waits until the mouse enters the shape.
     * @param shape A list of points that creates an outline.
     * @param options Various options to control the awaiter
     */
    mouseEntered(shape: Dereffable<Collider>, options: MouseEnteredOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, void> {
        const {mustStartOutside = false, ...optionsRest} = options;

        let hasBeenOutside = !mustStartOutside;

        return {
            ...optionsRest,
            identifier: "waitUntil.mouseEntered",
            shouldContinue(ctx: InteractiveCanvasFrameContext) {
                const distance = deref(shape).getSignedDistance(ctx.mousePos);

                if (hasBeenOutside) {
                    if (distance <= 0) return {done: true};
                } else if (distance > 0) {
                    hasBeenOutside = true;
                }

                return {done: false};
            }
        };
    },

    /**
     * Waits until the mouse exits the shape.
     * @param shape A list of points that creates an outline.
     * @param options Various options to control the awaiter
     */
    mouseExited(shape: Dereffable<Collider>, options: MouseExitedOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, void> {
        const {minDistance = 0, mustStartInside = false, ...optionsRest} = options;

        let hasBeenInside = !options.mustStartInside;

        return {
            ...optionsRest,
            identifier: "waitUntil.mouseEntered",
            shouldContinue(ctx: InteractiveCanvasFrameContext) {
                const distance = deref(shape).getSignedDistance(ctx.mousePos);

                if (hasBeenInside) {
                    if (distance > minDistance) return {done: true};
                } else if (distance <= minDistance) {
                    hasBeenInside = true;
                }

                return {done: false};
            }
        };
    },

    /**
     * Waits until the user scrolls
     */
    mouseScrolled(options: CommonAwaiterOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, void> {
        return {
            ...options,
            identifier: "waitUntil.mouseScrolled",
            shouldContinue(ctx: InteractiveCanvasFrameContext) {
                return {done: ctx.mouseScroll !== 0};
            }
        };
    },

    /**
     * Waits for the specified number of milliseconds. Note that it will still be aligned to a frame.
     */
    delay(ms: number, options: CommonAwaiterOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, void> {
        let done = false;

        let timeout: number;

        const delay = new Promise<void>(yay => {
            timeout = setTimeout(() => {
                done = true;
                yay();
            }, ms);
        });

        return {
            ...options,
            identifier: "waitUntil.delay",
            delay,
            shouldContinue() {
                return {done};
            }
        };
    },

    /**
     * Waits until the next frame
     */
    nextFrame(options: CommonAwaiterOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, void> {
        return builtInWaitUntil.nextTick(options);
    },

    /**
     * Calls the specified check function each frame, and completes when it returns true
     */
    check(chk: (ctx: InteractiveCanvasFrameContext) => boolean, options: CommonAwaiterOptions = {}): CoroutineAwait<InteractiveCanvasFrameContext, void> {
        return {
            ...options,
            identifier: "waitUntil.check",
            shouldContinue(ctx: InteractiveCanvasFrameContext) {
                return {done: chk(ctx)};
            }
        }
    }
};

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

export class InteractiveCanvas implements Canvas {
    /**
     * The frame rate to target. Zero means the maximum possible.
     */
    targetFrameRate = 0;

    /**
     * When true, coroutines won't run
     */
    pauseCoroutines = false;

    private readonly _canv: HTMLCanvasElement;
    private _running: boolean = false;
    private _hadError = false;
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
    private readonly _coroutineController = new CoroutineController<InteractiveCanvasFrameContext>(id => this.coroutinePerformanceGraph.measure(id));
    private readonly _coroutineManager = this._coroutineController.getManager();
    private readonly cursorStack: CursorStackItem[] = [];
    private readonly framePerformanceGraph = new PerformanceGraph();
    private readonly coroutinePerformanceGraph = new PerformanceGraph();
    private cursorUpdateSchedule = 0;
    private usingManualCoroutineTiming = false;
    private coroutinesRunThisFrame = false;
    private currentFrameContext?: InteractiveCanvasFrameContext;

    #resizeEvent = new SingleEventEmitter<[size: Vector2]>();

    public constructor(element: HTMLCanvasElement) {
        this._canv = element;
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
    }

    get resizeEvent() {
        return this.#resizeEvent.getListener();
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

    private static drawDebugLine(ctx: CanvasFrameContext, corner: "tl" | "bl" | "tr" | "br", offsetY: number, items: {
        name: string,
        message: string
    }[]) {
        const isRight = corner.endsWith("r");
        const isBottom = corner.startsWith("b");

        let maxHeight = 0;

        let xPos = isRight ? ctx.screenSize.x - 5 : 5;
        const yPos = isBottom ? ctx.screenSize.y - offsetY - 20 : offsetY;

        ctx.renderer.font = "12px sans-serif";
        ctx.renderer.textBaseline = "top";
        ctx.renderer.textAlign = "left";

        for (const {name, message} of items) {
            const text = `${name}: ${message}`;
            const textMeasurement = ctx.renderer.measureText(text);
            const textSize = new Vector2(textMeasurement.width, textMeasurement.actualBoundingBoxAscent + textMeasurement.actualBoundingBoxDescent);

            maxHeight = Math.max(maxHeight, textSize.y);

            if (isRight) xPos -= textSize.x;

            ctx.renderer.fillStyle = "#0009";

            if (ctx.renderer.roundRect) {
                ctx.renderer.beginPath();
                ctx.renderer.roundRect(xPos - 4, yPos - 4, textSize.x + 8, textSize.y + 8, 3);
                ctx.renderer.fill();
            } else {
                ctx.renderer.fillRect(xPos - 4, yPos - 4, textSize.x + 8, textSize.y + 8);
            }

            ctx.renderer.fillStyle = "white";
            ctx.renderer.fillText(text, xPos, yPos);

            if (!isRight) xPos += textSize.x + 15;
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
            _DT: ctx.deltaTime.toFixed(3),
            M: ctx.mousePos.toString(),
            D: ctx.disposeListeners.length.toFixed(0),
            _C: this._coroutineController.getCoroutineCount().toFixed(0),
            _SC: this._coroutineController.getLastCheckCount().toFixed(0),
            _DF: this._coroutineController.getDisposedCountThisTick().toFixed(0),
            CN: this._coroutineController.getRegisteredIdentifiers().join(", "),
            FT: this._coroutineController.getActiveFocusTargetIdentifier() === null
                ? "N/A"
                : (this._coroutineController.getActiveFocusTargetIdentifier() || "Unnamed")
        });

        this.framePerformanceGraph.render(this.ctx, Math.round(this.size.x / 3), Math.round(this.size.y / 4), Math.round(this.size.x - this.size.x / 3 - 10), Math.round(this.size.y - this.size.y / 4 - 10));
        this.coroutinePerformanceGraph.render(this.ctx, Math.round(this.size.x / 3), Math.round(this.size.y / 4), 10, Math.round(this.size.y - this.size.y / 4 - 10));
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
        if (this._hadError) {
            const displayMessage = "An error occurred, please check the console.";

            this._contextFactory.ctx.font = "32px sans-serif";

            this._contextFactory.ctx.fillStyle = "#700";
            this._contextFactory.ctx.fillRect(30, this.size.y - 82, this._contextFactory.ctx.measureText(displayMessage).width + 20, 52);

            this._contextFactory.ctx.fillStyle = "white";
            this._contextFactory.ctx.textBaseline = "top";
            this._contextFactory.ctx.fillText(displayMessage, 40, this.size.y - 72);

            this.cursor = "default";

            return;
        }

        try {
            this.framePerformanceGraph.measure("Context pre-frame");
            this._contextFactory.preFrame();

            const ctx = this._contextFactory.createContext();
            this.currentFrameContext = ctx;

            if (!this.usingManualCoroutineTiming) {
                this.framePerformanceGraph.measure("Coroutines");
                this.handleCoroutines();
            }

            this.framePerformanceGraph.measure("Frame callback");
            frame(ctx);
            ctx.disposeListeners.forEach(listener => listener());

            this.framePerformanceGraph.measure("Cursor update");
            if (this.cursorUpdateSchedule === 1) {
                this.updateCursorFromStack();
            }

            if (this.cursorUpdateSchedule) {
                this.cursorUpdateSchedule--;
            }

            this.framePerformanceGraph.measure("Context post-frame");
            this._contextFactory.postFrame();

            this.framePerformanceGraph.commit();

            if (!this.coroutinesRunThisFrame) throw new Error("The coroutine handler was not called in this frame");
            this.coroutinesRunThisFrame = false;
            this.currentFrameContext = undefined;
        } catch (err) {
            this._hadError = true;
            console.error("To prevent overloading the browser with error logs, rendering has been stopped because of:\n", err);
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

        this.#resizeEvent.emit(this.size);
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

        if (!this.pauseCoroutines) {
            this.coroutinePerformanceGraph.measure("(tick)");
            this._coroutineController.tick(this.currentFrameContext);
            this.coroutinePerformanceGraph.commit();
        }
    }
}

const DomOffscreenCanvas = window.OffscreenCanvas;

export class OffscreenCanvas implements Canvas {
    private readonly canvas: globalThis.OffscreenCanvas;
    private readonly ctx: OffscreenCanvasRenderingContext2D;

    constructor(size: Vector2) {
        this.canvas = new DomOffscreenCanvas(size.x, size.y);
        this.ctx = this.canvas.getContext("2d");
    }

    get size() {
        return new Vector2(this.canvas.width, this.canvas.height);
    }

    saveToBlob(type?: string, quality?: number) {
        return this.canvas.convertToBlob({
            type,
            quality
        })
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

/**
 * Type helper for when the `ctx` result in a coroutine is `any`.
 */
export function getContext(ctx: InteractiveCanvasFrameContext): InteractiveCanvasFrameContext {
    return ctx;
}
