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
    private static risingEdge(curr: MouseState, prev: MouseState): MouseState {
        return new MouseState(
            curr.left && !prev.left,
            curr.mid && !prev.mid,
            curr.right && !prev.right
        );
    }

    private static fallingEdge(curr: MouseState, prev: MouseState): MouseState {
        return new MouseState(
            !curr.left && prev.left,
            !curr.mid && prev.mid,
            !curr.right && prev.right
        );
    }

    private _previousFrameTime: number = -1;
    private _currentFrameTime: number = -1;

    private _mouseState: MouseState = new MouseState(false, false, false);

    private _previousMouseState: MouseState = this._mouseState;

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

    constructor(canv: HTMLCanvasElement) {
        this._canv = canv;
        this._ctx = canv.getContext("2d");

        canv.addEventListener("mousedown", this.handleMouseDown.bind(this));
        canv.addEventListener("mouseup", this.handleMouseUp.bind(this));
        canv.addEventListener("mousemove", this.handleMouseMove.bind(this));
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
    }

    createContext(): CanvasFrameContext {
        return {
            renderer: this._ctx,
            deltaTime: (this._currentFrameTime - this._previousFrameTime) * 1000,

            screenSize: new Vector2(this._canv.width, this._canv.height),

            mouseDown: this._mouseState,
            mousePressed: CanvasFrameContextFactory.risingEdge(this._mouseState, this._previousMouseState),
            mouseReleased: CanvasFrameContextFactory.fallingEdge(this._mouseState, this._previousMouseState),

            mousePos: this._mousePos,
            mouseMoved: !this._mousePos.equal(this._previousMousePos),

            disposeListeners: []
        };
    }
}

export default class Canvas {
    private readonly _canv: HTMLCanvasElement;

    private _running: boolean;
    private _contextFactory: CanvasFrameContextFactory;

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

    public constructor(id: string) {
        this._canv = document.getElementById(id) as HTMLCanvasElement;
        this._contextFactory = new CanvasFrameContextFactory(this._canv);

        window.onresize = this.handleResize.bind(this);
        this.handleResize();
    }

    public start(frame: CanvasFrameRenderer) {
        this._running = true;
        requestAnimationFrame(this.handleFrame.bind(this, frame));
    }

    public stop() {
        this._running = false;
    }
}
