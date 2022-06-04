import Canvas, {c, CanvasFrameContext, CoroutineManager, RectangleCollider} from "../../lib/canvas-setup";
import {circle, draw, line, moveTo, path, rect, roundedRectangle, text} from "../../lib/imgui";
import Vector2 from "../../lib/Vector2";
import {colord, Colord, extend as addColordPlugin} from "colord";
import mixPlugin from "colord/plugins/mix";
import "@fontsource/montserrat/800.css";

addColordPlugin([mixPlugin]);

// https://easings.net/#easeOutCubic
function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3);
}

type TargetMouseState = "none" | "hovered" | "active";

class Target {
    public static active: Target | null = null;
    private static size = new Vector2(100, 100);
    private static cancelSize = this.size.multiply(1.2);
    private static fills: Record<TargetMouseState, Colord> = {
        none: colord("#015c6c"),
        hovered: colord("#006c81"),
        active: colord("#002f38"),
    };
    private static activeFills: Record<TargetMouseState, Colord> = {
        none: colord("#55016c"),
        hovered: colord("#680085"),
        active: colord("#3d004f"),
    };
    private static expansions: Record<TargetMouseState, number> = {
        none: 0,
        hovered: 5,
        active: -5,
    };
    public position: Vector2;
    private previousMouseState: TargetMouseState = "none";
    private mouseState: TargetMouseState = "none";
    private stateTransitionStart: number = 0;
    private readonly stateTransitionTimeMs = 200;

    constructor(position: Vector2) {
        this.position = position;
    }

    get collider() {
        const sizeOverTwo = Target.size.divide(2);

        return new RectangleCollider(
            this.position.subtract(sizeOverTwo),
            this.position.add(sizeOverTwo)
        )
    }

    get cancelCollider() {
        const sizeOverTwo = Target.cancelSize.divide(2);

        return new RectangleCollider(
            this.position.subtract(sizeOverTwo),
            this.position.add(sizeOverTwo)
        )
    }

    render(ctx: CanvasFrameContext) {
        const collider = this.collider;

        const transitionTUnclamped = (performance.now() - this.stateTransitionStart) / this.stateTransitionTimeMs;
        const transitionT = Math.max(Math.min(transitionTUnclamped, 1), 0);

        const exponentialT = easeOutCubic(transitionT);

        const fills = this === Target.active ? Target.activeFills : Target.fills;

        const oldFill = fills[this.previousMouseState];
        const newFill = fills[this.mouseState];
        const fill = oldFill.mix(newFill, exponentialT);

        const oldExpansion = Target.expansions[this.previousMouseState];
        const newExpansion = Target.expansions[this.mouseState];
        const expansion = oldExpansion + (newExpansion - oldExpansion) * exponentialT;
        const expansionVec = new Vector2(expansion, expansion);

        roundedRectangle(ctx, collider.tl.subtract(expansionVec), collider.br.add(expansionVec), 8, {
            fill: fill.toHex(),
            thickness: 2,
            colour: "#1f2636"
        });
    }

    register(cm: CoroutineManager) {
        const self = this;

        cm.startCoroutine(function* handleMouseEntry() {
            while (true) {
                yield c.mouseEntered(self.collider);
                self.setMouseState("hovered");

                const popCursor = canvas.pushCursor("pointer");

                const {data} = yield c.waitForFirst([
                    c.leftMousePressed(),
                    c.mouseExited(self.collider)
                ]);

                if (data === 0) {
                    self.setMouseState("active");

                    const {data} = yield c.waitForFirst([
                        c.leftMouseReleased(),
                        c.mouseExited(self.cancelCollider)
                    ])

                    self.setMouseState("none");
                    popCursor();

                    if (data === 0) {
                        Target.active = self;
                    } else {
                        yield c.waitForFirst([
                            c.leftMouseReleased(),
                            function* handleTargetDrag() {
                                while (true) {
                                    const {ctx} = yield c.mouseMoved();
                                    self.position = ctx.mousePos;
                                }
                            }
                        ]);
                    }
                } else {
                    self.setMouseState("none");
                    popCursor();
                }
            }
        });
    }

    private setMouseState(state: TargetMouseState) {
        // todo: allow transitions to start halfway through
        this.stateTransitionStart = performance.now()

        this.previousMouseState = this.mouseState;
        this.mouseState = state;
    }
}

