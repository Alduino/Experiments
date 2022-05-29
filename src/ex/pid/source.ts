import Canvas, {c, CanvasFrameContext, CoroutineManager, RectangleCollider} from "../../lib/canvas-setup";
import {circle, draw, line, moveTo, path, radialGradient, rect, roundedRectangle, text} from "../../lib/imgui";
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
    static activeChangedHook?: () => void;
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
                        Target.activeChangedHook?.();
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

class PidController {
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

        const combined = p.add(i).add(d).multiply(PidController.scale);
        this.lastCombined = combined;
        return combined;
    }

    drawDebugLines(ctx: CanvasFrameContext) {
        line(ctx, {
            start: this.target.subtract(new Vector2(PidController.targetIndicatorSize, 0)),
            end: this.target.add(new Vector2(PidController.targetIndicatorSize, 0)),
            thickness: 2,
            colour: "#de7e7e"
        });

        line(ctx, {
            start: this.target.subtract(new Vector2(0, PidController.targetIndicatorSize)),
            end: this.target.add(new Vector2(0, PidController.targetIndicatorSize)),
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
    firing: boolean;
    lastChanged: number;
    lastAttemptedChange?: number;
}

interface Thrusters {
    top: ThrusterState;
    left: ThrusterState;
    right: ThrusterState;
    bottom: ThrusterState;
}

class MovedObject {
    private static readonly size = new Vector2(50, 50);
    private static readonly minimumThrusterTime = 50;
    private static readonly thrusterGraphicsSize = 20;
    private static readonly thrusterGraphicsAngle = Math.PI * 0.2;

    private position = new Vector2(700, 300);
    private velocity = new Vector2(0, 0);
    private acceleration = new Vector2(0, 0);

    private readonly debugInfo: Record<string, string> = {};

    private readonly thrusters: Thrusters = {
        top: {firing: false, lastChanged: 0},
        left: {firing: false, lastChanged: 0},
        bottom: {firing: false, lastChanged: 0},
        right: {firing: false, lastChanged: 0},
    };

    constructor(private readonly thrusterPower: number) {
    }

    readPosition() {
        return this.position;
    }

    render(ctx: CanvasFrameContext) {
        const halfSize = MovedObject.size.divide(2);

        this.renderThruster(ctx, this.thrusters.top, new Vector2(0, -1));
        this.renderThruster(ctx, this.thrusters.left, new Vector2(-1, 0));
        this.renderThruster(ctx, this.thrusters.right, new Vector2(1, 0));
        this.renderThruster(ctx, this.thrusters.bottom, new Vector2(0, 1));

        roundedRectangle(ctx, this.position.subtract(halfSize), this.position.add(halfSize), 8, {
            fill: "#605c34",
            thickness: 2,
            colour: "#1f2636"
        });
    }

    update(dutyCycle: Vector2) {
        const topDutyCycle = Math.max(0, dutyCycle.y);
        const leftDutyCycle = Math.max(0, dutyCycle.x);
        const rightDutyCycle = Math.max(0, -dutyCycle.x);
        const bottomDutyCycle = Math.max(0, -dutyCycle.y);

        this.debugInfo.DCX = dutyCycle.x.toFixed(2);
        this.debugInfo.DCY = dutyCycle.y.toFixed(2);

        this.updateThruster(this.thrusters.top, topDutyCycle);
        this.updateThruster(this.thrusters.left, leftDutyCycle);
        this.updateThruster(this.thrusters.right, rightDutyCycle);
        this.updateThruster(this.thrusters.bottom, bottomDutyCycle);

        this.updateAcceleration();
        this.updateVelocity();
        this.updatePosition();
    }

    drawDebugInfo(ctx: CanvasFrameContext) {
        canvas.drawCustomDebug(ctx, "br", this.debugInfo);
    }

    private updateThruster(state: ThrusterState, dutyCycle: number) {
        const now = performance.now();

        if (dutyCycle > 0.95) {
            if (now - state.lastChanged > MovedObject.minimumThrusterTime) {
                if (!state.firing) state.lastChanged = now;
                state.firing = true;
            }
        } else if (dutyCycle < 0.4) {
            if (now - state.lastChanged > MovedObject.minimumThrusterTime) {
                if (state.firing) state.lastChanged = now;
                state.firing = false;
            }
        } else {
            const smallerDutyCycle = Math.min(dutyCycle, 1 - dutyCycle);
            const cycleDuration = MovedObject.minimumThrusterTime / smallerDutyCycle;
            const thisDutyDuration = state.firing ? cycleDuration * dutyCycle : cycleDuration / dutyCycle;

            if (now > state.lastChanged + thisDutyDuration) {
                state.lastChanged = now;
                state.firing = !state.firing;
            }
        }
    }

    private renderThruster(ctx: CanvasFrameContext, state: ThrusterState, offset: Vector2) {
        if (!state.firing) return;

        const direction = Math.atan2(offset.y, offset.x);

        const connectionPoint = this.position.add(offset.multiply(0.8).multiply(MovedObject.size.divide(2)));

        const leftOffset = new Vector2(MovedObject.thrusterGraphicsSize, 0).rotate(direction - MovedObject.thrusterGraphicsAngle);
        const rightOffset = new Vector2(MovedObject.thrusterGraphicsSize, 0).rotate(direction + MovedObject.thrusterGraphicsAngle);

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
            fill: radialGradient(ctx, connectionPoint, 0, connectionPoint, MovedObject.thrusterGraphicsSize, [
                {colour: "#fff", time: 0},
                {colour: "rgba(255,255,255,0)", time: 1}
            ])
        });
    }

    private updateAcceleration() {
        this.acceleration = new Vector2(
            (this.thrusters.left.firing ? 1 : 0) - (this.thrusters.right.firing ? 1 : 0),
            (this.thrusters.top.firing ? 1 : 0) - (this.thrusters.bottom.firing ? 1 : 0)
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

const targets: Set<Target> = new Set(Array.from({length: 10}, () => new Target(
    new Vector2(Math.random() * (window.innerWidth - 300) + 150, Math.random() * (window.innerHeight - 300) + 150)
)));

const movedObject = new MovedObject(0.1);
const pidController = new PidController(1, 0.8, 1);

const graph = new MovementGraph();

Target.activeChangedHook = () => {
    pidController.target = Target.active.position;
};

Target.active = targets.values().next().value;
Target.activeChangedHook();

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
    //movedObject.drawDebugInfo(ctx);
    canvas.drawDebug(ctx);
});

const cm = canvas.getCoroutineManager();

cm.startCoroutine(function* handlePhysics() {
    while (true) {
        const {ctx} = yield c.nextFrame();

        const movement = pidController.update(ctx.deltaTime, movedObject.readPosition());
        graph.movement = graph.overriddenMovement ?? movement;
        movedObject.update(graph.overriddenMovement ?? movement);
        graph.overriddenMovement = undefined;
    }
});

graph.register(cm);

for (const target of targets) {
    target.register(cm);
}
