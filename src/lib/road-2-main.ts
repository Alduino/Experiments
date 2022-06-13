import InteractiveCanvas, {CanvasFrameContext, RenderTrigger} from "./canvas-setup";
import {Bezier, Point} from "bezier-js";
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
type SegmentConnectionIdentifier = ReturnType<typeof uuid>;

interface SegmentConnection {
    id: SegmentConnectionIdentifier;

    // The point of the connection. Linked to the correct point on each segment
    point: Vector2;

    // A list of segment identifiers that are connected
    segments: SegmentIdentifier[];
}

interface Segment {
    id: SegmentIdentifier;
    shape: Bezier;
    startConnection?: SegmentConnection;
    endConnection?: SegmentConnection;

    startPoint: Vector2;
    controlPoint: Vector2;
    endPoint: Vector2;

    _moveState?: SegmentModificationInfo;
}

const segments: Map<SegmentIdentifier, Segment> = new Map();
const connections: Map<SegmentConnectionIdentifier, SegmentConnection> = new Map();
let workingSegment: Segment;

// @ts-ignore
window.devTool_reloadSegmentMap = () => {
    console.clear();
    console.log(segments);
    console.log(connections);
}

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

function getActionConnection(mousePos: Vector2) {
    for (const connection of connections.values()) {
        if (connection.point.distance(mousePos) < SNAP_DISTANCE) return connection;
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

interface SegmentModificationInfo {
    points: {
        point: Point;
        opposite: Vector2;
        mid: Vector2;
    };

    connection: SegmentConnection;

    start: {
        angle: number;
        dist: number;
    }
}

type StartOrEndConnection = "startConnection" | "endConnection";
type StartOrEndPoint = "startPoint" | "endPoint";

function connect(a: Segment, b: Segment, aEnd: "start" | "end", bEnd: "start" | "end") {
    if (!a || !b) throw new Error("A and B must both be defined");
    if (a.id === b.id) throw new Error("A and B must be different");

    const aConnectionKey = aEnd + "Connection" as StartOrEndConnection;
    const bConnectionKey = bEnd + "Connection" as StartOrEndConnection;

    const aPointKey = aEnd + "Point" as StartOrEndPoint;
    const bPointKey = bEnd + "Point" as StartOrEndPoint;

    const aConnection = a[aConnectionKey];
    const bConnection = b[bConnectionKey];

    // they are already connected
    if (aConnection && aConnection === bConnection) return aConnection;

    if (aConnection && bConnection) {
        throw new Error("One of A or B must not be connected");
    }

    if (aConnection && !bConnection) {
        // b is not connected to anything
        b[bConnectionKey] = aConnection;

        // link the point
        b[bPointKey] = aConnection.point;

        aConnection.segments.push(b.id);

        return aConnection;
    } else if (bConnection && !aConnection) {
        // a is not connected to anything
        a[aConnectionKey] = bConnection;

        bConnection.segments.push(a.id);

        // link the point
        a[aPointKey] = aConnection.point;

        return bConnection;
    } else {
        // neither are connected to anything
        const connection: SegmentConnection = {
            id: uuid(),
            // use a's point - they usually will be the same
            point: a[aPointKey],
            segments: [a.id, b.id]
        };

        connections.set(connection.id, connection);
        a[aConnectionKey] = connection;
        b[bConnectionKey] = connection;

        // link the point
        b[bPointKey].replace(connection.point);

        return connection;
    }
}

function disconnect(connection: SegmentConnection, segment: Segment) {
    // no point disconnecting from a connection that doesn't exist
    if (!connection) return;

    if (!connection.segments.includes(segment.id)) throw new Error("Segment is not part of connection");

    connection.segments.splice(connection.segments.indexOf(segment.id), 1);

    if (connection.segments.length <= 1) connections.delete(connection.id);
}

function startConnectionModification(connection: SegmentConnection) {
    for (const segmentId of connection.segments) {
        const segment = segments.get(segmentId);
        const oppositePoint = connection.id === segment.startConnection?.id ? segment.endPoint : segment.startPoint;
        const midPoint = segment.controlPoint.clone();

        const angle = connection.point.angleTo(oppositePoint);
        const dist = connection.point.distance(oppositePoint);

        segment._moveState = {
            points: {
                point: connection.point,
                opposite: oppositePoint,
                mid: midPoint
            },

            connection,

            start: {
                angle,
                dist
            }
        };
    }
}

/**
 * Moves the connection point, and scales any connected segments to keep the same shape
 */
function modifyConnection(connection: SegmentConnection, targetPoint: Vector2) {
    targetPoint.assignTo(connection.point);

    for (const segmentId of connection.segments) {
        const segment = segments.get(segmentId);
        const {_moveState: state} = segment;

        const angleDiff = state.points.opposite.angleTo(targetPoint) - state.start.angle;
        const distMul = state.points.opposite.distance(targetPoint) / state.start.dist;

        const originalMidAngle = state.points.mid.angleTo(state.points.opposite);
        const originalMidDist = state.points.mid.distance(state.points.opposite);

        const newMid = Vector2.fromDir(originalMidAngle + angleDiff)
            .withLength(originalMidDist * distMul).add(state.points.opposite);

        newMid.assignTo(segment.controlPoint);
    }
}

function deleteSegment(segment: Segment) {
    disconnect(segment.startConnection, segment);
    disconnect(segment.endConnection, segment);
    segments.delete(segment.id);
}

let modifySegment: Segment, modifyConnect: SegmentConnection;
function handleCurvePre(ctx: CanvasFrameContext, oldState: CurveMakerState): CurveMakerState {
    const actionConnection = getActionConnection(ctx.mousePos);
    if (actionConnection || modifyConnect) {
        const conn = actionConnection || modifyConnect;

        circle(ctx, conn.point, 7, {
            thickness: 2,
            colour: HighlightType.Modify,
            dash: [3, 2]
        });

        if (ctx.mousePressed.left) {
            modifyConnect = actionConnection || modifyConnect;
            startConnectionModification(modifyConnect);
        }

        if (ctx.mouseDown.left) {
            let target = ctx.mousePos;

            if (isUsingGrid(ctx)) {
                drawGrid(ctx);
                target = snapToGrid(ctx.mousePos);
            }

            modifyConnection(modifyConnect, target);
        }

        if (ctx.mouseReleased.left) modifyConnect = null;

        return oldState;
    }

    const actionSegment = getActionCurve(ctx.mousePos);
    if (actionSegment && ctx.keyDown.get(KEYS.delete)) {
        drawCurve(ctx, actionSegment.shape, false, HighlightType.Delete);

        if (ctx.mouseReleased.left) {
            deleteSegment(actionSegment);
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

        if (ctx.mouseDown.left) {
            targetPos.assignTo(modifySegment.shape.point(1));

            circle(ctx, targetPos, 7, {
                thickness: 2,
                colour: HighlightType.Modify,
                dash: [3, 2]
            });
        }

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

    for (const connection of connections.values()) {
        circle(ctx, connection.point, 5, {
            thickness: 2,
            fill: HighlightType.None
        });
    }
}

function createSegment(shape: Bezier): Segment {
    // create vec2s from the points, then set the points back to the vec2s
    // this allows us to set the value of the vec2 and have it automatically go to the point, making life much easier
    // as any "connected" points all actually use the exact same vec2 instance as their point, so we only have to set
    // the new position at once place for it to propagate everywhere
    const startPoint = Vector2.import(shape.point(0));
    const controlPoint = Vector2.import(shape.point(2));
    const endPoint = Vector2.import(shape.point(3));

    shape.points[0] = startPoint;
    shape.points[1] = controlPoint;
    shape.points[2] = endPoint;

    return {
        id: uuid(),
        shape,
        startPoint, controlPoint, endPoint
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
        });

        circle(ctx, curveP0, 4, {
            fill: "#2c3d53"
        });

        circle(ctx, curveP1, 4, {
            fill: "#2c4d53"
        });

        circle(ctx, curveP2, 4, {
            fill: "#2c3d53"
        });
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
            deleteSegment(workingSegment);
            workingSegment = null;
            return CurveMakerState.Pre;
        } else {
            // finish this curve and start a new one at the end point
            segments.set(workingSegment.id, workingSegment);
            const previousSegment = workingSegment;

            workingSegment = createSegment(new Bezier([targetPoint, new Vector2(), new Vector2()]));

            connect(previousSegment, workingSegment, "end", "start");

            return CurveMakerState.End;
        }
    }

    drawCurve(ctx, workingSegment.shape);

    return oldState;
}



const canvas = new InteractiveCanvas("canvas");
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
