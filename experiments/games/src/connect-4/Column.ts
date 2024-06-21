import {HoleComponent} from "./HoleComponent";
import {AbsoluteComponent, FlexComponent, PaddingComponent, RectangleComponent} from "@experiment-libs/scui";
import {BOARD_HEIGHT} from "./constants";
import {SingleEventEmitter, Vector2} from "@experiment-libs/utils";
import {InteractiveCanvas, waitUntil} from "@experiment-libs/canvas";

export class Column {
    readonly #canvas: InteractiveCanvas;

    readonly #root = new AbsoluteComponent({shrink: true});
    readonly #background = new RectangleComponent();
    readonly #holes = new Array(BOARD_HEIGHT).fill(0).map(() => new HoleComponent());

    readonly #placeEvent = new SingleEventEmitter();

    #disabled = true;

    get placeEvent() {
        return this.#placeEvent.getListener();
    }

    constructor(canvas: InteractiveCanvas) {
        this.#setHovered(false);

        const paddingContainer = new PaddingComponent();
        paddingContainer.padding = 8;

        const flexContainer = new FlexComponent();
        flexContainer.gap = 8;

        paddingContainer.addChild(flexContainer);
        flexContainer.addChildren(...this.#holes.slice().reverse());

        this.#root.addChild(this.#background);
        this.#root.setChildPosition(this.#background, Vector2.zero);

        this.#root.addChild(paddingContainer);
        this.#root.setChildPosition(paddingContainer, Vector2.zero);

        this.#canvas = canvas;

        this.enable();
    }

    setColumnState(player1State: bigint, player2State: bigint) {
        for (let i = 0; i < BOARD_HEIGHT; i++) {
            const mask = 1n << BigInt(i);
            const hole = this.#holes[i];

            if ((player1State & mask) !== 0n) {
                hole.setStatus("player1");
            } else if ((player2State & mask) !== 0n) {
                hole.setStatus("player2");
            } else {
                hole.setStatus("empty");
            }
        }
    }

    getComponent() {
        return this.#root;
    }

    #setHovered(state: boolean) {
        this.#background.fill = state ? "#cfd4d5" : "#d7dbdc";
    }

    enable() {
        if (!this.#disabled) return;

        const cm = this.#canvas.getCoroutineManager();
        const focusTarget = cm.getFocusTargetManager().createFocusTarget();

        cm.startCoroutine(function* () {
            while (true) {
                yield waitUntil.mouseEntered(this.#root.collider, {focusTarget});
                const popCursor = this.#canvas.pushCursor("pointer");
                this.#setHovered(true);
                focusTarget.focus();

                yield waitUntil.mouseExited(this.#root.collider);
                popCursor();
                this.#setHovered(false);
                focusTarget.blur();
            }
        }.bind(this));

        cm.startCoroutine(function* () {
            while (true) {
                yield waitUntil.leftMousePressed({collider: this.#root.collider});
                this.#placeEvent.emit();
            }
        }.bind(this));
    }

    addPiece(activeState: bigint, combinedState: bigint) {
        const mask = ~combinedState & (combinedState + 1n);
        return activeState | mask;
    }
}
