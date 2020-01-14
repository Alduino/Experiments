import Bezier from "bezier-js";
import Canvas, {CanvasFrameContext, RenderTrigger} from "./canvas-setup";
import {clear, cubicCurve, draw, line, moveTo, path, quadraticCurve, text} from "./imgui";
import Vector2 from "./Vector2";

const canvas = new Canvas("canvas");

class Road {
    private _curve: Bezier;
    private _invalidReason: string | null = null;

    start: Vector2;
    control: Vector2;
    end: Vector2;

    recalculateBezierCurve() {
        this._curve = new Bezier(this.start, this.control, this.end);
    }

    render(ctx: CanvasFrameContext) {
        const outline = this._curve.outline(25);

        path(ctx, () => {
            for (const curve of outline.curves) {
                moveTo(ctx, Vector2.from(curve.points[0]));

                if (curve.points.length === 3) {
                    quadraticCurve(ctx, {
                        control: Vector2.from(curve.points[1]),
                        end: Vector2.from(curve.points[2])
                    });
                } else if (curve.points.length === 4) {
                    cubicCurve(ctx, {
                        controlA: Vector2.from(curve.points[1]),
                        controlB: Vector2.from(curve.points[2]),
                        end: Vector2.from(curve.points[3])
                    });
                } else throw new Error("Invalid curve points length");
            }
        });

        draw(ctx, {
            thickness: 1,
            colour: "black"
        });
    }
}

const roads: Road[] = [];

const road = new Road();
road.start = new Vector2(100, 100);
road.control = new Vector2(200, 200);
road.end = new Vector2(300, 100);
road.recalculateBezierCurve();

roads.push(road);

canvas.start(ctx => {
    const renderStart = performance.now();
    clear(ctx);

    text(ctx, new Vector2(10, 30), "FPS: " + Math.round(ctx.fps), {
        fill: "black",
        align: "left",
        font: "24px sans-serif"
    });

    road.control = ctx.mousePos;
    road.recalculateBezierCurve();

    for (const road of roads) {
        road.render(ctx);
    }
    const renderEnd = performance.now();

    text(ctx, new Vector2(10, 54), "Latency: " + (renderEnd - renderStart) + "ms", {
        fill: "black",
        align: "left",
        font: "24px sans-serif"
    });
}, RenderTrigger.MouseMoved | RenderTrigger.Resized);
