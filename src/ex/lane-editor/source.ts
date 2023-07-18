import InteractiveCanvas, {InteractiveCanvasFrameContext, waitUntil} from "../../lib/canvas-setup";
import {AnyDataStoreKey, dataStore, DataStoreKey} from "./lib/DataStore";
import {clear, copyFrom, line, quadraticCurve} from "../../lib/imgui";
import {LaneSegment} from "./lib/LaneSegment";
import {SNAP_DISTANCE_SQUARED} from "./lib/constants";
import {LaneSegmentConnection} from "./lib/LaneSegmentConnection";
import ButtonComponent from "../../lib/utils/scui/components/ButtonComponent";
import FlexComponent from "../../lib/utils/scui/components/FlexComponent";
import RootComponent from "../../lib/utils/scui/lib/RootComponent";
import AbsoluteComponent from "../../lib/utils/scui/components/AbsoluteComponent";
import Vector2 from "../../lib/Vector2";
import {drawScuiInspector} from "../../lib/utils/scui/lib/debugger";
import {JobScheduler} from "../../lib/utils/JobScheduler";
import iter from "itiriri";
import {CoroutineGenerator, CoroutineGeneratorFunction} from "../../lib/coroutines";

enum InteractionMode {
    add,
    move
}

let interactionMode = InteractionMode.add;

const canvas = new InteractiveCanvas("canvas");
const cm = canvas.getCoroutineManager();
const handleCoroutines = canvas.useManualCoroutineTiming();
const jobScheduler = new JobScheduler();

const absolutePositionComponent = new AbsoluteComponent();

const componentsRoot = new RootComponent();
componentsRoot.setChild(absolutePositionComponent);

const {button: addSegmentButton} = ButtonComponent.createWithText(canvas, "Add mode");
const {button: moveSegmentButton} = ButtonComponent.createWithText(canvas, "Move mode");

addSegmentButton.clickedEvent.listen(() => {
    interactionMode = InteractionMode.add;
});

moveSegmentButton.clickedEvent.listen(() => {
    interactionMode = InteractionMode.move;
});

const controlsContainer = new FlexComponent();
controlsContainer.addChildren(addSegmentButton, moveSegmentButton);
absolutePositionComponent.addChild(controlsContainer);

absolutePositionComponent.setChildPosition(controlsContainer, new Vector2(10, 200));

componentsRoot.setDrawnPosition(Vector2.zero);
componentsRoot.setSize(canvas.size);

let popInspectCursor: () => void | null = null;

type DrawnConnectionsKey = `${DataStoreKey<"laneSeg">}@${string}/${DataStoreKey<"laneSeg">}@${string}`;

function getDrawnConnectionsKey(connection: LaneSegmentConnection, segmentIdA: DataStoreKey<"laneSeg">, segmentIdB: DataStoreKey<"laneSeg">): DrawnConnectionsKey {
    const [segIdA, segIdB] = [segmentIdA, segmentIdB].sort();
    const segAPos = connection.getPositionIn(segIdA);
    const segBPos = connection.getPositionIn(segIdB);
    return `${segIdA}@${segAPos}/${segIdB}@${segBPos}`;
}

