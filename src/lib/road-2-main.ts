import Canvas, {CanvasFrameContext, RenderTrigger} from "./canvas-setup";
import Bezier, {Point2D, Point3D, PolyBezier} from "bezier-js";
import {v4 as uuid} from "uuid";
import iter from "itiriri";
import {circle, clear, draw, line, linearGradient, moveTo, path, quadraticCurve, text} from "./imgui";
import Vector2 from "./Vector2";

enum CurveMakerState {
    Pre,
    Init,
    End,
    Fin
}

enum HighlightType {
    None = "#4489ef",
    Modify = "#7744ef",
    Delete = "#ef4480",
    Snap = "#a6c3db"
}

const SNAP_DISTANCE = 15;
const GRID_SIZE = 30;
const GRID_FALLOFF = 5;

type SegmentIdentifier = ReturnType<typeof uuid>;

interface Segment {
    id: SegmentIdentifier;
    shape: Bezier;
    startConnections: SegmentIdentifier[];
    endConnections: SegmentIdentifier[];
}

const segments: Map<SegmentIdentifier, Segment> = new Map();
let workingSegment: Segment;

const KEYS = {
    noGrid: "Shift",
    delete: "Alt",
    noSnap: "Control"
};

const CONTROL_NAMES: {[control in keyof typeof KEYS]: string} = {
    noGrid: "Disable grid",
    delete: "Remove segment",
    noSnap: "Disable snapping"
};

const EXTRA_INFO =
`
Click on the previous point of a line to cancel`.split("\n");

function handleCurveMakers(ctx: CanvasFrameContext, oldState: CurveMakerState): CurveMakerState {
    switch (oldState) {
        case CurveMakerState.Pre:
            return handleCurvePre(ctx, oldState);
        case CurveMakerState.Init:
            return handleCurveInit(ctx, oldState);
        case CurveMakerState.End:
            return handleCurveEnd(ctx, oldState);
        default:
            return oldState;
    }
}

function getActionCurve(mousePos: Vector2) {
    for (const curve of segments.values()) {
        if (Vector2.from(curve.shape.project(mousePos)).distance(mousePos) < SNAP_DISTANCE)
            return curve;
    }

    return null;
}

function getSnapLines(skip: Bezier[] = []) {
    return iter(segments.values()).map(({shape}) => {
        if (skip.includes(shape)) return [];

        const curve0 = Vector2.from(shape.point(0));
        const curve1 = Vector2.from(shape.point(1));
        const curve2 = Vector2.from(shape.point(2));

        return [
            // line from P1 to P0 then extended
            new Bezier([curve0, Vector2.lerp(curve1, curve0, 1.5), Vector2.lerp(curve1, curve0, 2)]),
            // line from P1 to P2 then extended
            new Bezier([curve2, Vector2.lerp(curve1, curve2, 1.5), Vector2.lerp(curve1, curve2, 2)])
        ];
    }).flat(v => v);
}

let modifySegment: Segment;
function handleCurvePre(ctx: CanvasFrameContext, oldState: CurveMakerState): CurveMakerState {
    const actionSegment = getActionCurve(ctx.mousePos);
    if (actionSegment && ctx.keyDown.get(KEYS.delete)) {
        drawCurve(ctx, actionSegment.shape, false, HighlightType.Delete);

        if (ctx.mouseReleased.left) {
            segments.delete(actionSegment.id);
        }
    } else if (actionSegment || modifySegment) {
        if (actionSegment && !modifySegment) modifySegment = actionSegment;

        const mCurve0 = Vector2.from(modifySegment.shape.point(0));
        const mCurve2 = Vector2.from(modifySegment.shape.point(2));

        let targetPos = ctx.mousePos, snapped = false;

        if (!ctx.keyDown.get(KEYS.noSnap)) {
            const snapLines = getSnapLines([modifySegment.shape])
                .concat(new Bezier([mCurve0, Vector2.lerp(mCurve0, mCurve2, .5), mCurve2]))
                .toArray();

            for (const line of snapLines) {
                drawCurve(ctx, line, false, HighlightType.Snap);
            }

            for (const curve of snapLines) {
                const projectPoint = Vector2.from(curve.project(ctx.mousePos));

                if (ctx.mousePos.distance(projectPoint) < SNAP_DISTANCE) {
                    targetPos = projectPoint;
                    snapped = true;
                }
            }
        }

        if (!snapped && isUsingGrid(ctx) && ctx.mouseDown.left) {
            drawGrid(ctx);
            targetPos = snapToGrid(targetPos);
        }

        if (ctx.mouseDown.left) targetPos.assignTo(modifySegment.shape.point(1));
        drawCurve(ctx, modifySegment.shape, true, HighlightType.Modify);

        if (!ctx.mouseDown.left) modifySegment = null;
    } else {
        if (ctx.mousePressed.left) return oldState + 1;
    }

    return oldState;
}

