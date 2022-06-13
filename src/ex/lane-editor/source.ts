import InteractiveCanvas, {waitUntil, CanvasFrameContext, CoroutineContext} from "../../lib/canvas-setup";
import {circle, clear, draw, line, moveTo, path, textWithBackground} from "../../lib/imgui";
import Vector2 from "../../lib/Vector2";
import {Bezier} from "bezier-js";
import lerp, {lerpVector} from "../../lib/utils/lerp";
import {drawButton, drawLabel, drawPopupRoot, flowHorizontally} from "../../lib/utils/imui";

const M_TO_PX = 5;
const PX_TO_M = 1 / M_TO_PX;

const MIN_LENGTH = 2;

const DEFAULT_LANE_WIDTH = 3;

const LUT_STEPS = 16;

const SELECT_DISTANCE = 3;

const INVALID_COLOUR = "#cb0a21";

interface LaneDrawProps {
    offsetStart: number;
    offsetEnd: number;

    start: Vector2;
    a: Vector2;
    b: Vector2;
    end: Vector2;

    /**
     * The direction of the connection between the previous road and this one,
     * relative to the rotation at the start of this road.
     *
     * @default 0
     */
    prevDir?: number;

    /**
     * The direction of the connection between this road and the next one,
     * relative to the rotation at the end of this road.
     *
     * @default 0
     */
    nextDir?: number;
}

class Lane {
    startWidth = DEFAULT_LANE_WIDTH;
    endWidth = DEFAULT_LANE_WIDTH;

    /**
     * The colour of the lane
     */
    fill = "#414040";

    /**
     * Set both the start end widths
     */
    setWidth(width: number) {
        this.startWidth = width;
        this.endWidth = width;
    }

    draw(ctx: CanvasFrameContext, params: LaneDrawProps) {
        const curve = new Bezier(
            params.start,
            params.a,
            params.b,
            params.end
        );

        path(ctx, () => {
            let startPoint: Vector2;

            // left outline
            for (let i = 0; i <= LUT_STEPS; i++) {
                const t = i / LUT_STEPS;

                const curvePoint = Vector2.from(curve.compute(t));
                const curveNormal = Vector2.from(curve.normal(t));

                const currentOffset = lerp(params.offsetStart, params.offsetEnd, t);
                const offsetVec = curveNormal.multiply(currentOffset);

                const point = curvePoint.add(offsetVec).multiply(M_TO_PX);

                if (i === 0) {
                    moveTo(ctx, point);
                    startPoint = point;
                } else {
                    line(ctx, {
                        end: point
                    });
                }
            }

            // right outline
            for (let i = LUT_STEPS; i >= 0; i--) {
                const t = i / LUT_STEPS;

                const curvePoint = Vector2.from(curve.compute(t));
                const curveNormal = Vector2.from(curve.normal(t));

                const currentOffset = lerp(params.offsetStart, params.offsetEnd, t);
                const currentWidth = lerp(this.startWidth, this.endWidth, t);

                const actualOffset = currentOffset + currentWidth;
                const offsetVec = curveNormal.multiply(actualOffset);

                const point = curvePoint.add(offsetVec).multiply(M_TO_PX);

                line(ctx, {
                    end: point
                });
            }

            line(ctx, {
                end: startPoint
            });
        });

        draw(ctx, {
            fill: this.fill
        });
    }
}

class Road {
    private readonly lanes: Lane[] = [];

    private startOffset = 0;
    private endOffset = 0;

    constructor(public start: Vector2, public ctrlA: Vector2, public ctrlB: Vector2, public end: Vector2) {
    }

    addLane(index: number, lane: Lane, offsetSide: "left" | "right") {
        this.lanes.splice(index, 0, lane);

        if (offsetSide === "left") {
            this.startOffset -= lane.startWidth / 2;
            this.endOffset -= lane.endWidth / 2;
        } else {
            this.startOffset += lane.startWidth / 2;
            this.endOffset += lane.endWidth / 2;
        }
    }

    deleteLane(index: number, offsetSide: "left" | "right") {
        const lane = this.lanes[index];
        this.lanes.splice(index, 1);

        if (offsetSide === "left") {
            this.startOffset += lane.startWidth / 2;
            this.endOffset += lane.endWidth / 2;
        } else {
            this.startOffset -= lane.startWidth / 2;
            this.endOffset -= lane.endWidth / 2;
        }
    }

