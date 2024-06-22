import {
    CanvasFrameContext,
    CoroutineGenerator,
    getContext,
    InteractiveCanvas,
    waitUntil
} from "@experiment-libs/canvas";
import {rect, rotate, translate} from "@experiment-libs/imui";
import {getCanvas, onCleanup} from "@experiment-libs/experiment/experiment";
import {Vector2} from "@experiment-libs/utils";

export {};

const SCALE_PX_PER_M = 10;

const canvas = new InteractiveCanvas(getCanvas());
const cm = canvas.getCoroutineManager();

interface VehicleOptions {
    centreOfSteering?: Vector2;
    size?: Vector2;
}

class Vehicle {
    readonly centreOfSteering: Vector2;
    readonly size: Vector2;

    readonly weight = 1000;

    engineForce = 0;
    brakeForce = 0;

    velocity = Vector2.zero;

    // Position at the centre of steering
    position = new Vector2(30, 30);

    // Rotation around the centre of steering
    heading = 0;

    coefficientOfDrag = 0.4257;
    coefficientOfRollingResistance = 12.8;

    get headingVector() {
        return Vector2.fromDir(this.heading);
    }

    constructor(opts: VehicleOptions = {}) {
        this.centreOfSteering = opts.centreOfSteering ?? new Vector2(0.5, 0.1);
        this.size = opts.size ?? new Vector2(6, 3);
    }

    connect() {
        cm.startCoroutine(this.#accelerationInput.bind(this));
        cm.startCoroutine(this.#brakeInput.bind(this));
        cm.startCoroutine(this.#physics.bind(this));
    }

    render(ctx: CanvasFrameContext) {
        translate(ctx, this.position.multiply(SCALE_PX_PER_M), () => {
            rotate(ctx, this.heading, () => {
                rect(ctx, this.centreOfSteering.multiply(this.size).multiply(SCALE_PX_PER_M).negate(), Vector2.one.subtract(this.centreOfSteering).multiply(SCALE_PX_PER_M).multiply(this.size), {
                    fill: "black"
                });
            });
        });

        canvas.drawCustomDebug(ctx, "tr", {
            Pos: this.position.toString(1),
            Vel: this.velocity.toString(3),
            _Spd: (this.velocity.length() * 3.6).toFixed(1) + " km/h",
            EF: this.engineForce.toFixed(),
            _BF: this.brakeForce.toFixed(),
        })
    }

    * #accelerationInput() {
        while (true) {
            yield waitUntil.keyPressed("ArrowUp");
            this.engineForce = 1500;
            yield waitUntil.keyReleased("ArrowUp");
            this.engineForce = 0;
        }
    }

    * #brakeInput(): CoroutineGenerator {
        while (true) {
            yield waitUntil.keyPressed("ArrowDown");
            this.brakeForce = 6000;
            yield waitUntil.keyReleased("ArrowDown");
            this.brakeForce = 0;
        }
    }

    #calculateTractionForce() {
        return this.headingVector.multiply(this.engineForce);
    }

    #calculateBrakingForce() {
        // Not completely physically accurate because the braking force is a constant for now
        // This means we have to cancel it when the vehicle is stationary to avoid it accelerating backwards
        if (this.velocity.dot(this.headingVector) <= 0) {
            console.log("Too low terrain");
            return Vector2.zero;
        }

        // todo: this is not physically accurate
        return this.headingVector.multiply(-this.brakeForce);
    }

    * #physics(): CoroutineGenerator {
        while (true) {
            const {ctx} = yield waitUntil.nextFrame();
            const {deltaTime} = getContext(ctx);

            const accelerationForce = this.#calculateTractionForce();
            const brakingForce = this.#calculateBrakingForce();

            const dragForce = this.velocity.multiply(this.velocity.length()).multiply(-this.coefficientOfDrag);
            const rollingResistanceForce = this.velocity.multiply(-this.coefficientOfRollingResistance);
            const longitudinalForce = accelerationForce.add(brakingForce).add(dragForce).add(rollingResistanceForce);

            const acceleration = longitudinalForce.divide(this.weight);
            this.velocity = this.velocity.add(acceleration.multiply(deltaTime));
            this.position = this.position.add(this.velocity.multiply(deltaTime));
        }
    }
}

const testVehicle = new Vehicle();

canvas.start(ctx => {
    rect(ctx, Vector2.zero, ctx.screenSize, {
        fill: "white"
    });

    testVehicle.render(ctx);

    canvas.drawDebug(ctx);
});

onCleanup(() => canvas.stop());

testVehicle.connect();