function isUsingGrid(ctx: CanvasFrameContext) {
    return !ctx.keyDown.get(KEYS.noGrid);
}

function drawGrid(ctx: CanvasFrameContext) {
    const targetPos = snapToGrid(ctx.mousePos);

    const offsetMin = -GRID_FALLOFF * GRID_SIZE;
    const offsetMax = GRID_FALLOFF * GRID_SIZE;

    const gradientLeftPoint = targetPos.add(new Vector2(offsetMin, 0));
    const gradientRightPoint = targetPos.add(new Vector2(offsetMax, 0));
    const gradientTopPoint = targetPos.add(new Vector2(0, offsetMin));
    const gradientBottomPoint = targetPos.add(new Vector2(0, offsetMax));

    const gridColour = "rgb(94,114,135)";
    const gridColourForRgba = gridColour.substring("rgb(".length, gridColour.length - 1);
    const gridColourTransparent = `rgba(${gridColourForRgba}, 0)`;

    for (let y = -GRID_FALLOFF; y <= GRID_FALLOFF; y++) {
        const left = new Vector2(targetPos.x + offsetMin, targetPos.y + y * GRID_SIZE);
        const right = new Vector2(targetPos.x + offsetMax, targetPos.y + y * GRID_SIZE);

        const brightestColour = 1 - Math.abs(y) / GRID_FALLOFF;
        const brightestColourString = `rgba(${gridColourForRgba}, ${brightestColour})`;

        line(ctx, {
            start: left,
            end: right,
            thickness: 1,
            colour: linearGradient(ctx, gradientLeftPoint, gradientRightPoint, [
                {time: 0, colour: gridColourTransparent},
                {time: .5, colour: brightestColourString},
                {time: 1, colour: gridColourTransparent}
            ])
        });
    }

    for (let x = -GRID_FALLOFF; x <= GRID_FALLOFF; x++) {
        const top = new Vector2(targetPos.x + x * GRID_SIZE, targetPos.y + offsetMin);
        const bottom = new Vector2(targetPos.x + x * GRID_SIZE, targetPos.y + offsetMax);

        const brightestColour = 1 - Math.abs(x) / GRID_FALLOFF;
        const brightestColourString = `rgba(${gridColourForRgba}, ${brightestColour})`;

        line(ctx, {
            start: top,
            end: bottom,
            thickness: 1,
            colour: linearGradient(ctx, gradientTopPoint, gradientBottomPoint, [
                {time: 0, colour: gridColourTransparent},
                {time: .5, colour: brightestColourString},
                {time: 1, colour: gridColourTransparent}
            ])
        });
    }
}

function snapToGrid(point: Vector2) {
    return new Vector2(
        Math.round(point.x / GRID_SIZE) * GRID_SIZE,
        Math.round(point.y / GRID_SIZE) * GRID_SIZE
    );
}

function drawExistingCurves(ctx: CanvasFrameContext) {
    for (const {shape} of segments.values()) {
        drawCurve(ctx, shape, false);
    }
}

function createSegment(shape: Bezier): Segment {
    return {
        id: uuid(),
        shape,
        startConnections: [],
        endConnections: []
    };
}

function handleCurveInit(ctx: CanvasFrameContext, oldState: CurveMakerState): CurveMakerState {
    const usingGrid = isUsingGrid(ctx);
    const point = usingGrid ? snapToGrid(ctx.mousePos) : ctx.mousePos;

    if (usingGrid) {
        drawGrid(ctx);
    }

    if (ctx.mouseReleased.left) {
        // commit the curve

        workingSegment = createSegment(new Bezier([point, new Vector2(), new Vector2()]));

        return oldState + 1;
    }

    circle(ctx, point, 4, {
        fill: "#4489ef"
    });

    return oldState;
}

