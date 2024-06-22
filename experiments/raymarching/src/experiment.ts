import {CanvasFrameContext, InteractiveCanvas, InteractiveCanvasFrameContext} from "@experiment-libs/canvas";
import {getCanvas} from "@experiment-libs/experiment/experiment";
import {circle, line, rect} from "@experiment-libs/imui";
import {Vector2} from "@experiment-libs/utils";

const EPSILON = 0.0001;
const MAX_STEPS = 1000;
const MAX_DISTANCE = 1024;

interface Shape {
    render(ctx: CanvasFrameContext): void;

    getSignedDistance(pos: Vector2): number;
}

class CircleShape implements Shape {
    constructor(private position: Vector2, private radius: number) {
    }

    render(ctx: CanvasFrameContext): void {
        circle(ctx, this.position, this.radius, {
            thickness: 1,
            colour: "yellow"
        });
    }

    getSignedDistance(pos: Vector2): number {
        return this.position.distance(pos) - this.radius;
    }
}

class RectangleShape implements Shape {
    readonly #center: Vector2;
    readonly #halfSize: Vector2;

    constructor(private a: Vector2, private b: Vector2) {
        this.#center = a.add(b).divide(2);
        this.#halfSize = b.subtract(a).abs().divide(2);
    }

    render(ctx: CanvasFrameContext): void {
        rect(ctx, this.a, this.b, {
            thickness: 1,
            colour: "yellow"
        });
    }

    getSignedDistance(pos: Vector2): number {
        const componentWiseEdgeDistance = this.#center.subtract(pos).abs().subtract(this.#halfSize);
        const outsideDistance = Vector2.max(componentWiseEdgeDistance, Vector2.zero).length();
        const insideDistance = Math.min(Math.max(componentWiseEdgeDistance.x, componentWiseEdgeDistance.y), 0);
        return outsideDistance + insideDistance;
    }
}

const canvas = new InteractiveCanvas(getCanvas());

const shapes: Shape[] = [
    new CircleShape(new Vector2(600, 250), 200),
    new CircleShape(new Vector2(200, 200), 100),
    new RectangleShape(new Vector2(200, 400), new Vector2(400, 500))
];

let stats = {
    deepestRecursion: 0,
    mostSteps: 0,
    mostStepsCount: 0,
    totalSteps: 0,
};

function getClosestShape(position: Vector2) {
    let minDist = Infinity, minDistShape: Shape | null = null;

    for (const shape of shapes) {
        const distance = shape.getSignedDistance(position);
        if (distance > minDist) continue;

        minDist = distance;
        minDistShape = shape;
    }

    return {distance: minDist, shape: minDistShape};
}

function march(origin: Vector2, direction: Vector2) {
    let currentDistance = 0, closestDistance = Infinity, closestDistanceDistance = Infinity;

    for (let step = 0; step < MAX_STEPS; step++) {
        if (step > stats.mostSteps) {
            stats.mostSteps = step;
            stats.mostStepsCount = 1;
        } else if (step === stats.mostSteps) {
            stats.mostStepsCount++;
        }

        stats.totalSteps++;

        const {
            distance,
            shape
        } = getClosestShape(origin.add(direction.multiply(currentDistance)));

        if (distance > MAX_DISTANCE) {
            break;
        }

        if (distance < closestDistance) {
            closestDistance = distance;
            closestDistanceDistance = currentDistance;
        }

        currentDistance += distance;

        if (distance < EPSILON && shape) {
            return {
                didHit: true,
                shape,
                distance: currentDistance,
                passby: {distanceFromShape: closestDistance, distanceFromOrigin: closestDistanceDistance}
            } as const;
        }
    }

    return {
        didHit: false,
        passby: {distanceFromShape: closestDistance, distanceFromOrigin: closestDistanceDistance}
    } as const;
}

class Ray {
    #hit: ReturnType<typeof march> | null = null;

    constructor(readonly origin: Vector2, readonly theta: number, readonly id: string) {
    }

    march() {
        this.#hit = march(this.origin, Vector2.fromDir(this.theta));
    }

    getDirectionVector() {
        return Vector2.fromDir(this.theta);
    }

