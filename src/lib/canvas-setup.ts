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

    private _mousePos: Mouse<>

    private handleMouseDown(ev: MouseEvent) {

    }

    private handleMouseUp(ev: MouseEvent) {

    }

    private handleMouseMove(ev: MouseEvent) {

    }

    constructor(canv: HTMLCanvasElement) {
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

    }
}

export default class Canvas {
    private readonly _canv: HTMLCanvasElement;
    private readonly _ctx: CanvasRenderingContext2D;

    private _running: boolean;
    private _contextFactory: CanvasFrameContextFactory;

    private handleFrame(frame: CanvasFrameRenderer) {
        if (this._running) requestAnimationFrame(this.handleFrame.bind(this, frame));

        this._contextFactory.triggerFrame();
        frame(this._contextFactory.createContext());
    }

    public constructor(id: string) {
        this._canv = document.getElementById(id) as HTMLCanvasElement;
        this._ctx = this._canv.getContext("2d");

        this._contextFactory = new CanvasFrameContextFactory(this._canv);
    }

    public start(frame: CanvasFrameRenderer) {
        this._running = true;
        requestAnimationFrame(this.handleFrame.bind(this, frame));
    }

    public stop() {
        this._running = false;
    }
}
