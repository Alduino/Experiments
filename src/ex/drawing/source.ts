import InteractiveCanvas, {
    CoroutineAwait,
    CoroutineGeneratorFunction,
    OffscreenCanvas,
    RectangleCollider,
    waitUntil
} from "../../lib/canvas-setup";
import {circle, copyFrom, line, rect, roundedRectangle, text} from "../../lib/imgui";
import Vector2 from "../../lib/Vector2";
import {ref, Setter} from "../../lib/utils/ref";
import "@fontsource/montserrat/800.css";
import FlexComponent from "../../lib/utils/scui/components/FlexComponent";
import TextComponent from "../../lib/utils/scui/components/TextComponent";
import RootComponent from "../../lib/utils/scui/lib/RootComponent";
import ButtonComponent from "../../lib/utils/scui/components/ButtonComponent";
import RectangleComponent from "../../lib/utils/scui/components/RectangleComponent";
import {drawScuiDebug} from "../../lib/utils/scui/lib/debugger";
import AbsoluteComponent from "../../lib/utils/scui/components/AbsoluteComponent";

const canvas = new InteractiveCanvas("canvas");

const drawing = new OffscreenCanvas(new Vector2(300, 300));
const drawingCtx = drawing.getContext();
rect(drawingCtx, Vector2.zero, drawing.size, {fill: "white"});

let cursorPosition: Vector2 | null = null;
let fakeCursorPosition: Vector2 | null = null;
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

const cm = canvas.getCoroutineManager();

const colours = {
    black: "#000000",
    red: "#da3c0d",
    green: "#5ad513",
    blue: "#591ad7",
    white: "#ffffff"
};

let selectedColour = colours.black;

const colourButtonsContainer = new FlexComponent();

for (const [, value] of Object.entries(colours)) {
    const text = new TextComponent();
    text.text = "Select:";
    text.fill = "white";

    const icon = new RectangleComponent();
    icon.fill = value;

    const flex = new FlexComponent();
    flex.direction = "row";
    flex.crossAlignItems = "centre";
    flex.addChildren(text, icon);

    flex.updateChildMetadata(icon, {
        crossAlign: "stretch",
        grow: 1
    });

    const button = new ButtonComponent(canvas);
    button.addChild(flex);

    button.innerSize = new Vector2(150, 40);

    button.clickedEvent.listen(() => {
        selectedColour = value;
    });

    colourButtonsContainer.addChild(button);
}

const saveButton = ButtonComponent.createWithText(canvas, "Save");

saveButton.button.clickedEvent.listen(async () => {
    const blob = await drawing.saveToBlob("image/png");
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = "drawing.png";
    link.click();
    URL.revokeObjectURL(blobUrl);
});

const loadButton = ButtonComponent.createWithText(canvas, "Load (overwrites)");

loadButton.button.clickedEvent.listen(async () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";

    let resolve: () => void;
    const focusPromise = new Promise<void>(yay => resolve = yay);
    window.addEventListener("focus", resolve);
    fileInput.click();
    await focusPromise;
    window.removeEventListener("focus", resolve);

    const file = fileInput.files[0];
    if (!file) return;

    const image = document.createElement("img");
    const loadPromise = new Promise<void>(yay => resolve = yay);
    image.addEventListener("load", resolve);
    const source = URL.createObjectURL(file);
    image.src = source;
    await loadPromise;
    image.removeEventListener("load", resolve);
    URL.revokeObjectURL(source);

    const ctx = drawing.getContext();
    rect(ctx, Vector2.zero, ctx.screenSize, {fill: "white"});
    ctx.renderer.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, drawing.size.x, drawing.size.y);
});

const saveLoadContainer = new FlexComponent();
saveLoadContainer.direction = "row";
saveLoadContainer.addChildren(saveButton.button, loadButton.button);

const absolutePositioner = new AbsoluteComponent();
absolutePositioner.addChildren(colourButtonsContainer, saveLoadContainer);
absolutePositioner.setChildPosition(colourButtonsContainer, getDrawingOffset().add(drawing.size.justX).add(new Vector2(10, 0)));
absolutePositioner.setChildPosition(saveLoadContainer, getDrawingOffset().add(drawing.size.justY).add(new Vector2(0, 10)));

const componentsRoot = new RootComponent();
componentsRoot.setChild(absolutePositioner);

componentsRoot.setDrawnPosition(Vector2.zero);
componentsRoot.setSize(canvas.size);

