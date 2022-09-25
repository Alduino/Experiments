import {v4 as uuid} from "uuid";
import Vector2 from "../../../lib/Vector2";
import {LaneSegmentConnection} from "./LaneSegmentConnection";
import {dataStore, DataStoreKey} from "./DataStore";
import {DataStoreItem} from "./DataStoreItem";
import {CanvasFrameContext} from "../../../lib/canvas-setup";
import {circle, quadraticCurve} from "../../../lib/imgui";
import {HIGHLIGHT_COLOUR, HIGHLIGHT_THICKNESS} from "./constants";
import {JobFunctionContext, JobScheduler, Priority} from "../../../lib/utils/JobScheduler";
import iter from "itiriri";

export class LaneSegment implements DataStoreItem {
    readonly id: DataStoreKey<"laneSeg"> = `laneSeg:${uuid()}`;
    readonly #updateConnectionsJob = Symbol();
    readonly #updateControlPointJob = Symbol();
    readonly #jobScheduler: JobScheduler;

    readonly #startConnectionId: DataStoreKey<"laneSegConn">;
    readonly #endConnectionId: DataStoreKey<"laneSegConn">;

    #curve = 1;

    // set automatically based on the curve amount
    #controlPoint: Vector2;

    #otherConnectionIds = new Set<DataStoreKey<"laneSegConn">>();

    private constructor(jobScheduler: JobScheduler, startConnectionId: DataStoreKey<"laneSegConn">, endConnectionId: DataStoreKey<"laneSegConn">, curve) {
        this.#jobScheduler = jobScheduler;

        this.#startConnectionId = startConnectionId;
        this.#endConnectionId = endConnectionId;
        this.#curve = curve;

        this.#controlPoint = Vector2.lerp(
            dataStore.get(startConnectionId).position,
            dataStore.get(endConnectionId).position,
            0.5
        );

