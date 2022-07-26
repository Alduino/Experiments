import {v4 as uuid} from "uuid";
import Vector2 from "../../../lib/Vector2";
import {LaneSegmentConnection} from "./LaneSegmentConnection";
import {dataStore, DataStoreKey} from "./DataStore";
import {DataStoreItem} from "./DataStoreItem";
import {CanvasFrameContext} from "../../../lib/canvas-setup";
import {line} from "../../../lib/imgui";
import {HIGHLIGHT_COLOUR, HIGHLIGHT_THICKNESS} from "./constants";
import {JobScheduler, Priority} from "./JobScheduler";

export class LaneSegment implements DataStoreItem {
    readonly id: DataStoreKey<"laneSeg"> = `laneSeg:${uuid()}`;
    readonly #updateConnectionsJob = Symbol();
    readonly #jobScheduler: JobScheduler;

    readonly #startConnectionId: DataStoreKey<"laneSegConn">;
    readonly #endConnectionId: DataStoreKey<"laneSegConn">;

    #otherConnectionIds = new Set<DataStoreKey<"laneSegConn">>();

    private constructor(jobScheduler: JobScheduler, startConnectionId: DataStoreKey<"laneSegConn">, endConnectionId: DataStoreKey<"laneSegConn">) {
        this.#jobScheduler = jobScheduler;

        this.#startConnectionId = startConnectionId;
        this.#endConnectionId = endConnectionId;

        this.#jobScheduler.register(this.#updateConnectionsJob, {
            priority: Priority.low,
            fn: this.#updateConnections.bind(this)
        });

        this.#jobScheduler.schedule(this.#updateConnectionsJob);
    }

    get start() {
        return this.#startConnection.position;
    }

    set start(position) {
        this.#startConnection.position = position;
        this.#jobScheduler.schedule(this.#updateConnectionsJob);
    }

    get end() {
        return this.#endConnection.position;
    }

    set end(position) {
        this.#endConnection.position = position;
        this.#jobScheduler.schedule(this.#updateConnectionsJob);
    }

    get #startConnection() {
        return dataStore.get(this.#startConnectionId);
    }

    get #endConnection() {
        return dataStore.get(this.#endConnectionId);
    }

    /**
     * Creates a lane segment that isn't linked to any other segments.
     * @param jobScheduler The global job scheduler.
     * @param start The start position of the segment
     * @param end The end position of the segment
     */
    static createStandalone(jobScheduler: JobScheduler, start: Vector2, end: Vector2) {
        const startConnection = new LaneSegmentConnection(start);
        const endConnection = new LaneSegmentConnection(end);

        dataStore.register(startConnection);
        dataStore.register(endConnection);

        return new LaneSegment(jobScheduler, startConnection.id, endConnection.id);
    }

    /**
     * Creates a lane segment with its start linked to the end of another segment.
     * @param jobScheduler The global job scheduler.
     * @param startConnectionId The ID of the connection that the start of this segment connects to.
     * @param end The end position of this segment.
     */
    static createWithStartLinked(jobScheduler: JobScheduler, startConnectionId: DataStoreKey<"laneSegConn">, end: Vector2) {
        const endConnection = new LaneSegmentConnection(end);

        dataStore.register(endConnection);

        return new LaneSegment(jobScheduler, startConnectionId, endConnection.id);
    }

    /**
     * Creates a lane segment with both its start and end linked to other segments.
     * @param jobScheduler The global job scheduler.
     * @param startConnectionId The ID of the connection that the start of this segment connects to.
     * @param endConnectionId The ID of the connection that the end of this segment connects to.
     */
    static createLinked(jobScheduler: JobScheduler, startConnectionId: DataStoreKey<"laneSegConn">, endConnectionId: DataStoreKey<"laneSegConn">) {
        return new LaneSegment(jobScheduler, startConnectionId, endConnectionId);
    }

    getPositionAt(position: number) {
        // TODO: use a bezier curve

        return Vector2.lerp(this.start, this.end, position);
    }

    highlight(ctx: CanvasFrameContext) {
        line(ctx, {
            start: this.start,
            end: this.end,
            thickness: HIGHLIGHT_THICKNESS,
            colour: HIGHLIGHT_COLOUR
        });
    }

    getClosestPointDistanceSquared(point: Vector2) {
        // from https://stackoverflow.com/a/1501725
        const endMinusStart = this.end.subtract(this.start);
        const l2 = endMinusStart.lengthSquared();
        const t = Math.max(0, Math.min(1, point.subtract(this.start).dot(endMinusStart) / l2));
        const projection = this.start.add(endMinusStart.multiply(t));
        return projection.distanceSquared(point);
    }

    #updateConnections() {
        console.log("Updating connections.");
    }
}