canvas.start(ctx => {
    clear(ctx);

    componentsRoot.setSize(canvas.size);
    componentsRoot.handleBatchedUpdates();

    jobScheduler.runJobs();
    handleCoroutines();

    if (ctx.keyPressed.get("ArrowUp")) {
        for (const connectionId of dataStore.list("laneSegConn")) dataStore.get(connectionId).curve *= 1.5;
    } else if (ctx.keyPressed.get("ArrowDown")) {
        for (const connectionId of dataStore.list("laneSegConn")) dataStore.get(connectionId).curve /= 1.5;
    }

    const drawnConnections = new Set<DrawnConnectionsKey>();

    for (const laneSegmentId of dataStore.list("laneSeg")) {
        const laneSegment = dataStore.get(laneSegmentId);

        const startDirection = laneSegment.getDirectionAt(0);
        const endDirection = laneSegment.getDirectionAt(1);

        const {startConnection, endConnection} = laneSegment;

        const mainStartOffsetAmnt = startConnection.segmentCount === 1 ? 0 : startConnection.curve;
        const mainEndOffsetAmnt = endConnection.segmentCount === 1 ? 0 : endConnection.curve;

        const mainStart = laneSegment.start.add(startDirection.multiply(mainStartOffsetAmnt));
        const mainEnd = laneSegment.end.subtract(endDirection.multiply(mainEndOffsetAmnt));

        quadraticCurve(ctx, {
            start: mainStart,
            control: laneSegment.control,
            end: mainEnd,
            thickness: 4,
            colour: "black"
        });

        iter(startConnection.mapSegments((id, pos) => [dataStore.get(id), pos] as const, laneSegment.id))
            .forEach(([segment, position]) => {
                const drawnConnectionsKey = getDrawnConnectionsKey(startConnection, laneSegmentId, segment.id);

                if (drawnConnections.has(drawnConnectionsKey)) return;
                drawnConnections.add(drawnConnectionsKey);

                if (position !== 0 && position !== 1) throw new Error("Connections to the middle aren't supported yet");

                const endPosition = position === 0 ? segment.start : segment.end;
                const endDirection = segment.getDirectionAt(position);
                const endOffset = endDirection.multiply(startConnection.curve);

                const offsetEnd = position === 0 ? endPosition.add(endOffset) : endPosition.subtract(endOffset);

                quadraticCurve(ctx, {
                    start: offsetEnd,
                    control: startConnection.position,
                    end: mainStart,
                    thickness: 4,
                    colour: "black"
                });
            });

        iter(endConnection.mapSegments((id, pos) => [dataStore.get(id), pos] as const, laneSegment.id))
            .forEach(([segment, position]) => {
                const drawnConnectionsKey = getDrawnConnectionsKey(endConnection, laneSegmentId, segment.id);

                if (drawnConnections.has(drawnConnectionsKey)) return;
                drawnConnections.add(drawnConnectionsKey);

                if (position !== 0 && position !== 1) throw new Error("Connections to the middle aren't supported yet");

                const endPosition = position === 0 ? segment.start : segment.end;
                const endDirection = segment.getDirectionAt(position);
                const endOffset = endDirection.multiply(endConnection.curve);

                const offsetEnd = position === 0 ? endPosition.add(endOffset) : endPosition.subtract(endOffset);

                quadraticCurve(ctx, {
                    start: offsetEnd,
                    control: endConnection.position,
                    end: mainEnd,
                    thickness: 4,
                    colour: "black"
                });
            });
    }

    componentsRoot.render();
    const imageSource = componentsRoot.getImageSource();
    copyFrom(imageSource, ctx, Vector2.zero);

    if (ctx.keyDown.get("d")) {
        if (!popInspectCursor) {
            popInspectCursor = canvas.pushCursor("crosshair");
        }

        drawScuiInspector(ctx, componentsRoot);
        canvas.pauseCoroutines = true;
    } else {
        popInspectCursor?.();
        popInspectCursor = null;

        canvas.pauseCoroutines = false;
    }

    canvas.drawDebug(ctx);
});

function startSnapping(): () => AnyDataStoreKey | null {
    let snappedId: AnyDataStoreKey | null = null;

    const {stop: stopDrawingHighlight} = cm.startCoroutine(function* drawHighlight() {
        while (true) {
            const {ctx} = yield waitUntil.nextFrame();

            if (!snappedId) continue;
            const obj = dataStore.get(snappedId);
            obj.highlight(ctx);
        }
    });

    const {stop: stopHandlingMouse} = cm.startCoroutine(function* handleMouse() {
        while (true) {
            const {ctx} = yield waitUntil.mouseMoved();
            const {mousePos} = ctx;

            let minDistanceSq = Infinity, minDistanceId = undefined;

            for (const connectionId of dataStore.list("laneSegConn")) {
                const connection = dataStore.get(connectionId);

                const distanceSquared = mousePos.distanceSquared(connection.position);

                if (distanceSquared < SNAP_DISTANCE_SQUARED && distanceSquared < minDistanceSq) {
                    minDistanceSq = distanceSquared;
                    minDistanceId = connectionId;
                }
            }

            // prefer snapping to connections
            if (minDistanceId) {
                snappedId = minDistanceId;
                continue;
            }

            for (const segmentId of dataStore.list("laneSeg")) {
                const segment = dataStore.get(segmentId);
                const distanceSquared = segment.getClosestPointDistanceSquared(mousePos);

                if (distanceSquared < SNAP_DISTANCE_SQUARED && distanceSquared < minDistanceSq) {
                    minDistanceSq = distanceSquared;
                    minDistanceId = segmentId;
                }
            }

            snappedId = minDistanceId;
        }
    });

    return () => {
        stopDrawingHighlight();
        stopHandlingMouse();
        return snappedId;
    };
}

