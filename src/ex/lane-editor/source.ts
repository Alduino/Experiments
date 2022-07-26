import InteractiveCanvas, {CoroutineGenerator, CoroutineGeneratorFunction, waitUntil} from "../../lib/canvas-setup";
import {AnyDataStoreKey, dataStore, DataStoreKey} from "./lib/DataStore";
import {clear, copyFrom, line} from "../../lib/imgui";
import {LaneSegment} from "./lib/LaneSegment";
import {SNAP_DISTANCE_SQUARED} from "./lib/constants";
import {JobScheduler} from "./lib/JobScheduler";
import {LaneSegmentConnection} from "./lib/LaneSegmentConnection";
import ButtonComponent from "../../lib/utils/scui/components/ButtonComponent";
import FlexComponent from "../../lib/utils/scui/components/FlexComponent";
import RootComponent from "../../lib/utils/scui/lib/RootComponent";
import AbsoluteComponent from "../../lib/utils/scui/components/AbsoluteComponent";
import Vector2 from "../../lib/Vector2";
import {drawScuiInspector} from "../../lib/utils/scui/lib/debugger";

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

canvas.start(ctx => {
    clear(ctx);

    componentsRoot.setSize(canvas.size);
    componentsRoot.handleBatchedUpdates();

    jobScheduler.runJobs();
    handleCoroutines();

    for (const laneSegmentId of dataStore.list("laneSeg")) {
        const laneSegment = dataStore.get(laneSegmentId);

        line(ctx, {
            start: laneSegment.start,
            end: laneSegment.end,
            thickness: 4,
            colour: "black"
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

function buildSegment(startConnectionId: DataStoreKey<"laneSegConn">, canDeregisterStartConnection: boolean): CoroutineGeneratorFunction {
    return function* handleSegmentBuilding(): CoroutineGenerator {
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
                if (canDeregisterStartConnection) dataStore.delete(startConnectionId);
                return;
            }

            const laneSegment = LaneSegment.createWithStartLinked(jobScheduler, startConnectionId, endPosition);
            dataStore.register(laneSegment);
        } else if (dataStore.isType(snappedId, "laneSegConn")) {
            const endPosition = dataStore.get(snappedId).position;

            if (Vector2.equal(startPosition, endPosition)) {
                if (canDeregisterStartConnection) dataStore.delete(startConnectionId);
                return;
            }

            const laneSegment = LaneSegment.createLinked(jobScheduler, startConnectionId, snappedId);
            dataStore.register(laneSegment);
        }
    }
}

cm.startCoroutine(function* init() {
    const focusTarget = cm.createFocusTarget();

    while (true) {
        focusTarget.blur();

        const getSnappedObject = startSnapping();

        let x = yield waitUntil.leftMousePressed({focusTarget});
        focusTarget.focus();

        const snappedId = getSnappedObject();

        if (interactionMode === InteractionMode.add) {
            if (!snappedId) {
                const startPosition = x.ctx.mousePos;
                const startConnection = new LaneSegmentConnection(startPosition);
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
            }
        }
    }
});
