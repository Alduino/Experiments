import Vector2 from "./Vector2";
import Canvas, {CanvasFrameContext} from "./canvas-setup";

export type FillType = string | CanvasGradient;

export interface FillOptions {
    fill: FillType;
}

interface OutlineOptionsWithoutDash {
    colour: FillType;
    thickness: number;
}

interface OutlineOptionsWithDash {
    dash: number[];
    dashOffset?: number;
}

export type OutlineOptions = OutlineOptionsWithoutDash | (OutlineOptionsWithoutDash & OutlineOptionsWithDash);

export interface TextOptions {
    font: string;
    align: CanvasTextAlign;
}

export interface TextWithBackgroundOptions {
    background: RenderOptions;
    text: (FillOptions | OutlineOptions) & TextOptions;
    padding: Vector2;
}

export interface RenderDisabledOptions {}

export interface PolygonOptions {
    radius: number;
    rotation?: number;
    sides?: number;
    distanceMods?: number[];
}

interface BasicBezierOptions {
    start?: Vector2;
    end: Vector2;
}

export type BezierOptions<T> = BasicBezierOptions & {[opt in keyof T]: Vector2}

type RenderOptions = FillOptions | OutlineOptions | RenderDisabledOptions;

type PathDrawer = (isNested: boolean) => void;

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

function isDashOutlineOptions(options: OutlineOptions): options is OutlineOptions & OutlineOptionsWithDash {
    return Array.isArray((options as OutlineOptionsWithDash).dash);
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

            if (isDashOutlineOptions(opts)) {
                ctx.renderer.setLineDash(opts.dash);
                ctx.renderer.lineDashOffset = opts.dashOffset || 0;
            } else {
                ctx.renderer.setLineDash([]);
            }

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
    ctx.renderer.rect(a.x, a.y, b.x - a.x, b.y - a.y);
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

export function measureText(ctx: CanvasFrameContext, text: string, opts: Omit<TextOptions, "align">) {
    ctx.renderer.font = opts.font;
    return ctx.renderer.measureText(text);
}

export function text(ctx: CanvasFrameContext, pos: Vector2, text: string, opts: (FillOptions | OutlineOptions) & TextOptions) {
    assertInPath(getImguiContext(ctx), false);

    ctx.renderer.textBaseline = "top";
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

export function textWithBackground(ctx: CanvasFrameContext, pos: Vector2, value: string, opts: TextWithBackgroundOptions) {
    const textMeasurement = measureText(ctx, value, opts.text);
    const textSize = new Vector2(textMeasurement.width, textMeasurement.actualBoundingBoxAscent + textMeasurement.actualBoundingBoxDescent);
    const rectSize = textSize.add(opts.padding.add(opts.padding));

    rect(ctx, pos, pos.add(rectSize), opts.background);
    text(ctx, pos.add(opts.padding), value, opts.text);
}

export function quadraticCurve(ctx: CanvasFrameContext, opts: RenderOptions & BezierOptions<{control}>) {
    beginPath(ctx);
    moveWhenNotInPath(ctx, opts.start, "start");
    ctx.renderer.quadraticCurveTo(opts.control.x, opts.control.y, opts.end.x, opts.end.y);
    drawPath(ctx, opts);
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
    const wasInPath = iCtx.inPath;

    beginPath(ctx);

    iCtx.inPath = true;
    const result = draw(wasInPath);

    if ((result as any) instanceof Promise) {
        throw new Error("Path drawers must be run synchronously.");
    }

    iCtx.inPath = wasInPath;
}

export function draw(ctx: CanvasFrameContext, opts: RenderOptions) {
    assertInPath(getImguiContext(ctx), false);
    drawPath(ctx, opts);
}

///--- COMPOSITE SHAPES ---\\\

export function circle(ctx: CanvasFrameContext, centre: Vector2, radius: number, opts: RenderOptions) {
    arc(ctx, centre, radius, 0, Math.PI * 2, false, opts);
}

export function polygon(ctx: CanvasFrameContext, centre: Vector2, opts: RenderOptions & PolygonOptions) {
    const {rotation = 0, sides = 3, radius, distanceMods = []} = opts;
    if (sides < 3) throw new Error("Polygon must have at least 3 sides");

    path(ctx, () => {
        for (let i = 0; i <= sides; i++) {
            const rad = radius + (distanceMods[i % sides] || 0);
            const rad2 = new Vector2(rad, rad);
            const angle = rotation + (i / sides) * Math.PI * 2;
            const point = new Vector2(Math.cos(angle), Math.sin(angle)).multiply(rad2).add(centre);

            if (i === 0) moveTo(ctx, point);
            else line(ctx, {end: point});
        }
    });

    drawPath(ctx, opts);
}

///--- COLOUR UTILS ---\\\

interface Stop {
    time: number;
    colour: string;
}

const gradientCache: Map<CanvasRenderingContext2D, Map<string, CanvasGradient>> = new Map();

function createGradientHash(type: string, start: Vector2, end: Vector2, stops: Stop[]) {
    return `${type}_${start}_${end}_${stops.map(stop => `${stop.time}_${stop.colour}`).join(",")}`;
}

export function linearGradient(ctx: CanvasFrameContext, start: Vector2, end: Vector2, stops: Stop[]) {
    const hash = createGradientHash("linear", start, end, stops);

    if (!gradientCache.has(ctx.renderer)) gradientCache.set(ctx.renderer, new Map());
    const gradientCacheMap = gradientCache.get(ctx.renderer);
    if (gradientCacheMap.has(hash)) {
        return gradientCacheMap.get(hash);
    }

    const gradient = ctx.renderer.createLinearGradient(start.x, start.y, end.x, end.y);

    for (const stop of stops) {
        gradient.addColorStop(stop.time, stop.colour);
    }

    gradientCacheMap.set(hash, gradient);
    return gradient;
}
