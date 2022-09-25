import {v4 as uuid} from "uuid";
import Vector2 from "../../../lib/Vector2";
import {dataStore, DataStoreKey} from "./DataStore";
import {DataStoreItem} from "./DataStoreItem";
import {CanvasFrameContext} from "../../../lib/canvas-setup";
import {circle} from "../../../lib/imgui";
import {HIGHLIGHT_COLOUR, HIGHLIGHT_THICKNESS} from "./constants";
import iter from "itiriri";
import SingleEventEmitter from "../../../lib/utils/SingleEventEmitter";
import {JobScheduler, Priority} from "../../../lib/utils/JobScheduler";

interface LaneSegmentConnectionSegment {
    segmentId: DataStoreKey<"laneSeg">;
    position: number;
}

export class LaneSegmentConnection implements DataStoreItem {
    readonly id: DataStoreKey<"laneSegConn"> = `laneSegConn:${uuid()}` as const;
    readonly #segments = new Set<LaneSegmentConnectionSegment>;

    readonly #changedEvent = new SingleEventEmitter();

    #position: Vector2;
    #curve = 10;

    constructor(jobScheduler: JobScheduler, position: Vector2) {
        this.#position = position;
        this.#changedEvent.enableJobScheduling(jobScheduler, Priority.high);
    }

    get changedEvent() {
        return this.#changedEvent.getListener();
    }

    get position() {
        return this.#position;
    }

    set position(position) {
        this.#position = position;
        this.#changedEvent.emit();
    }

    get segmentCount() {
        return this.#segments.size;
    }

    /**
     * Curves the connection the end of one lane segment, and the place it connects to on another segment.
     * If both connections are in the middle of the segments, no curving is applied (the user has to do that manually).
     *
     * The actual value means the number of units before the connection to start a Bézier curve,
     * whose control point is this connection's position.
     *
     * @default 10
     */
    get curve() {
        return this.#curve;
    }

    set curve(value) {
        this.#curve = value;
    }

    addSegment(segmentId: DataStoreKey<"laneSeg">, position: number) {
        this.#segments.add({
            segmentId,
            position
        });
    }

    highlight(ctx: CanvasFrameContext) {
        circle(ctx, this.position, HIGHLIGHT_THICKNESS, {
            fill: HIGHLIGHT_COLOUR
        });
    }

    * mapSegments<T>(map: (segmentId: DataStoreKey<"laneSeg">, connectionPosition: number) => T, ignoreSegment?: DataStoreKey<"laneSeg">): Iterable<T> {
        for (const segment of this.#segments) {
            if (segment.segmentId === ignoreSegment) continue;
            yield map(segment.segmentId, segment.position);
        }
    }

    getAverageDirection(ignoreSegment?: DataStoreKey<"laneSeg">): Vector2 {
        const directions = iter(this.mapSegments((id, pos) => {
            const segment = dataStore.get(id);
            return segment.getDirectionAt(pos);
        }, ignoreSegment));

        const total = directions.reduce((accumulator, current) => accumulator.add(current));
        const count = ignoreSegment ? this.segmentCount - 1 : this.segmentCount;

        return total.divide(count);
    }

    getPositionIn(segmentId: DataStoreKey<"laneSeg">) {
        const segInfo = iter(this.#segments)
            .find(({segmentId: haystackSegmentId}) => haystackSegmentId === segmentId);

        if (!segInfo) throw new Error(`Segment {${segmentId}} is not part of connection`);

        return segInfo.position;
    }
}
