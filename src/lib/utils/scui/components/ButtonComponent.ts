import Component from "../lib/Component";
import InteractiveCanvas, {
    CanvasFrameContext,
    CoroutineManager,
    FocusTarget,
    RectangleCollider,
    waitUntil
} from "../../../canvas-setup";
import {clear, copyFrom, roundedRectangle} from "../../../imgui";
import Vector2 from "../../../Vector2";
import SizeRequest from "../lib/SizeRequest";
import {ref} from "../../ref";
import SingleEventEmitter from "../../SingleEventEmitter";
import TextComponent from "./TextComponent";

const enum PointerState {
    out,
    over,
    down
}

const fill: Record<PointerState, string> = {
    [PointerState.out]: "#222",
    [PointerState.over]: "#444",
    [PointerState.down]: "#666"
};

export default class ButtonComponent extends Component {
    readonly #paddingLeft = this.createLinkedReference(4);
    readonly #paddingRight = this.createLinkedReference(4);
    readonly #paddingTop = this.createLinkedReference(6);
    readonly #paddingBottom = this.createLinkedReference(6);
    readonly #innerSize = this.createLinkedReference<Vector2 | null>(null);

    readonly #pointerState = this.createLinkedReference(PointerState.out, {
        triggers: {
            render: true,
            resize: false,
            childPositions: false
        }
    });

    readonly #canvas: InteractiveCanvas;
    readonly #coroutineManager: CoroutineManager;
    readonly #focusTarget: FocusTarget;

    readonly #collider = ref(new RectangleCollider(Vector2.zero, Vector2.zero));

    readonly #clickedEvent = new SingleEventEmitter();

    constructor(canvas: InteractiveCanvas) {
        super();
        this.#canvas = canvas;
        this.#coroutineManager = canvas.getCoroutineManager();
        this.#focusTarget = this.#coroutineManager.createFocusTarget();

        this.initialisedEvent.listen(() => this.#handleInitialised());
        this.globalPositionUpdatedEvent.listen(() => this.#updateCollider());
        this.resizedEvent.listen(() => this.#updateCollider())
    }

    get clickedEvent() {
        return this.#clickedEvent.getListener();
    }

    get innerSize() {
        return this.#innerSize.get();
    }

    set innerSize(value) {
        this.#innerSize.set(value);
    }

    get paddingLeft() {
        return this.#paddingLeft.get();
    }

    set paddingLeft(value) {
        this.#paddingLeft.set(value);
    }

    get paddingRight() {
        return this.#paddingRight.get();
    }

    set paddingRight(value) {
        this.#paddingRight.set(value);
    }

    set paddingX(value) {
        this.#paddingLeft.set(value);
        this.#paddingRight.set(value);
    }

    get paddingTop() {
        return this.#paddingTop.get();
    }

    set paddingTop(value) {
        this.#paddingTop.set(value);
    }

    get paddingBottom() {
        return this.#paddingBottom.get();
    }

    set paddingBottom(value) {
        this.#paddingBottom.set(value);
    }

    set paddingY(value) {
        this.#paddingTop.set(value);
        this.#paddingBottom.set(value);
    }

    static createWithText(canvas: InteractiveCanvas, text: string): { button: ButtonComponent, text: TextComponent } {
        const textComponent = new TextComponent();
        textComponent.displayName = "Button Label";
        textComponent.text = text;
        textComponent.fill = "white";

        const button = new ButtonComponent(canvas);
        button.addChild(textComponent);

        return {button, text: textComponent};
    }

    protected render(ctx: CanvasFrameContext) {
        clear(ctx, Vector2.zero, this.getSize());

        roundedRectangle(ctx, Vector2.one, this.getSize().subtract(new Vector2(2, 2)), 3, {
            fill: fill[this.#pointerState.get()],
            thickness: 1,
            colour: "#aaa"
        });

        for (const child of this.getChildren()) {
            const imageSource = this.getChildImageSource(child);
            copyFrom(imageSource, ctx, Vector2.one.add(new Vector2(this.paddingLeft, this.paddingTop)));
        }
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        const child = this.getOnlyChild();
        const {minSize, requestedSize} = this.getChildSizeRequest(child);

        const vecOf2 = new Vector2(2, 2);
        const totalPadding = new Vector2(this.paddingLeft + this.paddingRight, this.paddingTop + this.paddingBottom);

        return {
            minSize: minSize.add(vecOf2).add(totalPadding),
            requestedSize: (this.innerSize ?? requestedSize)?.add(vecOf2).add(totalPadding)
        };
    }

    protected getChildrenSizes(): ReadonlyMap<symbol, Vector2> {
        const child = this.getOnlyChild();
        const size = this.getChildSizeRequest(child);

        return new Map([[
            child,
            this.innerSize ?? size.requestedSize ?? size.minSize
        ]]);
    }

    protected getChildPosition(identifier: symbol): Vector2 {
        return Vector2.one.add(new Vector2(this.paddingLeft, this.paddingTop));
    }

    #handleInitialised() {
        this.#startMouseCoroutine();
    }

    #startMouseCoroutine() {
        const collider = this.#collider;
        const canvas = this.#canvas;
        const pointerState = this.#pointerState;
        const clickedEvent = this.#clickedEvent;
        const focusTarget = this.#focusTarget;
        const coroutineManager = this.#coroutineManager;

        coroutineManager.startCoroutine(function* handleButtonInteraction() {
            while (true) {
                focusTarget.blur();

                yield waitUntil.mouseEntered(collider, {focusTarget});
                focusTarget.focus();

                const popMouse = canvas.pushCursor("pointer");
                pointerState.set(PointerState.over);

                let x = yield waitUntil.one([
                    waitUntil.mouseExited(collider),
                    waitUntil.leftMousePressed()
                ]);

                if (x.data === 0) {
                    pointerState.set(PointerState.out);
                    popMouse();
                    continue;
                }

                pointerState.set(PointerState.down);

                x = yield waitUntil.one([
                    waitUntil.mouseExited(collider),
                    waitUntil.leftMouseReleased()
                ]);

                if (x.data === 0) {
                    x = yield waitUntil.one([
                        waitUntil.mouseExited(collider, {
                            minDistance: 10
                        }),
                        waitUntil.leftMouseReleased()
                    ]);
                }

                if (x.data === 1) {
                    clickedEvent.emit();
                }

                pointerState.set(PointerState.out);

                popMouse();
            }
        });
    }

    #updateCollider() {
        if (this.getGlobalPosition().isNaV || this.getSize().isNaV) return;
        const collider = new RectangleCollider(this.getGlobalPosition(), this.getGlobalPosition().add(this.getSize()));
        this.#collider.set(collider);
    }
}