    getLanes(): readonly Lane[] {
        return this.lanes;
    }

    setLanes(lanes: readonly Lane[]) {
        this.lanes.length = 0;
        this.lanes.push(...lanes);
    }

    draw(ctx: CanvasFrameContext) {
        const {startWidth, endWidth} = this.getWidths();

        let currentStartOffset = -startWidth / 2 + this.startOffset, currentEndOffset = -endWidth / 2 + this.endOffset;

        for (const lane of this.lanes) {
            lane.draw(ctx, {
                start: this.start,
                a: this.ctrlA,
                b: this.ctrlB,
                end: this.end,
                offsetStart: currentStartOffset,
                offsetEnd: currentEndOffset,
                prevDir: 0,
                nextDir: 0
            });

            currentStartOffset += lane.startWidth;
            currentEndOffset += lane.endWidth;
        }
    }

    /**
     * Returns the curve along the road at an offset dependent on the width of the road.
     * @param position -1 is the left side, 0 is the middle, 1 is the right side.
     * @param t Position through the road's curve to get the point.
     */
    getCurve(position: number, t: number) {
        const {startWidth, endWidth} = this.getWidths();

        const curve = new Bezier(this.start, this.ctrlA, this.ctrlB, this.end);

        const curvePoint = Vector2.from(curve.compute(t));
        const curveNormal = Vector2.from(curve.normal(t));

        const currentWidthOffset = lerp(startWidth, endWidth, t) * position;
        const currentOffset = lerp(this.startOffset, this.endOffset, t);

        const actualOffset = currentWidthOffset / 2 + currentOffset;
        const offsetVec = curveNormal.multiply(actualOffset);

        return curvePoint.add(offsetVec);
    }

    /**
     * Returns the position of each lane, which you can pass into `getCurve()`
     *
     * @returns array where the item's index is the lane index, and the value is the position
     */
    getLanePositions() {
        const {startWidth} = this.getWidths();

        let position = -1;
        const result: number[] = [-1];

        let lastWidth = 0;
        for (const lane of this.lanes) {
            position += 2 * lane.startWidth / startWidth;
            result.push(position);
        }

        return result;
    }

    private getWidths() {
        const totalStartWidth = this.lanes.reduce((width, lane) => width + lane.startWidth, 0);
        const totalEndWidth = this.lanes.reduce((width, lane) => width + lane.endWidth, 0);

        return {
            startWidth: totalStartWidth,
            endWidth: totalEndWidth
        };
    }
}

function getDefaultLanes() {
    return [
        new Lane(),
        new Lane()
    ];
}

function tooltip(ctx: CanvasFrameContext, text: string) {
    const offset = new Vector2(16, 16);
    const padding = new Vector2(8, 6);

    textWithBackground(ctx, ctx.mousePos.add(offset), text, {
        padding,
        text: {
            fill: "#fff",
            font: "14px sans-serif",
            align: "left"
        },
        background: {
            fill: "#676767"
        }
    });
}

function getClosestDistanceWithMaximum(curve: readonly Vector2[], point: Vector2, distance: number): false | number {
    const minDistance = Math.min(...curve.map(pt => pt.distance(point)));
    if (minDistance > distance) return false;
    return minDistance;
}

function getClosestCurveWithMaximum(curves: ReadonlyArray<ReadonlyArray<Vector2>>, point: Vector2, distance: number): false | { idx: number, distance: number } {
    let minDistance = Infinity;
    let minIdx = -1;

    for (let i = 0; i < curves.length; i++) {
        const curve = curves[i];
        const dist = getClosestDistanceWithMaximum(curve, point, distance);

        if (dist !== false && dist < minDistance) {
            minDistance = dist;
            minIdx = i;
        }
    }

    if (minDistance > distance) return false;
    return {idx: minIdx, distance: minDistance};
}

type ValidateResult = {
    valid: true;
    reason?: undefined;
} | {
    valid: false;
    reason: string;
};

interface BaseWipRoad {
    draw(ctx: CanvasFrameContext): void;

    validate(nextPoint: Vector2): ValidateResult;

    build(lastPoint: Vector2): Road;
}