class ValvePidController {
    target = 0;

    lastError = 0;

    integration = 0;

    constructor(public pGain: number, public iGain: number, public dGain: number) {
    }

    update(dt: number, current: number): number {
        const error = this.target - current;

        const p = error * this.pGain;
        const i = (this.integration + error * dt) * this.iGain;
        const d = ((error - this.lastError) / dt) * this.dGain;

        this.integration = i;

        this.lastError = error;

        return p + i + d;
    }
}

class ObjectPidController {
    private static targetIndicatorSize = 5;
    private static scale = 1 / 20;

    target: Vector2 = Vector2.zero;

    lastValue = Vector2.zero;
    lastError = Vector2.zero;

    integration = Vector2.zero;

    lastP = Vector2.zero;
    lastI = Vector2.zero;
    lastD = Vector2.zero;

    lastCombined = Vector2.zero;
    lastCombinedAverage = Vector2.zero;

    constructor(public pGain: number, public iGain: number, public dGain: number) {
    }

    update(dt: number, currentValue: Vector2): Vector2 {
        const error = this.target.subtract(currentValue);

        const p = error.multiply(this.pGain);
        const i = this.integration.add(error.multiply(dt)).multiply(this.iGain);
        const d = error.subtract(this.lastError).divide(dt).multiply(this.dGain);

        this.integration = i;

        this.lastValue = currentValue;
        this.lastError = error;
        this.lastP = p;
        this.lastI = i;
        this.lastD = d;

        const combined = p.add(i).add(d).multiply(ObjectPidController.scale);
        this.lastCombined = combined;
        return combined;
    }

    drawDebugLines(ctx: CanvasFrameContext) {
        line(ctx, {
            start: this.target.subtract(new Vector2(ObjectPidController.targetIndicatorSize, 0)),
            end: this.target.add(new Vector2(ObjectPidController.targetIndicatorSize, 0)),
            thickness: 2,
            colour: "#de7e7e"
        });

        line(ctx, {
            start: this.target.subtract(new Vector2(0, ObjectPidController.targetIndicatorSize)),
            end: this.target.add(new Vector2(0, ObjectPidController.targetIndicatorSize)),
            thickness: 2,
            colour: "#de7e7e"
        });

        line(ctx, {
            start: this.lastValue,
            end: this.lastValue.add(this.lastP),
            thickness: 2,
            colour: "#d1de7e"
        });

        line(ctx, {
            start: this.lastValue,
            end: this.lastValue.add(this.lastI),
            thickness: 2,
            colour: "#96de7e"
        });

        line(ctx, {
            start: this.lastValue,
            end: this.lastValue.add(this.lastD),
            thickness: 2,
            colour: "#7edbde"
        });
    }
}

class MovementGraph {
    movement = Vector2.zero;

    overriddenMovement = Vector2.zero;

    private rollingMovementAverage = Vector2.zero;

    render(ctx: CanvasFrameContext) {
        const previousValue = this.rollingMovementAverage;

        this.rollingMovementAverage = previousValue.multiply(15).add(this.movement).divide(16);

        const midX = 160;
        const midY = ctx.screenSize.y - 160;

        const bl = new Vector2(10, ctx.screenSize.y - 10);
        const tr = new Vector2(310, ctx.screenSize.y - 310);

        const blThreshold = new Vector2(0.4, 0.4).multiply(130).add(new Vector2(midX, midY));
        const trThreshold = new Vector2(0.4, 0.4).multiply(-130).add(new Vector2(midX, midY));

        roundedRectangle(ctx, bl, tr, 8, {
            thickness: 2,
            colour: "white",
            fill: "rgba(255,255,255,0.2)"
        });

        const previousDotPosition = previousValue
            .clamp(Vector2.negativeOne, Vector2.one)
            .multiply(130)
            .add(new Vector2(midX, midY));

        const dotPosition = this.rollingMovementAverage
            .clamp(Vector2.negativeOne, Vector2.one)
            .multiply(130)
            .add(new Vector2(midX, midY));

        line(ctx, {
            start: new Vector2(bl.x, midY),
            end: new Vector2(trThreshold.x, midY),
            thickness: 2,
            colour: "rgba(255,255,255,0.2)"
        });

        line(ctx, {
            start: new Vector2(blThreshold.x, midY),
            end: new Vector2(tr.x, midY),
            thickness: 2,
            colour: "rgba(255,255,255,0.2)"
        });

        line(ctx, {
            start: new Vector2(midX, bl.y),
            end: new Vector2(midX, blThreshold.y),
            thickness: 2,
            colour: "rgba(255,255,255,0.2)"
        });

        line(ctx, {
            start: new Vector2(midX, trThreshold.y),
            end: new Vector2(midX, tr.y),
            thickness: 2,
            colour: "rgba(255,255,255,0.2)"
        });

        roundedRectangle(ctx, trThreshold, blThreshold, 4, {
            thickness: 2,
            colour: "rgba(255,255,255,0.3)",
            fill: "rgba(0,0,0,0.2)"
        });

        line(ctx, {
            start: previousDotPosition,
            end: dotPosition,
            thickness: 4,
            colour: "white"
        });

        text(ctx, new Vector2(160, ctx.screenSize.y - 340), "CONTROL VECTOR", {
            font: "800 24px Montserrat",
            align: "center",
            fill: "white"
        })

        circle(ctx, previousDotPosition, 2, {fill: "white"});
        circle(ctx, dotPosition, this.overriddenMovement ? 6 : 2, {fill: "white"});
    }

