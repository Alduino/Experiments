import Vector2 from "./Vector2";
import {CanvasFrameContext} from "./canvas-setup";

export interface FillOptions {
    fill: string;
}

export interface OutlineOptions {
    colour: string;
    thickness: number;
}

type PrimitiveOptions = FillOptions | OutlineOptions;

function isFillOptions(options: PrimitiveOptions): options is FillOptions {
    return typeof (options as FillOptions).fill !== "undefined";
}

function drawPath(ctx: CanvasFrameContext, opts: FillOptions | OutlineOptions) {
    if (isFillOptions(opts)) {
        ctx.renderer.fillStyle = opts.fill;
        ctx.renderer.fill();
    } else {
        ctx.renderer.strokeStyle = opts.colour;
        ctx.renderer.lineWidth = opts.thickness;
        ctx.renderer.stroke();
    }
}

///--- PRIMITIVE SHAPES ---\\\

export function rect(ctx: CanvasFrameContext, a: Vector2, b: Vector2, opts: PrimitiveOptions) {
    ctx.renderer.rect(a.x, a.y, b.x, b.y);
    drawPath(ctx, opts);
}

export function clear(ctx: CanvasFrameContext, a: Vector2 = new Vector2(), b: Vector2 = ctx.screenSize) {
    ctx.renderer.clearRect(a.x, a.y, b.x, b.y);
}

///--- COMPOSITE SHAPES ---\\\