class LinearWipRoad implements BaseWipRoad {
    type: "linear";

    constructor(public start: Vector2) {
    }

    validate(end: Vector2): ValidateResult {
        const valid = this.start.distance(end) > MIN_LENGTH;

        if (valid) return {
            valid: true
        };

        return {
            valid: false,
            reason: "Too short"
        }
    }

    draw(ctx: CanvasFrameContext) {
        const {valid, reason} = this.validate(ctx.mousePos.multiply(PX_TO_M));

        line(ctx, {
            start: this.start.multiply(M_TO_PX),
            end: ctx.mousePos,
            thickness: 2,
            colour: valid ? "#b24a3a" : INVALID_COLOUR
        });

        circle(ctx, this.start.multiply(M_TO_PX), 4, {
            fill: valid ? "#3a5cb2" : INVALID_COLOUR
        });

        circle(ctx, ctx.mousePos, 4, {
            fill: valid ? "#3ab25c" : INVALID_COLOUR
        });

        if (!valid) {
            tooltip(ctx, reason);
        }
    }

    build(end: Vector2): Road {
        // control points can't be at the same spot as the start and end points
        const ctrlA = lerpVector(this.start, end, 0.1);
        const ctrlB = lerpVector(end, this.start, 0.1);

        const road = new Road(this.start, ctrlA, ctrlB, end);
        road.setLanes(getDefaultLanes());
        return road;
    }
}

type WipRoad = LinearWipRoad;

const testRoad = new Road(new Vector2(20, 20), new Vector2(30, 60), new Vector2(80, 60), new Vector2(80, 80));

testRoad.setLanes(getDefaultLanes());

const roads = new Set<Road>([
    testRoad
]);

let isLocked = false;

const canvas = new InteractiveCanvas("canvas");
canvas.setDefaultPrevented("contextmenu", true);
canvas.preventKeyDefault("Control", true);

canvas.start(ctx => {
    clear(ctx);

    for (const road of roads) {
        road.draw(ctx);
    }

    canvas.drawDebug(ctx);
});

const cm = canvas.getCoroutineManager();

/**
 * Calls the provided function every frame until cancelled
 * @returns function to cancel drawing
 */
function persistent(draw: (ctx: CanvasFrameContext) => void) {
    let drawing = true;

    cm.startCoroutine(function* persistent() {

        for (let opacity = 0; opacity < 1; opacity += 0.25) {
            const {ctx} = yield waitUntil.nextFrame();
            ctx.renderer.globalAlpha = opacity;
            draw(ctx);
            ctx.renderer.globalAlpha = 1;
        }

        while (drawing) {
            const {ctx} = yield waitUntil.nextFrame();

            draw(ctx);
        }

        for (let opacity = 1; opacity >= 0; opacity -= 0.25) {
            const {ctx} = yield waitUntil.nextFrame();
            ctx.renderer.globalAlpha = opacity;
            draw(ctx);
            ctx.renderer.globalAlpha = 1;
        }
    });

    return () => {
        drawing = false;
    };
}

/**
 * Asks the user to select one of the buttons
 * @returns the index of the button that was selected, or -1 if the action was cancelled
 */
function buttons(pos: Vector2, title: string, names: string[]) {
    let pressedButton: number | null = null;

    return waitUntil.nested("buttons", [
        cm.startCoroutine(function* buttonsDrawer() {
            let oldCursor: string | null;
            let wasHighlighted = false;

            while (pressedButton === null) {
                const {ctx} = yield waitUntil.nextFrame();

                let somethingHighlighted = false;

                drawPopupRoot(ctx, pos, () => {
                    drawLabel(title);

                    flowHorizontally(() => {
                        for (let i = 0; i < names.length; i++) {
                            const name = names[i];
                            const isHighlighted = drawButton(() => {
                                drawLabel(name);
                            });

                            if (isHighlighted) somethingHighlighted = true;

                            if (isHighlighted && ctx.mouseReleased.left) {
                                pressedButton = i;
                            }
                        }
                    });
                });

                if (ctx.mousePressed.right) {
                    pressedButton = -1;
                }

                if (pressedButton !== null) {
                    somethingHighlighted = false;
                }

                if (somethingHighlighted && !wasHighlighted) {
                    wasHighlighted = true;

                    oldCursor = canvas.cursor;
                    canvas.cursor = "pointer";
                }

                if (!somethingHighlighted && wasHighlighted) {
                    wasHighlighted = false;
                    canvas.cursor = oldCursor;
                    oldCursor = null;
                }
            }
        }).awaiter
    ], () => {
        if (pressedButton === null) {
            return {state: false};
        }

        return {
            state: true,
            data: pressedButton
        }
    });
}