    register(cm: CoroutineManager) {
        const self = this;

        cm.startCoroutine(function* handleGraphOverride() {
            let popCursor: () => void | null = null;

            while (true) {
                const {ctx} = yield c.nextFrame();

                if (ctx.mousePos.x > 350 || ctx.mousePos.y < (ctx.screenSize.y - 350)) {
                    popCursor?.();
                    popCursor = null;
                    self.overriddenMovement = undefined;
                    continue;
                }

                const movementX = ((ctx.mousePos.x - 30) / 260 * 2) - 1;
                const movementY = ((ctx.mousePos.y - (ctx.screenSize.y - 30)) / 260 * 2) + 1;

                self.overriddenMovement = new Vector2(movementX, movementY);

                popCursor ??= canvas.pushCursor("move");
            }
        });
    }
}

interface ThrusterState {
    /**
     * a number either 0 or between 0.5 and 1
     */
    throttle: number;


    pid: ValvePidController;

    lastChanged: number;
    lastAttemptedChange?: number;
    sfx: Sfx;

    attemptedThrottle: number;
    previousThrottle?: number;
}

interface Thrusters {
    top: ThrusterState;
    left: ThrusterState;
    right: ThrusterState;
    bottom: ThrusterState;
}

const audioContext = new AudioContext({latencyHint: "interactive"});
const frameCount = audioContext.sampleRate;

interface Sfx {
    play(volume: number): void;

    stop(): void;
}

function createSfx(pan: number): Sfx {
    const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);

    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
        channelData[i] = Math.random() * 2 - 1;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start();

    const firstFilter = audioContext.createBiquadFilter();
    firstFilter.type = "bandpass";
    firstFilter.frequency.value = 5000;
    source.connect(firstFilter);

    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 6;
    firstFilter.connect(filter);

    const gain = audioContext.createGain();
    gain.gain.value = 0;
    filter.connect(gain);

    const panner = audioContext.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner);

    panner.connect(audioContext.destination);

    return {
        play(volume: number) {
            filter.frequency.value = 500 + (volume * 8000);
            gain.gain.cancelScheduledValues(audioContext.currentTime);
            gain.gain.setValueAtTime(0.1, audioContext.currentTime);
        },
        stop() {
            gain.gain.setValueAtTime(0, audioContext.currentTime);
        }
    };
}

function clamp(t: number, a: number, b: number) {
    if (a === b) return a;

    if (a < b) {
        if (t < a) return a;
        if (t > b) return b;
        return t;
    } else {
        if (t < b) return b;
        if (t > a) return a;
        return t;
    }
}

class MovedObject {
    private static readonly size = new Vector2(50, 50);
    private static readonly minimumThrusterTime = 200;
    private static readonly thrusterGraphicsSize = 20;
    private static readonly thrusterGraphicsAngle = Math.PI * 0.2;

    private position = new Vector2(700, 300);
    private velocity = new Vector2(0, 0);
    private acceleration = new Vector2(0, 0);