function buildSegment(startConnectionId: DataStoreKey<"laneSegConn">, isNewStartConnection: boolean): CoroutineGeneratorFunction<InteractiveCanvasFrameContext> {
    return function* handleSegmentBuilding(): CoroutineGenerator<InteractiveCanvasFrameContext> {
        const {stop: stopDisplayingWorkingLine} = cm.startCoroutine(function* displayWorkingLine() {
            while (true) {
                const {ctx} = yield waitUntil.nextFrame();

                line(ctx, {
                    start: dataStore.get(startConnectionId).position,
                    end: ctx.mousePos,
                    thickness: 2,
                    colour: "grey"
                });
            }
        });

        const getSnappedObject = startSnapping();

        const {ctx} = yield waitUntil.leftMouseReleased();
        stopDisplayingWorkingLine();

        const snappedId = getSnappedObject();
        const startPosition = dataStore.get(startConnectionId).position;

        if (!snappedId) {
            const endPosition = ctx.mousePos;

            if (Vector2.equal(startPosition, endPosition)) {
                if (isNewStartConnection) dataStore.delete(startConnectionId);
                return;
            }

            LaneSegment.createWithStartLinked(jobScheduler, startConnectionId, endPosition);
        } else if (dataStore.isType(snappedId, "laneSegConn")) {
            if (snappedId === startConnectionId) {
                if (isNewStartConnection) dataStore.delete(startConnectionId);
                return;
            }

            LaneSegment.createLinked(jobScheduler, startConnectionId, snappedId);
        }
    }
}

cm.startCoroutine(function* init() {
    const focusTarget = cm.getFocusTargetManager().createFocusTarget();

    while (true) {
        focusTarget.blur();

        const getSnappedObject = startSnapping();

        let x = yield waitUntil.leftMousePressed({focusTarget});
        focusTarget.focus();

        const snappedId = getSnappedObject();

        if (interactionMode === InteractionMode.add) {
            if (!snappedId) {
                const startPosition = x.ctx.mousePos;
                const startConnection = new LaneSegmentConnection(jobScheduler, startPosition);
                dataStore.register(startConnection);

                yield buildSegment(startConnection.id, true);
            } else if (dataStore.isType(snappedId, "laneSegConn")) {
                yield buildSegment(snappedId, false);
            }
        } else if (interactionMode === InteractionMode.move) {
            if (dataStore.isType(snappedId, "laneSegConn")) {
                const connection = dataStore.get(snappedId);

                const {stop} = cm.startCoroutine(function* moveConnection() {
                    while (true) {
                        const {ctx} = yield waitUntil.mouseMoved();
                        connection.position = ctx.mousePos;
                    }
                });

                yield waitUntil.leftMouseReleased();

                stop();
            } else if (dataStore.isType(snappedId, "laneSeg")) {
                const segment = dataStore.get(snappedId);

                const {stop} = cm.startCoroutine(function* updateCurveAmount() {
                    while (true) {
                        const {ctx} = yield waitUntil.mouseMoved();

                        const segmentMidpoint = Vector2.lerp(segment.start, segment.end, 0.5);
                        const segmentLength = segment.start.distance(segment.end);
                        const segmentDirection = segment.start.angleTo(segment.end);

                        const mouseOffset = ctx.mousePos.subtract(segmentMidpoint);
                        const mouseOffsetRotated = mouseOffset.rotate(segmentDirection);
                        const mouseDistance = -mouseOffsetRotated.y;

                        segment.curve = Math.min(Math.max(mouseDistance / segmentLength, 0), 1);
                    }
                });

                yield waitUntil.leftMouseReleased();

                stop();
            }
        }
    }
});