let popInspectCursor: () => void | null = null;

canvas.start(ctx => {
    const drawingOffset = getDrawingOffset();

    absolutePositioner.setChildPosition(colourButtonsContainer, drawingOffset.add(drawing.size.justX).add(new Vector2(10, 0)));
    absolutePositioner.setChildPosition(saveLoadContainer, drawingOffset.add(drawing.size.justY).add(new Vector2(0, 10)));

    componentsRoot.setSize(canvas.size);
    componentsRoot.handleBatchedUpdates();

    rect(ctx, Vector2.zero, canvas.size, {
        fill: "#666"
    });

    roundedRectangle(ctx, drawingOffset.subtract(new Vector2(0, 20)), drawingOffset.add(drawing.size.justX).subtract(new Vector2(0, 16)), 2, {
        fill: "#999"
    });

    const brushRadiusLog = Math.min(Math.log10(brushRadius - 3) / 2, 1);

    circle(ctx, drawingOffset.subtract(new Vector2(0, 18)).add(drawing.size.justX.multiply(brushRadiusLog)), 4, {
        fill: "#ccc"
    });

    text(ctx, drawingOffset.subtract(new Vector2(0, 34)).add(drawing.size.justX.divide(2)), "Brush Size", {
        font: "12px Montserrat",
        fill: "white",
        align: "center"
    });

    copyFrom(drawingCtx, ctx, drawingOffset);

    componentsRoot.render();
    const imageSource = componentsRoot.getImageSource();
    copyFrom(imageSource, ctx, Vector2.zero);

    if (cursorPosition) {
        circle(ctx, cursorPosition.add(drawingOffset), brushRadius, {
            // TODO better way to set opacity
            fill: selectedColour + "44"
        });

        circle(ctx, cursorPosition.add(drawingOffset), brushRadius, {
            thickness: 3,
            colour: "#fff9"
        });

        circle(ctx, cursorPosition.add(drawingOffset), brushRadius, {
            thickness: 1,
            colour: "#0006"
        });
    }

    if (fakeCursorPosition) {
        circle(ctx, fakeCursorPosition.add(drawingOffset), brushRadius, {
            thickness: 3,
            colour: "#fff9"
        });

        circle(ctx, fakeCursorPosition.add(drawingOffset), brushRadius, {
            thickness: 1,
            colour: "#0006"
        });
    }

    if (ctx.keyDown.get("d")) {
        if (!popInspectCursor) {
            popInspectCursor = canvas.pushCursor("crosshair");
        }

        drawScuiDebug(ctx, componentsRoot);
        canvas.pauseCoroutines = true;
    } else {
        popInspectCursor?.();
        popInspectCursor = null;

        canvas.pauseCoroutines = false;
    }

    canvas.drawCustomDebug(ctx, "tl", {
        Controls: "",
        "[ and ]": "change the brush size",
        D: "shows the component inspector (use over the colour buttons)"
    });

    //canvas.drawDebug(ctx);
});

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

        if (aborted.get()) continue;

        const multiplier = data === 0 ? 0.8 : 1.25;
        brushRadius = Math.ceil(brushRadius * multiplier);
    }
});

cm.startCoroutine(function* handleBrushSizeCollision() {
    while (true) {
        yield waitUntil.mouseEntered(brushSizeSliderCollider);
        const popCursor = canvas.pushCursor("ew-resize");

        let isResizing = false;
        fakeCursorPosition = drawing.size.divide(2);

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
                            brushRadius = Math.round(Math.pow(100, brushRadiusLog) + 3);

                            x = yield waitUntil.mouseMoved();
                        }
                    },
                    waitUntil.leftMouseReleased()
                ]);

                isPainting = false;
            }
        ]);

        fakeCursorPosition = null;
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
                                colour: selectedColour
                            });

                            circle(drawingCtx, lastPosition, brushRadius, {
                                fill: selectedColour
                            });

                            circle(drawingCtx, cursorPosition, brushRadius, {
                                fill: selectedColour
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
                                    colour: selectedColour
                                });

                                circle(drawingCtx, lastPosition, brushRadius, {
                                    fill: selectedColour
                                });

                                circle(drawingCtx, cursorPosition, brushRadius, {
                                    fill: selectedColour
                                });

                                lastPosition = cursorPosition;
                            } else {
                                circle(drawingCtx, cursorPosition, brushRadius, {
                                    fill: selectedColour
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
