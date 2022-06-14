import InteractiveCanvas, {
    CoroutineAwait,
    CoroutineGeneratorFunction,
    deref,
    Dereffable,
    OffscreenCanvas,
    RectangleCollider,
    ref, Setter,
    waitUntil
} from "../../lib/canvas-setup";
import {circle, copyFrom, line, rect} from "../../lib/imgui";
import Vector2 from "../../lib/Vector2";

const canvas = new InteractiveCanvas("canvas");

const drawing = new OffscreenCanvas(new Vector2(300, 300));
const drawingCtx = drawing.getContext();
rect(drawingCtx, Vector2.zero, drawing.size, {fill: "white"});

let cursorPosition: Vector2 | null = null;
let isPainting = false;
let brushRadius = 5;

function getDrawingOffset(): Vector2 {
    return canvas.size.subtract(drawing.size).divide(2).round();
}

function getDrawingCollider() {
    const offset = getDrawingOffset();
    return new RectangleCollider(offset, offset.add(drawing.size));
}

const drawingCollider = ref(getDrawingCollider());

canvas.addListener("resize", () => {
    drawingCollider.set(getDrawingCollider());
});

canvas.start(ctx => {
    rect(ctx, Vector2.zero, canvas.size, {
        fill: "#666"
    });

    copyFrom(drawingCtx, ctx, getDrawingOffset());

    if (cursorPosition) {
        circle(ctx, cursorPosition.add(getDrawingOffset()), brushRadius, {
            thickness: 3,
            colour: "#fff9"
        });

        circle(ctx, cursorPosition.add(getDrawingOffset()), brushRadius, {
            thickness: 1,
            colour: "#0006"
        });
    }

    canvas.drawDebug(ctx);
});

const cm = canvas.getCoroutineManager();

const enum KeyPressedRepeatingState {
    waiting,
    delay,
    interval
}

function createKeyPressedRepeating(key: string, abortedRef: Setter<boolean>, repeatDelay = 500, repeatInterval = 50): CoroutineGeneratorFunction {
    let state: KeyPressedRepeatingState = KeyPressedRepeatingState.waiting;

    function nextOrCancel(waiter: CoroutineAwait<void>, nextState: KeyPressedRepeatingState): CoroutineGeneratorFunction {
        return function* handleNextOrCancel() {
            const {data, ctx} = yield waitUntil.one([
                waitUntil.keyReleased(key),
                waiter
            ]);

            if (data === 0 || !ctx.keyDown.get(key)) {
                abortedRef.set(true);
                state = KeyPressedRepeatingState.waiting;
            } else {
                abortedRef.set(false);
                state = nextState;
            }
        };
    }

    return function* handleKeyPressedRepeating() {
        switch (state) {
            case KeyPressedRepeatingState.waiting:
                yield waitUntil.keyPressed(key);
                state = KeyPressedRepeatingState.delay;
                abortedRef.set(false);
                break;
            case KeyPressedRepeatingState.delay:
                yield nextOrCancel(waitUntil.delay(repeatDelay), KeyPressedRepeatingState.interval);
                break;
            case KeyPressedRepeatingState.interval:
                yield nextOrCancel(waitUntil.delay(repeatInterval), KeyPressedRepeatingState.interval);
                break;
        }
    }
}

cm.startCoroutine(function* brushResize() {
    const aborted = ref(false);

    const smallerRepeating = createKeyPressedRepeating("[", aborted);
    const biggerRepeating = createKeyPressedRepeating("]", aborted);

    while (true) {
        const {data} = yield waitUntil.one([
            smallerRepeating,
            biggerRepeating
        ]);

        if (deref(aborted)) continue;

        const multiplier = data === 0 ? 0.8 : 1.25;
        brushRadius = Math.ceil(brushRadius * multiplier);
    }
});

cm.startCoroutine(function* collisionDetection() {
    while (true) {
        yield waitUntil.mouseEntered(drawingCollider);
        const popCursor = canvas.pushCursor("crosshair");

        yield waitUntil.one([
            function* mouseExit() {
                while (true) {
                    yield waitUntil.mouseExited(drawingCollider);
                    if (!isPainting) return;
                }
            },
            function* mousePress() {
                let x = yield waitUntil.leftMousePressed();

                const showCursor = canvas.pushCursor("none");

                yield cm.hookDispose(() => {
                    showCursor();
                });

                isPainting = true;
                yield waitUntil.one([
                    function* draw() {
                        let lastPosition: Vector2 | null = null;

                        yield cm.hookDispose(() => {
                            line(drawingCtx, {
                                start: lastPosition,
                                end: cursorPosition,
                                thickness: brushRadius * 2,
                                colour: "black"
                            });

                            circle(drawingCtx, lastPosition, brushRadius, {
                                fill: "black"
                            });

                            circle(drawingCtx, cursorPosition, brushRadius, {
                                fill: "black"
                            });
                        });

                        while (true) {
                            if (lastPosition) {
                                x = yield waitUntil.check(() => {
                                    return cursorPosition.distance(lastPosition) > brushRadius / 2;
                                });

                                line(drawingCtx, {
                                    start: lastPosition,
                                    end: cursorPosition,
                                    thickness: brushRadius * 2,
                                    colour: "black"
                                });

                                circle(drawingCtx, lastPosition, brushRadius, {
                                    fill: "black"
                                });

                                circle(drawingCtx, cursorPosition, brushRadius, {
                                    fill: "black"
                                });

                                lastPosition = cursorPosition;
                            } else {
                                circle(drawingCtx, cursorPosition, brushRadius, {
                                    fill: "black"
                                });

                                lastPosition = cursorPosition;
                            }
                        }
                    },
                    waitUntil.leftMouseReleased()
                ]);

                showCursor();

                isPainting = false;
            },
            function* mouseMove() {
                let x = yield cm.hookDispose(() => {
                    cursorPosition = null;
                });

                while (true) {
                    cursorPosition = x.ctx.mousePos.subtract(getDrawingOffset());
                    x = yield waitUntil.mouseMoved();
                }
            }
        ]);

        popCursor();
    }
});