    private rotation = 0;

    private readonly debugInfo: Record<string, string> = {};

    private readonly thrusters: Thrusters = {
        top: {
            throttle: 0,
            attemptedThrottle: 0,
            pid: new ValvePidController(1, 1, 0),
            lastChanged: 0,
            sfx: createSfx(0.5)
        },
        left: {
            throttle: 0,
            attemptedThrottle: 0,
            pid: new ValvePidController(1, 1, 0),
            lastChanged: 0,
            sfx: createSfx(0)
        },
        bottom: {
            throttle: 0,
            attemptedThrottle: 0,
            pid: new ValvePidController(1, 1, 0),
            lastChanged: 0,
            sfx: createSfx(0.5)
        },
        right: {
            throttle: 0,
            attemptedThrottle: 0,
            pid: new ValvePidController(1, 1, 0),
            lastChanged: 0,
            sfx: createSfx(1)
        },
    };

    constructor(private readonly thrusterPower: number) {
    }

    readPosition() {
        return this.position;
    }

    render(ctx: CanvasFrameContext) {
        const halfSize = MovedObject.size.divide(2);

        ctx.renderer.translate(this.position.x, this.position.y);
        ctx.renderer.rotate(this.rotation);

        this.renderThruster(ctx, this.thrusters.top, new Vector2(0, -1));
        this.renderThruster(ctx, this.thrusters.left, new Vector2(-1, 0));
        this.renderThruster(ctx, this.thrusters.right, new Vector2(1, 0));
        this.renderThruster(ctx, this.thrusters.bottom, new Vector2(0, 1));

        roundedRectangle(ctx, halfSize.negate(), halfSize, 8, {
            fill: "#605c34",
            thickness: 2,
            colour: "#1f2636"
        });

        ctx.renderer.rotate(-this.rotation);
        ctx.renderer.translate(-this.position.x, -this.position.y);
    }

    update(dt: number, dutyCycle: Vector2) {
        const topThrottle = Math.max(0, dutyCycle.y);
        const leftThrottle = Math.max(0, dutyCycle.x);
        const rightThrottle = Math.max(0, -dutyCycle.x);
        const bottomThrottle = Math.max(0, -dutyCycle.y);

        this.debugInfo.DCX = dutyCycle.x.toFixed(2);
        this.debugInfo._DCY = dutyCycle.y.toFixed(2);

        this.updateThruster(dt, this.thrusters.top, topThrottle);
        this.updateThruster(dt, this.thrusters.left, leftThrottle);
        this.updateThruster(dt, this.thrusters.right, rightThrottle);
        this.updateThruster(dt, this.thrusters.bottom, bottomThrottle);

        this.debugInfo.VTT = this.thrusters.top.pid.target?.toFixed(1) ?? "0";
        this.debugInfo._VTL = this.thrusters.left.pid.target?.toFixed(1) ?? "0";
        this.debugInfo._VTR = this.thrusters.right.pid.target?.toFixed(1) ?? "0";
        this.debugInfo._VTB = this.thrusters.bottom.pid.target?.toFixed(1) ?? "0";

        this.debugInfo.VAT = this.thrusters.top.throttle?.toFixed(1) ?? "0";
        this.debugInfo._VAL = this.thrusters.left.throttle?.toFixed(1) ?? "0";
        this.debugInfo._VAR = this.thrusters.right.throttle?.toFixed(1) ?? "0";
        this.debugInfo._VAB = this.thrusters.bottom.throttle?.toFixed(1) ?? "0";

        this.updateAcceleration();
        this.updateVelocity();
        this.updatePosition();
    }

    drawDebugInfo(ctx: CanvasFrameContext) {
        canvas.drawCustomDebug(ctx, "br", this.debugInfo);
    }

