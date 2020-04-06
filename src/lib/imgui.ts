import Vector2 from "./Vector2";
import Canvas, {CanvasFrameContext} from "./canvas-setup";

export interface FillOptions {
    fill: string;
}

export interface OutlineOptions {
    colour: string;
    thickness: number;
}

export interface TextOptions {
    font: string;
    align: CanvasTextAlign;
}

export interface RenderDisabledOptions {}

interface BasicBezierOptions {
    start?: Vector2;
    end: Vector2;
}

export type BezierOptions<T> = BasicBezierOptions & {[opt in keyof T]: Vector2}

type RenderOptions = FillOptions | OutlineOptions | RenderDisabledOptions;

type PathDrawer = () => void;

interface ImguiContext {
    inPath: boolean;
}

const contexts: Map<CanvasFrameContext, ImguiContext> = new Map<CanvasFrameContext, ImguiContext>();

function getImguiContext(cfContext: CanvasFrameContext): ImguiContext {
    if (contexts.has(cfContext)) return contexts.get(cfContext);

    const context: ImguiContext = {
        inPath: false
    };

    cfContext.disposeListeners.push(() => {
        contexts.delete(cfContext);
    });

    contexts.set(cfContext, context);
    return context;
}

function assertInPath(iCtx: ImguiContext, state: boolean) {
    const can = state ? "can only" : "cannot";
    if (iCtx.inPath !== state) throw new Error("This method " + can + " be run inside a path().");
}

function isFillOptions(options: RenderOptions): options is FillOptions {
    return typeof (options as FillOptions).fill !== "undefined";
}

function isOutlineOptions(options: RenderOptions): options is OutlineOptions {
    return typeof (options as OutlineOptions).thickness !== "undefined" &&
           typeof (options as OutlineOptions).colour !== "undefined";
}

function beginPath(ctx: CanvasFrameContext) {
    const iCtx = getImguiContext(ctx);
    if (iCtx.inPath) return;
    ctx.renderer.beginPath();
}

function drawPath(ctx: CanvasFrameContext, opts?: RenderOptions) {
    if (getImguiContext(ctx).inPath) {
        if (isFillOptions(opts) || isOutlineOptions(opts))
            console.warn("Render options are not required when inside path()");
    } else {
        if (isFillOptions(opts)) {
            ctx.renderer.fillStyle = opts.fill;
            ctx.renderer.fill();
        } else if (isOutlineOptions(opts)) {
            ctx.renderer.strokeStyle = opts.colour;
            ctx.renderer.lineWidth = opts.thickness;
            ctx.renderer.stroke();
        } else {
            throw new ReferenceError("Render options must be defined when outside path()");
        }
    }
}

function moveWhenNotInPath(ctx: CanvasFrameContext, pos: Vector2 | undefined, argName: string) {
    if (getImguiContext(ctx).inPath) {
        if (typeof pos !== "undefined")
            console.warn(argName + " is not required when inside path()");
    } else {
        if (typeof pos === "undefined")
            throw new ReferenceError(argName + " must be defined when outside path()");
        else
            ctx.renderer.moveTo(pos.x, pos.y);
    }
}

///--- PRIMITIVE SHAPES ---\\\

export function rect(ctx: CanvasFrameContext, a: Vector2, b: Vector2, opts: RenderOptions) {
    beginPath(ctx);
    ctx.renderer.rect(a.x, a.y, b.x, b.y);
    drawPath(ctx, opts);
}

export function clear(ctx: CanvasFrameContext, a: Vector2 = new Vector2(), b: Vector2 = ctx.screenSize) {
    assertInPath(getImguiContext(ctx), false);
    ctx.renderer.clearRect(a.x, a.y, b.x, b.y);
}

export function arc(ctx: CanvasFrameContext, centre: Vector2, radius: number, startAngle: number, endAngle: number, counterClockwise: boolean, opts: RenderOptions) {
    beginPath(ctx);
    ctx.renderer.arc(centre.x, centre.y, radius, startAngle, endAngle, counterClockwise);
    drawPath(ctx, opts);
}

export function text(ctx: CanvasFrameContext, pos: Vector2, text: string, opts: (FillOptions | OutlineOptions) & TextOptions) {
    assertInPath(getImguiContext(ctx), false);

    ctx.renderer.font = opts.font;
    ctx.renderer.textAlign = opts.align;

    if (isFillOptions(opts)) {
        ctx.renderer.fillStyle = opts.fill;
        ctx.renderer.fillText(text, pos.x, pos.y);
    } else {
        ctx.renderer.strokeStyle = opts.colour;
        ctx.renderer.lineWidth = opts.thickness;
        ctx.renderer.strokeText(text, pos.x, pos.y);
    }
}

export function quadraticCurve(ctx: CanvasFrameContext, opts: RenderOptions & BezierOptions<{control}>) {
    beginPath(ctx);
    moveWhenNotInPath(ctx, opts.start, "start");
    ctx.renderer.quadraticCurveTo(opts.control.x, opts.control.y, opts.end.x, opts.end.y);
}

export function cubicCurve(ctx: CanvasFrameContext, opts: RenderOptions & BezierOptions<{controlA, controlB}>) {
    beginPath(ctx);
    moveWhenNotInPath(ctx, opts.start, "start");
    ctx.renderer.bezierCurveTo(opts.controlA.x, opts.controlA.y, opts.controlB.x, opts.controlB.y, opts.end.x, opts.end.y);
    drawPath(ctx, opts);
}

export function line(ctx: CanvasFrameContext, opts: RenderOptions & BasicBezierOptions) {
    beginPath(ctx);
    moveWhenNotInPath(ctx, opts.start, "start");
    ctx.renderer.lineTo(opts.end.x, opts.end.y);
    drawPath(ctx, opts);
}

export function moveTo(ctx: CanvasFrameContext, pos: Vector2) {
    assertInPath(getImguiContext(ctx), true);
    ctx.renderer.moveTo(pos.x, pos.y);
}

export function copyFrom(ctx: CanvasFrameContext, other: Canvas) {
    ctx.renderer.drawImage(other.ctx.canvas, 0, 0);
}

export function path(ctx: CanvasFrameContext, draw: PathDrawer) {
    const iCtx = getImguiContext(ctx);
    assertInPath(iCtx, false);

    beginPath(ctx);

    iCtx.inPath = true;
    const result = draw();

    if ((result as any) instanceof Promise) {
        throw new Error("Path drawers must be run simultaneously.");
    }

    iCtx.inPath = false;
}

export function draw(ctx: CanvasFrameContext, opts: RenderOptions) {
    assertInPath(getImguiContext(ctx), false);
    drawPath(ctx, opts);
}

///--- COMPOSITE SHAPES ---\\\

export function circle(ctx: CanvasFrameContext, centre: Vector2, radius: number, opts: RenderOptions) {
    arc(ctx, centre, radius, 0, Math.PI * 2, false, opts);
}