function snaps(previousPoint: Vector2, mousePos: Vector2) {
    return previousPoint.distance(mousePos) < SNAP_DISTANCE;
}

function drawCurve(ctx: CanvasFrameContext, curve: Bezier, drawDots = true, highlight: HighlightType | string = HighlightType.None) {
    if (!curve) return;

    const curveP0 = Vector2.from(curve.point(0));
    const curveP1 = Vector2.from(curve.point(1));
    const curveP2 = Vector2.from(curve.point(2));

    quadraticCurve(ctx, {
        start: curveP0,
        control: curveP1,
        end: curveP2,
        thickness: 2,
        colour: highlight
    });

    if (drawDots) {
        circle(ctx, curveP0, 4, {
            fill: "#2c3d53"
        });

        circle(ctx, curveP1, 4, {
            fill: "#2c4d53"
        });

        circle(ctx, curveP2, 4, {
            fill: "#2c3d53"
        });

        path(ctx, () => {
            moveTo(ctx, curveP1);

            line(ctx, {
                end: curveP0
            });

            moveTo(ctx, curveP1);

            line(ctx, {
                end: curveP2
            });
        });
        draw(ctx, {
            thickness: 2,
            dash: [5, 3],
            colour: highlight
        })
    }
}

function handleCurveEnd(ctx: CanvasFrameContext, oldState: CurveMakerState): CurveMakerState {
    const usingGrid = isUsingGrid(ctx);

    if (usingGrid) {
        drawGrid(ctx);
    }

    const workingPointZero = Vector2.from(workingSegment.shape.point(0));
    const willSnap = snaps(Vector2.from(workingSegment.shape.point(0)), ctx.mousePos);
    const targetPoint = willSnap ? workingPointZero : usingGrid ? snapToGrid(ctx.mousePos) : ctx.mousePos;

    targetPoint.assignTo(workingSegment.shape.point(2));
    Vector2.lerp(targetPoint, Vector2.from(workingSegment.shape.point(0)), .5)
        .assignTo(workingSegment.shape.point(1));

    if (ctx.mouseReleased.left) {
        if (willSnap) {
            // at this point, snapping cancels the action
            // and exits out of this curve
            workingSegment = null;
            return CurveMakerState.Pre;
        } else {
            // finish this curve and start a new one at the end point
            segments.set(uuid(), workingSegment);
            workingSegment = createSegment(new Bezier([targetPoint, new Vector2(), new Vector2()]));
            return CurveMakerState.End;
        }
    }

    drawCurve(ctx, workingSegment.shape);

    return oldState;
}



const canvas = new Canvas("canvas");
canvas.preventKeyDefault("Shift", true);
canvas.preventKeyDefault("Control", true);
canvas.preventKeyDefault("Alt", true);

let curveMakerState = CurveMakerState.Pre;
canvas.start(ctx => {
    let startTime = performance.now();

    clear(ctx);

    drawExistingCurves(ctx);

    {
        try {
            let prevState = curveMakerState;
            curveMakerState = handleCurveMakers(ctx, curveMakerState);
            if (prevState !== curveMakerState) console.log("Changed state from", CurveMakerState[prevState], "to", CurveMakerState[curveMakerState]);
        } catch (ex) {
            console.error(ex);
        }
    }

    text(ctx, new Vector2(10, 20), `${ctx.fps.toFixed(0)} fps`, {
        fill: "black",
        font: "10px monospace",
        align: "left"
    });

    for (let i = 0; i < Object.entries(CONTROL_NAMES).length; i++) {
        const [action, desc] = Object.entries(CONTROL_NAMES)[i];

        text(ctx, new Vector2(20, 50 + i * 20), `${desc}: ${KEYS[action]}`, {
            fill: "black",
            font: "18px sans-serif",
            align: "left"
        });
    }

    for (let i = 0; i < EXTRA_INFO.length; i++) {
        const line = EXTRA_INFO[i];

        text(ctx, new Vector2(20, 50 + Object.entries(CONTROL_NAMES).length * 20 + i * 20), line, {
            fill: "black",
            font: "18px sans-serif",
            align: "left"
        });
    }

    let endTime = performance.now();
    text(ctx, new Vector2(10, 30), `${(endTime - startTime).toFixed(2)} ms`, {
        fill: "black",
        font: "10px monospace",
        align: "left"
    });
//});
}, RenderTrigger.MouseChanged | RenderTrigger.KeyChanged);