cm.startCoroutine(function* addLane() {
    while (true) {
        let x: CoroutineContext = yield waitUntil.one([
            waitUntil.mouseMoved(),
            waitUntil.keyPressed("Alt"),
            waitUntil.keyReleased("Alt")
        ]);

        if (isLocked) continue;

        for (const road of roads) {
            const selectAll = x.ctx.keyDown.get("Control");
            const lanePositions = selectAll ? road.getLanePositions() : [-1, 1];

            const laneCurves = lanePositions.map(position =>
                Array.from({length: LUT_STEPS + 1}, (_, i) => road.getCurve(position, i / LUT_STEPS))
            );

            const mousePosM = x.ctx.mousePos.multiply(PX_TO_M);
            const closestLaneCurve = getClosestCurveWithMaximum(laneCurves, mousePosM, SELECT_DISTANCE);

            if (!closestLaneCurve) continue;

            isLocked = true;

            const targetedCurve = laneCurves[closestLaneCurve.idx];

            const closeInfo = persistent(ctx => {
                path(ctx, () => {
                    for (let i = 0; i < targetedCurve.length; i++) {
                        if (i === 0) moveTo(ctx, targetedCurve[i].multiply(M_TO_PX));
                        else line(ctx, {
                            end: targetedCurve[i].multiply(M_TO_PX)
                        });
                    }
                });

                draw(ctx, {
                    thickness: 4,
                    colour: "#27bd4f"
                })

                tooltip(ctx, "Add lane");
            });

            x = yield waitUntil.one([
                waitUntil.leftMousePressed(),
                waitUntil.check(ctx => {
                    const mousePosM = ctx.mousePos.multiply(PX_TO_M);

                    const check = getClosestCurveWithMaximum(laneCurves, mousePosM, SELECT_DISTANCE);
                    return !check || check.idx !== closestLaneCurve.idx;
                }),
                waitUntil.keyPressed("Control"),
                waitUntil.keyReleased("Control")
            ]);

            closeInfo();

            if (x.data !== 0) {
                isLocked = false;
                continue;
            }

            x = yield buttons(x.ctx.mousePos.add(new Vector2(15, 15)), "Select Lane Type", [
                "Road",
                "Solid Line"
            ]);

            if (x.data === -1) {
                isLocked = false;
                continue;
            }

            const lane = new Lane();

            if (x.data === 1) {
                lane.startWidth = lane.endWidth = 1;
                lane.fill = "#ddd";
            }

            const roadLaneCount = road.getLanes().length;
            const closestLaneIdx = selectAll ? closestLaneCurve.idx : closestLaneCurve.idx * roadLaneCount;
            const closestEnd = closestLaneIdx < roadLaneCount / 2 ? "left" : "right";
            road.addLane(closestLaneIdx, lane, closestEnd);

            yield waitUntil.nextFrame();

            isLocked = false;
        }
    }
});

cm.startCoroutine(function* createRoad() {
    while (true) {
        let x = yield waitUntil.leftMousePressed();

        if (!isLocked) {
            isLocked = true;

            const wipRoad = new LinearWipRoad(x.ctx.mousePos.multiply(PX_TO_M));

            const hideWipRoad = persistent(ctx => {
                wipRoad.draw(ctx);
            });

            x = yield waitUntil.one([
                waitUntil.all([
                    waitUntil.check(ctx => wipRoad.validate(ctx.mousePos.multiply(PX_TO_M)).valid),
                    waitUntil.leftMousePressed()
                ]),
                waitUntil.rightMousePressed()
            ]);

            hideWipRoad();

            if (x.data !== 0) {
                isLocked = false;
                continue;
            }

            yield waitUntil.nextFrame();

            const road = wipRoad.build(x.ctx.mousePos.multiply(PX_TO_M));
            isLocked = false;
            roads.add(road);
        }
    }
});
