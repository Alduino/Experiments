import Vector2 from "./Vector2";

type CanvasFrameRenderer = (ctx: CanvasFrameContext) => void;

interface CanvasFrameContext {
    renderer: CanvasRenderingContext2D;
    deltaTime: number;
}

interface Mouse<T> {
    left: T;
    mid: T;
    right: T;
}

class CanvasFrameContextFactory {
    private _previousFrameTime: number = -1;
    private _currentFrameTime: number = -1;

    private _mouseState: Mouse<boolean> = {
        left: false,
        mid: false,
        right: false
    };

    private _mousePos: Vector2 = new Vector2();

    private readonly _canv: HTMLCanvasElement;
    private readonly _ctx: CanvasRenderingContext2D;

    private handleMouseDown(ev: MouseEvent) {
        switch (ev.button) {
            case 0: this._mouseState.left = true; break;
            case 1: this._mouseState.mid = true; break;
            case 2: this._mouseState.right = true; break;
        }
    }

    private handleMouseUp(ev: MouseEvent) {
        switch (ev.button) {
            case 0: this._mouseState.left = false; break;
            case 1: this._mouseState.mid = false; break;
            case 2: this._mouseState.right = false; break;
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

    triggerFrame() {
        if (this._currentFrameTime === -1) {
            this._currentFrameTime = this._previousFrameTime = performance.now();
        } else {
            this._previousFrameTime = this._currentFrameTime;
            this._currentFrameTime = performance.now();
        }
    }

    createContext(): CanvasFrameContext {
        return {
            renderer: this._ctx,
            deltaTime: (this._currentFrameTime - this._previousFrameTime) * 1000
        }
    }
}

export default class Canvas {
    private readonly _canv: HTMLCanvasElement;

    private _running: boolean;
    private _contextFactory: CanvasFrameContextFactory;

    private handleFrame(frame: CanvasFrameRenderer) {
        if (this._running) requestAnimationFrame(this.handleFrame.bind(this, frame));

        this._contextFactory.triggerFrame();
        frame(this._contextFactory.createContext());
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
