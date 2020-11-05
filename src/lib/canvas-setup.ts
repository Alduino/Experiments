import Vector2 from "./Vector2";

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
        console.debug("Key", key, "changed state to", state ? "pressed" : "released");
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

    private handleKeyChange(ev: KeyboardEvent, state: boolean) {
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

    public get ctx() {
        return this._contextFactory.ctx;
    }

    private handleFrame(frame: CanvasFrameRenderer) {
        if (this._running) requestAnimationFrame(this.handleFrame.bind(this, frame));

        this._contextFactory.preFrame();

        const ctx = this._contextFactory.createContext();
        frame(ctx);
        ctx.disposeListeners.forEach(listener => listener());

        this._contextFactory.postFrame();
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

        Object.keys(this._defaultPrevented).map(ev => {
            window.addEventListener(ev, event => {
                if (this._defaultPrevented[ev]) event.preventDefault();
            });
        });
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
}
