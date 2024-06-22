import InteractiveCanvas, {CanvasFrameContext, waitUntil} from "../../lib/canvas-setup";
import Vector2 from "../../lib/Vector2";
import {clear, draw, line, moveTo, path, rect, rotate, translate} from "../../lib/imgui";

const CELL_SIZE = 16;
const DRAW_OFFSET = new Vector2(100, 100);
const MOVEMENT_SPEED = 0.5;
const ROTATION_SPEED = 10;

interface CellStorage {
    pos: Vector2;
    left: boolean;
    top: boolean;
}

const cells = new Map<string, CellStorage>();

function getCellKey(pos: Vector2) {
    return `${Math.floor(pos.x)},${Math.floor(pos.y)}`;
}

function createCell(opts: CellStorage) {
    const key = getCellKey(opts.pos);
    cells.set(key, opts);
}

interface Cell {
    pos: Vector2;
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
}

function getCell(pos: Vector2): Cell {
    const centreKey = getCellKey(pos);
    const rightKey = getCellKey(pos.add(new Vector2(1, 0)));
    const bottomKey = getCellKey(pos.add(new Vector2(0, 1)));

    const centreCell = cells.get(centreKey);
    const rightCell = cells.get(rightKey);
    const bottomCell = cells.get(bottomKey);

    return {
        pos,
        top: centreCell?.top ?? false,
        bottom: bottomCell?.top ?? false,
        left: centreCell?.left ?? false,
        right: rightCell?.left ?? false
    };
}

class Character {
    #position: Vector2;
    #rotation = 0;

    #velocity = Vector2.zero;
    #velocityR = 0;

    #size = new Vector2(0.5, 0.75);

    constructor(position: Vector2) {
        this.#position = position;
    }

    get position() {
        return this.#position;
    }

    get rotation() {
        return this.#rotation;
    }

    get velocity() {
        return this.#velocity;
    }

    get globalVelocity() {
        return this.#velocity.rotate(this.rotation);
    }

    get velocityR() {
        return this.#velocityR;
    }

    draw(ctx: CanvasFrameContext) {
        const halfSize = this.#size.divide(2).multiply(CELL_SIZE);
        const position = this.position.multiply(CELL_SIZE).add(DRAW_OFFSET);

        translate(ctx, position, () => {
            rotate(ctx, this.rotation, () => {
                rect(ctx, Vector2.zero.subtract(halfSize), Vector2.zero.add(halfSize), {
                    fill: "blue"
                })
            })
        });
    }

    update() {
        this.#updatePosition();
        this.#handleCollisions();

        this.#handleFriction();
    }

    addVelocity(velocity: Vector2) {
        this.#velocity = this.velocity.add(velocity);
    }

    addVelocityR(velocity: number) {
        this.#velocityR += velocity;
    }

    #updatePosition() {
        this.#position = this.position.add(this.globalVelocity);
        this.#rotation += this.#velocityR;
    }

    #handleCollisions() {
        const positionCell = getCell(this.position);
    }

    #handleFriction() {
        const friction = 0.1;
        const velFrictionForce = this.velocity.multiply(-friction);
        this.#velocity = this.velocity.add(velFrictionForce);

        const rotFrictionForce = this.#velocityR * -friction;
        this.#velocityR += rotFrictionForce;
    }
}

let character: Character;

const canvas = new InteractiveCanvas("canvas");
const cm = canvas.getCoroutineManager();

canvas.start(ctx => {
    clear(ctx);

    if (character) {
        character.draw(ctx);
    }

    for (const [, {pos, top, left}] of cells) {
        const cellOffset = pos.multiply(CELL_SIZE).add(DRAW_OFFSET);

        path(ctx, () => {
            if (top) {
                moveTo(ctx, cellOffset);

                line(ctx, {
                    end: cellOffset.add(new Vector2(CELL_SIZE, 0)),
                });
            }

            if (left) {
                moveTo(ctx, cellOffset);

                line(ctx, {
                    end: cellOffset.add(new Vector2(0, CELL_SIZE)),
                });
            }
        });

        draw(ctx, {
            colour: "black",
            thickness: 1
        });
    }

    canvas.drawDebug(ctx);
});

for (let x = 0; x < 31; x++) {
    createCell({
        pos: new Vector2(x, 31),
        left: false,
        top: true
    });
}

createCell({
    pos: new Vector2(0, 30),
    left: true,
    top: false
});

createCell({
    pos: new Vector2(31, 30),
    left: true,
    top: false
});

cm.startCoroutine(function* handlePhysicsFrame() {
    while (true) {
        if (character) character.update();

        yield;
    }
});

cm.startCoroutine(function* handleBallSpawn() {
    while (true) {
        const x = yield waitUntil.leftMousePressed();
        character = new Character(x.ctx.mousePos.subtract(DRAW_OFFSET).divide(CELL_SIZE));
    }
});

cm.startCoroutine(function* handleMovement() {
    while (true) {
        const {ctx} = yield waitUntil.nextFrame();
        if (!character) continue;

        const rotationDirection = (() => {
            if (ctx.keyDown.get("KeyA")) {
                return -1;
            } else if (ctx.keyDown.get("KeyD")) {
                return 1;
            } else {
                return 0;
            }
        })();

        const forwardVector = (() => {
            if (ctx.keyDown.get("KeyW")) {
                return new Vector2(0, -1);
            } else if (ctx.keyDown.get("KeyS")) {
                return new Vector2(0, 1);
            } else {
                return Vector2.zero;
            }
        })();

        const currentSpeed = character.velocity.distance(Vector2.zero);
        const diff = MOVEMENT_SPEED - currentSpeed;
        const acceleration = diff * 0.1;

        const velocity = forwardVector.multiply(acceleration);

        const targetRotation = rotationDirection * ROTATION_SPEED * velocity.distance(Vector2.zero) * -Math.sign(velocity.y);
        const diffR = targetRotation - character.velocityR;
        const accelerationR = diffR * 0.1;

        character.addVelocity(velocity);
        character.addVelocityR(accelerationR);
    }
})