        this.#jobScheduler.register(this.#updateConnectionsJob, {
            priority: Priority.low,
            fn: this.#updateConnections.bind(this)
        });

        this.#jobScheduler.register(this.#updateControlPointJob, {
            priority: Priority.low,
            fn: this.#updateControlPoint.bind(this)
        });

        this.#jobScheduler.schedule(this.#updateControlPointJob);

        this.#registerConnectionEvents(startConnectionId);
        this.#registerConnectionEvents(endConnectionId);
    }

    get start() {
        return this.startConnection.position;
    }

    set start(position) {
        this.startConnection.position = position;
    }

    get end() {
        return this.endConnection.position;
    }

    set end(position) {
        this.endConnection.position = position;
    }

    get curve() {
        return this.#curve;
    }

    set curve(curve) {
        if (curve < 0 || curve > 1) throw new Error("Curve is out of range");
        this.#curve = curve;
        this.#jobScheduler.schedule(this.#updateControlPointJob);
    }

    get control() {
        return this.#controlPoint;
    }

    get startConnection() {
        return dataStore.get(this.#startConnectionId);
    }

    get endConnection() {
        return dataStore.get(this.#endConnectionId);
    }

    /**
     * Creates a lane segment that isn't linked to any other segments.
     * @param jobScheduler The global job scheduler.
     * @param start The start position of the segment.
     * @param end The end position of the segment.
     * @param curve The amount to curve this segment to follow the connected segments.
     */
    static createStandalone(jobScheduler: JobScheduler, start: Vector2, end: Vector2, curve = 0) {
        const startConnection = new LaneSegmentConnection(jobScheduler, start);
        const endConnection = new LaneSegmentConnection(jobScheduler, end);

        dataStore.register(startConnection);
        dataStore.register(endConnection);

        const segment = new LaneSegment(jobScheduler, startConnection.id, endConnection.id, curve);
        dataStore.register(segment);

        startConnection.addSegment(segment.id, 0);
        endConnection.addSegment(segment.id, 1);

        return segment;
    }

    /**
     * Creates a lane segment with its start linked to the end of another segment.
     * @param jobScheduler The global job scheduler.
     * @param startConnectionId The ID of the connection that the start of this segment connects to.
     * @param end The end position of this segment.
     * @param curve The amount to curve this segment to follow the connected segments.
     */
    static createWithStartLinked(jobScheduler: JobScheduler, startConnectionId: DataStoreKey<"laneSegConn">, end: Vector2, curve = 0) {
        const endConnection = new LaneSegmentConnection(jobScheduler, end);

        dataStore.register(endConnection);

        const startConnection = dataStore.get(startConnectionId);

        const segment = new LaneSegment(jobScheduler, startConnectionId, endConnection.id, curve);
        dataStore.register(segment);

        startConnection.addSegment(segment.id, 0);
        endConnection.addSegment(segment.id, 1);

        return segment;
    }

    /**
     * Creates a lane segment with both its start and end linked to other segments.
     * @param jobScheduler The global job scheduler.
     * @param startConnectionId The ID of the connection that the start of this segment connects to.
     * @param endConnectionId The ID of the connection that the end of this segment connects to.
     * @param curve The amount to curve this segment to follow the connected segments.
     */
    static createLinked(jobScheduler: JobScheduler, startConnectionId: DataStoreKey<"laneSegConn">, endConnectionId: DataStoreKey<"laneSegConn">, curve = 0) {
        const startConnection = dataStore.get(startConnectionId);
        const endConnection = dataStore.get(endConnectionId);

        const segment = new LaneSegment(jobScheduler, startConnectionId, endConnectionId, curve);
        dataStore.register(segment);

        startConnection.addSegment(segment.id, 0);
        endConnection.addSegment(segment.id, 1);

        return segment;
    }

    getPositionAt(position: number) {
        // TODO: use a bezier curve

        return Vector2.lerp(this.start, this.end, position);
    }

    getDirectionAt(pos: number) {
        const startDirection = this.control.subtract(this.start).normalise();
        const endDirection = this.end.subtract(this.control).normalise();
        return Vector2.lerp(startDirection, endDirection, pos);
    }

    highlight(ctx: CanvasFrameContext) {
        quadraticCurve(ctx, {
            start: this.start,
            control: this.control,
            end: this.end,
            thickness: HIGHLIGHT_THICKNESS,
            colour: HIGHLIGHT_COLOUR
        });

        circle(ctx, this.control, 12, {
            fill: "red"
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

    * #getAllConnectionIds() {
        yield this.#startConnectionId;
        for (const id of this.#otherConnectionIds) yield id;
        yield this.#endConnectionId;
    }

    #updateConnections() {
        // TODO
    }

    #getControlPoint() {
        const startConnection = this.startConnection;
        const endConnection = this.endConnection;

        const halfwayPoint = Vector2.lerp(startConnection.position, endConnection.position, 0.5);
        const straightDirection = endConnection.position.subtract(startConnection.position).normalise();

        if (this.curve === 0 || (startConnection.segmentCount <= 1 && endConnection.segmentCount <= 1)) {
            return halfwayPoint;
        } else if (startConnection.segmentCount > 1 && endConnection.segmentCount <= 1) {
            const averageDirection = startConnection.getAverageDirection(this.id);

            const averageDirectionAngle = averageDirection.dir();
            const newSegmentAngle = startConnection.position.angleTo(endConnection.position);
            const extensionAngle = averageDirectionAngle - newSegmentAngle;

            const controlOffsetDirection = straightDirection.perpendicular(true);
            const halfSegmentLength = startConnection.position.distance(halfwayPoint);
            const controlOffsetDistance = this.curve * halfSegmentLength * Math.tan(extensionAngle);
            return halfwayPoint.add(controlOffsetDirection.multiply(controlOffsetDistance));
        } else if (startConnection.segmentCount <= 1 && endConnection.segmentCount > 1) {
            const averageDirection = endConnection.getAverageDirection(this.id);

            const averageDirectionAngle = averageDirection.dir();
            const newSegmentAngle = endConnection.position.angleTo(startConnection.position);
            const extensionAngle = averageDirectionAngle - newSegmentAngle;

            const controlOffsetDirection = straightDirection.perpendicular(true);
            const halfSegmentLength = startConnection.position.distance(halfwayPoint);
            const controlOffsetDistance = this.curve * halfSegmentLength * Math.tan(extensionAngle);
            return halfwayPoint.add(controlOffsetDirection.multiply(controlOffsetDistance));
        } else {
            const startAverageDirection = startConnection.getAverageDirection(this.id);
            const endAverageDirection = endConnection.getAverageDirection(this.id);

            // make both directions be pointing the same way, from / \ to / / so we can average them
            const endAverageDirectionRotated = endAverageDirection.rotate(Math.PI);
            const averageDirection = startAverageDirection.add(endAverageDirectionRotated).divide(2);

            const averageDirectionAngle = averageDirection.dir();
            const newSegmentAngle = startConnection.position.angleTo(endConnection.position);
            const extensionAngle = averageDirectionAngle - newSegmentAngle;

            const controlOffsetDirection = straightDirection.perpendicular(true);
            const halfSegmentLength = startConnection.position.distance(halfwayPoint);
            const controlOffsetDistance = this.curve * halfSegmentLength * Math.tan(extensionAngle);
            return halfwayPoint.add(controlOffsetDirection.multiply(controlOffsetDistance));
        }
    }

    #updateControlPoint(ctx: JobFunctionContext, depth = 0) {
        const oldControlPoint = this.#controlPoint;
        this.#controlPoint = this.#getControlPoint();

        if (depth < 1000 && oldControlPoint.distance(this.#controlPoint) > 0.5) {
            this.#jobScheduler.schedule(this.#updateConnectionsJob);

            for (const connectionId of this.#getAllConnectionIds()) {
                const connection = dataStore.get(connectionId);

                iter(connection.mapSegments(segmentId => segmentId, this.id)).forEach(segmentId => {
                    const segment = dataStore.get(segmentId);
                    segment.#updateControlPoint(ctx, depth + 1);
                });
            }
        }
    }

    #registerConnectionEvents(connectionId: DataStoreKey<"laneSegConn">) {
        const connection = dataStore.get(connectionId);

        connection.changedEvent.listen(() => {
            this.#jobScheduler.schedule(this.#updateControlPointJob);
        });
    }
}
