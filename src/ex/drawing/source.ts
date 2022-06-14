import InteractiveCanvas, {
    CoroutineAwait,
    CoroutineGeneratorFunction,
    deref,
    OffscreenCanvas,
    RectangleCollider,
    ref,
    Setter,
    waitUntil
} from "../../lib/canvas-setup";
import {circle, copyFrom, line, rect, roundedRectangle, text} from "../../lib/imgui";
import Vector2 from "../../lib/Vector2";
import "@fontsource/montserrat/800.css";

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

function getBrushSizeSliderCollider() {
    const offset = getDrawingOffset();

    return new RectangleCollider(
        offset.subtract(new Vector2(0, 22)),
        offset.add(drawing.size.justX).subtract(new Vector2(0, 14))
    );
}

const drawingCollider = ref(getDrawingCollider());
const brushSizeSliderCollider = ref(getBrushSizeSliderCollider());

canvas.addListener("resize", () => {
    drawingCollider.set(getDrawingCollider());
    brushSizeSliderCollider.set(getBrushSizeSliderCollider());
});

canvas.start(ctx => {
    const drawingOffset = getDrawingOffset();

    rect(ctx, Vector2.zero, canvas.size, {
        fill: "#666"
    });

    roundedRectangle(ctx, drawingOffset.subtract(new Vector2(0, 20)), drawingOffset.add(drawing.size.justX).subtract(new Vector2(0, 16)), 2, {
        fill: "#999"
    });

    const brushRadiusLog = Math.min(Math.log10(brushRadius - 3) / 3, 1);

    circle(ctx, drawingOffset.subtract(new Vector2(0, 18)).add(drawing.size.justX.multiply(brushRadiusLog)), 4, {
        fill: "#ccc"
    });

    text(ctx, drawingOffset.subtract(new Vector2(0, 34)).add(drawing.size.justX.divide(2)), "Brush Size", {
        font: "12px Montserrat",
        fill: "white",
        align: "center"
    });

    copyFrom(drawingCtx, ctx, drawingOffset);

    if (cursorPosition) {
        circle(ctx, cursorPosition.add(drawingOffset), brushRadius, {
            thickness: 3,
            colour: "#fff9"
        });

        circle(ctx, cursorPosition.add(drawingOffset), brushRadius, {
            thickness: 1,
            colour: "#0006"
        });
    }

    canvas.drawCustomDebug(ctx, "tl", {
        Controls: "[ and ] change brush size"
    });

    //canvas.drawDebug(ctx);
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

cm.startCoroutine(function* handleBrushSizeCollision() {
    while (true) {
        yield waitUntil.mouseEntered(brushSizeSliderCollider);
        const popCursor = canvas.pushCursor("ew-resize");

        let isResizing = false;
        cursorPosition = drawing.size.divide(2);

        yield waitUntil.one([
            function* mouseExit() {
                while (true) {
                    yield waitUntil.mouseExited(brushSizeSliderCollider);
                    if (!isResizing) return;
                }
            },
            function* mousePress() {
                let x = yield waitUntil.leftMousePressed();

                isResizing = true;

                yield waitUntil.one([
                    function* handleBrushResize() {
                        while (true) {
                            const brushRadiusLog = Math.max(0, Math.min(1, (x.ctx.mousePos.x - getDrawingOffset().x) / drawing.size.x));
                            brushRadius = Math.round(Math.pow(1000, brushRadiusLog) + 3);

                            x = yield waitUntil.mouseMoved();
                        }
                    },
                    waitUntil.leftMouseReleased()
                ]);

                isPainting = false;
            }
        ]);

        cursorPosition = null;
        popCursor();
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
