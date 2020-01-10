import Vector2 from "./Vector2";
import {CanvasFrameContext} from "./canvas-setup";

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

type RenderOptions = FillOptions | OutlineOptions;

function isFillOptions(options: RenderOptions): options is FillOptions {
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

export function rect(ctx: CanvasFrameContext, a: Vector2, b: Vector2, opts: RenderOptions) {
    ctx.renderer.beginPath();
    ctx.renderer.rect(a.x, a.y, b.x, b.y);
    drawPath(ctx, opts);
}

export function clear(ctx: CanvasFrameContext, a: Vector2 = new Vector2(), b: Vector2 = ctx.screenSize) {
    ctx.renderer.clearRect(a.x, a.y, b.x, b.y);
}

export function arc(ctx: CanvasFrameContext, centre: Vector2, radius: number, startAngle: number, endAngle: number, counterClockwise: boolean, opts: RenderOptions) {
    ctx.renderer.beginPath();
    ctx.renderer.arc(centre.x, centre.y, radius, startAngle, endAngle, counterClockwise);
    drawPath(ctx, opts);
}

export function text(ctx: CanvasFrameContext, pos: Vector2, text: string, opts: RenderOptions & TextOptions) {
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

///--- COMPOSITE SHAPES ---\\\

export function circle(ctx: CanvasFrameContext, centre: Vector2, radius: number, opts: RenderOptions) {
    arc(ctx, centre, radius, 0, Math.PI * 2, false, opts);
}
