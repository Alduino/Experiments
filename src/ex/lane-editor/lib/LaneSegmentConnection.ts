import {v4 as uuid} from "uuid";
import Vector2 from "../../../lib/Vector2";
import {LaneSegment} from "./LaneSegment";
import {DataStoreKey} from "./DataStore";
import {DataStoreItem} from "./DataStoreItem";
import {CanvasFrameContext} from "../../../lib/canvas-setup";
import {circle} from "../../../lib/imgui";
import {HIGHLIGHT_COLOUR, HIGHLIGHT_THICKNESS} from "./constants";

interface LaneSegmentConnectionSegment {
    segmentId: string;
    position: number;
}

export class LaneSegmentConnection implements DataStoreItem {
    readonly id: DataStoreKey<"laneSegConn"> = `laneSegConn:${uuid()}` as const;
    readonly #segments = new Set<LaneSegmentConnectionSegment>;

    #position: Vector2;

    constructor(position: Vector2) {
        this.#position = position;
    }

    get position() {
        return this.#position;
    }

    set position(position) {
        this.#position = position;
    }

    addSegment(segment: LaneSegment, position: number) {
        this.#segments.add({
            segmentId: segment.id,
            position
        });
    }

    highlight(ctx: CanvasFrameContext) {
        circle(ctx, this.position, HIGHLIGHT_THICKNESS, {
            fill: HIGHLIGHT_COLOUR
        });
    }
}