    getResult(): RayResult | null {
        if (!this.#hit?.didHit) return null;
        return new RayResult(this, this.#hit);
    }

    getClosestPassbyAngle() {
        if (!this.#hit) return Infinity;
        return Math.atan2(this.#hit.passby.distanceFromShape, this.#hit.passby.distanceFromOrigin);
    }
}

class RayResult {
    constructor(private readonly ray: Ray, private readonly hit: Exclude<ReturnType<typeof march>, null | {
        didHit: false
    }>) {
    }

    getShape() {
        return this.hit.shape;
    }

    getPoint() {
        return this.ray.origin.add(this.ray.getDirectionVector().multiply(this.hit.distance));
    }
}

function circularMean(...angles: number[]) {
    const directionVectors = angles.map(angle => Vector2.fromDir(angle));
    const averageDirection = directionVectors.reduce((total, current) => total.add(current))
        .divide(directionVectors.length);
    return Vector2.zero.angleTo(averageDirection);
}

function recursiveMarch(origin: Vector2, minRay: Ray, maxRay: Ray, parentId: string, depth = 0): readonly Ray[] {
    if (depth > stats.deepestRecursion) stats.deepestRecursion = depth;

    const minRayResult = minRay.getResult();
    const maxRayResult = maxRay.getResult();

    if (!minRayResult && !maxRayResult) {
        const maxPassbyAngle = Math.PI;
        const minRayPassbyAngle = minRay.getClosestPassbyAngle();
        const maxRayPassbyAngle = maxRay.getClosestPassbyAngle();

        // don't go too deep into areas that might have nothing
        if (!minRayResult && !maxRayResult && minRayPassbyAngle > maxPassbyAngle && maxRayPassbyAngle > maxPassbyAngle && depth > 2) return [];

        const minRayPassbyDepth = 2 + ((1 - minRayPassbyAngle / maxPassbyAngle) ** 2) * 3;
        const maxRayPassbyDepth = 2 + ((1 - maxRayPassbyAngle / maxPassbyAngle) ** 2) * 3;

        // allow more detail close to shapes
        if ((!minRayResult && depth > minRayPassbyDepth) && (!maxRayResult && depth > maxRayPassbyDepth)) return [];
    }

    if ((!minRayResult || !maxRayResult) && depth > 8) return [];

    // no need to keep marching if the points are close
    if (minRayResult && maxRayResult && minRayResult.getPoint().distance(maxRayResult.getPoint()) < 1) return [];

    // don't get too deep
    if (depth > 16) return [];

    const theta = circularMean(minRay.theta, maxRay.theta);
    const ray = new Ray(origin, theta, `${parentId}/M`);
    ray.march();

    const rayResult = ray.getResult();
    if (minRayResult && maxRayResult && rayResult) {
        const minRayPt = minRayResult.getPoint();
        const maxRayPt = maxRayResult.getPoint();
        const rayPt = rayResult.getPoint();

        // we only care about the ray if it makes a significant contribution
        const offsetFromStraight = minRayPt.add(maxRayPt).divide(2).distanceSquared(rayPt);

        if (offsetFromStraight < 0.5 ** 2) {
            return [];
        }
    }

    return [
        ...recursiveMarch(origin, minRay, ray, `${parentId}/L`, depth + 1),
        ray,
        ...recursiveMarch(origin, ray, maxRay, `${parentId}/H`, depth + 1)
    ];
}

function marchAroundPoint(origin: Vector2) {
    const initialRayCount = 4;
    const initialRays = new Array<Ray>(initialRayCount);

    for (let i = 0; i < initialRays.length; i++) {
        const theta = (i / initialRayCount) * Math.PI * 2;
        const ray = new Ray(origin, theta, `R${i}`);
        ray.march();
        initialRays[i] = ray;
    }

    return initialRays.flatMap((ray, index) => {
        const nextRay = initialRays[(index + 1) % initialRayCount];

        return [
            ray,
            ...recursiveMarch(origin, ray, nextRay, ray.id)
        ];
    })
}

// Shifts all the items after `startIndex` to the beginning of the array.
function moveEndToStart<T>(array: T[], startIndex: number): T[] {
    startIndex %= array.length;
    if (startIndex === 0) return array;
    return array.slice(startIndex, array.length).concat(array.slice(0, startIndex));
}

function getRenderedPoint(ray: Ray) {
    const result = ray.getResult();
    if (result) return result.getPoint();

    return ray.origin.add(Vector2.fromDir(ray.theta).multiply(MAX_DISTANCE));
}

const gradientCanvas = new OffscreenCanvas(MAX_DISTANCE * 2, MAX_DISTANCE * 2);
const gradientCtx = gradientCanvas.getContext("2d")!;
const gradientGradient = gradientCtx.createRadialGradient(MAX_DISTANCE, MAX_DISTANCE, 0, MAX_DISTANCE, MAX_DISTANCE, MAX_DISTANCE);
const gradientStops = 16;
for (let i = 0; i <= gradientStops; i++) {
    const time = i / (gradientStops + 1);
    const brightness = 1 / ((time + 1) ** 2);
    const colour = `oklch(${Math.floor(brightness * 100)}% 5% 60deg / ${Math.floor(100 - time * 100)}%)`;
    gradientGradient.addColorStop(time, colour);
}
gradientGradient.addColorStop(1, "#0000");
gradientCtx.fillStyle = gradientGradient;
gradientCtx.fillRect(0, 0, MAX_DISTANCE * 2, MAX_DISTANCE * 2);
const gradientImage = gradientCanvas.transferToImageBitmap();

function renderLight(ctx: InteractiveCanvasFrameContext, origin: Vector2) {
    stats = {deepestRecursion: 0, mostSteps: 0, mostStepsCount: 0, totalSteps: 0};

    const marchingStart = performance.now();
    const rays = marchAroundPoint(origin);
    const marchingDuration = performance.now() - marchingStart;

    if (rays.every(ray => ray.getResult() !== null)) {
        // every ray is a hit, so we don't start at the origin (because we are completely surrounded)
        ctx.renderer.beginPath();

        const firstPoint = rays[0].getResult()!.getPoint();
        ctx.renderer.moveTo(firstPoint.x, firstPoint.y);
        for (const ray of rays) {
            const point = ray.getResult()!.getPoint();
            ctx.renderer.lineTo(point.x, point.y);
        }
        ctx.renderer.closePath();
    } else {
        // rotate the array so that the first item is a hit and the last is a miss

        // will definitely not be -1 because we handle that above
        const lastNonMissIndex = rays.findLastIndex(ray => ray.getResult() === null) + 1;

        const rotatedRays = moveEndToStart(rays, lastNonMissIndex);

        ctx.renderer.beginPath();

        const firstRay = rotatedRays[0];
        ctx.renderer.moveTo(...getRenderedPoint(firstRay).toArray());
        for (const ray of rotatedRays.slice(1)) {
            ctx.renderer.lineTo(...getRenderedPoint(ray).toArray());
        }
        ctx.renderer.closePath();
    }

    ctx.renderer.save();
    ctx.renderer.globalCompositeOperation = "lighter";
    ctx.renderer.clip();
    ctx.renderer.drawImage(gradientImage, origin.x - MAX_DISTANCE, origin.y - MAX_DISTANCE);
    ctx.renderer.restore();

    if (ctx.keyDown.get("KeyD")) {
        for (let index = 0; index < rays.length; index++) {
            const ray = rays[index];
            const result = ray.getResult();

            const endPoint = result?.getPoint() || ray.origin.add(Vector2.fromDir(ray.theta).multiply(256));
            const colour = result ? "yellow" : "white";

            line(ctx, {start: ray.origin, end: endPoint, thickness: 1, colour});
            /*textWithBackground(ctx, endPoint, `${ray.id} (${index})`, {
                text: {
                    font: "13px sans-serif",
                    align: "left",
                    fill: "white",
                },
                background: {
                    fill: "#0005"
                },
                padding: new Vector2(2, 2),
            });*/
        }
    }

    canvas.drawCustomDebug(ctx, "tr", {
        Performance: "I don't know what I'm doing",
        Rays: rays.length.toString(),
        "Deepest Recursion": stats.deepestRecursion.toString(),
        "Max Marching Steps": `${stats.mostSteps} (${stats.mostStepsCount} times)`,
        "Total Marching Steps": `${stats.totalSteps} (${Math.round(marchingDuration / stats.totalSteps * 1000)}ns per)`
    });
}

canvas.start(ctx => {
    canvas.ctx.globalCompositeOperation = "source-over";
    rect(ctx, Vector2.zero, ctx.screenSize, {
        fill: "#000"
    });

    /*for (const shape of shapes) {
        shape.render(ctx);
    }*/

    renderLight(ctx, ctx.mousePos);

    canvas.drawDebug(ctx);
});