    private updateThruster(dt: number, state: ThrusterState, throttle: number) {
        if (throttle >= 0.5) {
            state.attemptedThrottle = Math.min(1, throttle);
        } else {
            const now = performance.now();

            if (throttle < 0.2) {
                if (now - state.lastChanged > MovedObject.minimumThrusterTime) {
                    if (state.attemptedThrottle) state.lastChanged = now;
                    state.attemptedThrottle = 0;
                }
            } else {
                const smallerDutyCycle = Math.min(throttle, 1 - throttle);
                const cycleDuration = MovedObject.minimumThrusterTime / smallerDutyCycle;
                const thisDutyDuration = state.attemptedThrottle > 0 ? cycleDuration * throttle : cycleDuration / throttle;

                if (now > state.lastChanged + thisDutyDuration) {
                    state.lastChanged = now;

                    if (state.attemptedThrottle > 0) {
                        state.attemptedThrottle = 0;
                    } else {
                        state.attemptedThrottle = Math.max(0.5, throttle / 0.5);
                    }
                }
            }
        }

        state.pid.target = Math.max(Math.min(state.attemptedThrottle, 1), 0);

        const movement = clamp(state.pid.update(dt, state.throttle), -1, 1) * 0.3;

        if (movement > 0) {
            state.throttle = Math.max(0.5, state.throttle);
            state.throttle += movement;
            if (state.throttle > 1) state.throttle = 1;
        } else if (movement < 0) {
            state.throttle += movement;
            if (state.throttle < 0.5) state.throttle = 0;
        }

        if (state.throttle) {
            state.sfx.play(state.throttle);
        } else if (state.previousThrottle) {
            state.sfx.stop();
        }

        state.previousThrottle = state.throttle;
    }

    private renderThruster(ctx: CanvasFrameContext, state: ThrusterState, offset: Vector2) {
        const direction = Math.atan2(offset.y, offset.x);

        const connectionPoint = offset.multiply(0.8).multiply(MovedObject.size.divide(2));

        const leftOffset = new Vector2(MovedObject.thrusterGraphicsSize * state.throttle, 0)
            .rotate(direction - MovedObject.thrusterGraphicsAngle * state.throttle);

        const rightOffset = new Vector2(MovedObject.thrusterGraphicsSize * state.throttle, 0)
            .rotate(direction + MovedObject.thrusterGraphicsAngle * state.throttle);

        path(ctx, () => {
            moveTo(ctx, connectionPoint);

            line(ctx, {
                end: connectionPoint.add(leftOffset)
            });

            line(ctx, {
                end: connectionPoint.add(rightOffset)
            });

            line(ctx, {end: connectionPoint});
        });

        draw(ctx, {
            fill: "white"
        });
    }

    private updateAcceleration() {
        this.acceleration = new Vector2(
            (this.thrusters.left.throttle) - (this.thrusters.right.throttle),
            (this.thrusters.top.throttle) - (this.thrusters.bottom.throttle)
        ).multiply(this.thrusterPower);
    }

    private updateVelocity() {
        this.velocity = this.velocity.add(this.acceleration);
        this.velocity = this.velocity.multiply(0.99);
    }

    private updatePosition() {
        this.position = this.position.add(this.velocity);
    }
}

const targets: Set<Target> = new Set([
    new Vector2(0.1, 0.1),
    new Vector2(0.5, 0.5),
    new Vector2(0.9, 0.1),
    new Vector2(0.9, 0.9)
].map(pos => new Target(pos.multiply(new Vector2(window.innerWidth, window.innerHeight)))));

const movedObject = new MovedObject(0.05);
const pidController = new ObjectPidController(1, 0.8, 1);

const graph = new MovementGraph();

Target.active = targets.values().next().value;

const canvas = new Canvas("canvas");

canvas.start(ctx => {
    rect(ctx, Vector2.zero, ctx.screenSize, {
        fill: "#1f2636"
    });

    for (const target of targets) {
        target.render(ctx);
    }

    movedObject.render(ctx);
    graph.render(ctx);

    //pidController.drawDebugLines(ctx);
    movedObject.drawDebugInfo(ctx);
    //canvas.drawDebug(ctx);
});

const cm = canvas.getCoroutineManager();

cm.startCoroutine(function* handlePhysics() {
    let lastNow = performance.now();

    while (true) {
        const {ctx} = yield c.nextFrame();

        const now = performance.now();

        pidController.target = Target.active.position;

        const movement = pidController.update(ctx.deltaTime, movedObject.readPosition());
        graph.movement = graph.overriddenMovement ?? movement;
        movedObject.update(now - lastNow, graph.overriddenMovement ?? movement);
        graph.overriddenMovement = undefined;

        lastNow = now;
    }
});

graph.register(cm);

for (const target of targets) {
    target.register(cm);
}
