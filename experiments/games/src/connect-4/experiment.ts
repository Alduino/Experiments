import {InteractiveCanvas} from "@experiment-libs/canvas";
import {getCanvas, onCleanup} from "@experiment-libs/experiment/experiment";
import {copyFrom, rect, roundedRectangle, text} from "@experiment-libs/imui"
import {ref, Vector2} from "@experiment-libs/utils";
import {AbsoluteComponent, drawScuiInspector, FlexComponent, RootComponent, TextComponent} from "@experiment-libs/scui";
import {Column} from "./Column";
import {BOARD_WIDTH, COLUMN_BITMASK} from "./constants";
import {createWinningPatterns, getStateOffset} from "./utils";


function toB2(n: bigint) {
    return n.toString(2);
}

const canvas = new InteractiveCanvas(getCanvas());

const winningPatterns: bigint[] = createWinningPatterns();

let player1State = 0n;
let player2State = 0n;

const activePlayer = ref<"player1" | "player2">("player1");

function getCombinedState() {
    return player1State | player2State;
}

function getActiveState() {
    return activePlayer.get() === "player1" ? player1State : player2State;
}

/**
 * If the player has won the game, return the pieces that make up the winning pattern.
 * Otherwise, return null.
 */
function getWinningPattern(player: "player1" | "player2"): bigint | null {
    const state = player === "player1" ? player1State : player2State;

    for (const pattern of winningPatterns) {
        if ((state & pattern) === pattern) {
            return state & pattern;
        }
    }

    return null;
}

function checkWin() {

}

const root = new RootComponent();
const absoluteContainer = new AbsoluteComponent({fillParent: true});
root.setChild(absoluteContainer);

const columns = new Array(BOARD_WIDTH).fill(null).map(() => new Column(canvas));

columns.forEach((column, index) => {
    column.placeEvent.listen(() => {
        const stateOffset = getStateOffset(index, 0);

        const combinedState = (getCombinedState() >> stateOffset) & COLUMN_BITMASK;
        const activeState = (getActiveState() >> stateOffset) & COLUMN_BITMASK;

        if (combinedState === COLUMN_BITMASK) {
            return;
        }

        const newState = column.addPiece(activeState, combinedState);

        if (activePlayer.get() === "player1") {
            player1State |= newState << stateOffset;
        } else if (activePlayer.get() === "player2") {
            player2State |= newState << stateOffset;
        }

        column.setColumnState(player1State >> stateOffset, player2State >> stateOffset);

        if (activePlayer.get() === "player1") {
            stateLabel.text = `${player1State.toString(10)} - ${player2State.toString(10)}`;
        } else {
            stateLabel.text = `${player2State.toString(10)} - ${player1State.toString(10)}`;
        }

        checkWin();
    });
});

const outerWrapper = new FlexComponent();
outerWrapper.gap = 8;
outerWrapper.direction = "column";
outerWrapper.crossAlignItems = "stretch";

const flexContainer = new FlexComponent();
flexContainer.gap = 0;
flexContainer.direction = "row";
flexContainer.addChildren(...columns.map(col => col.getComponent()));

outerWrapper.addChild(flexContainer);
absoluteContainer.addChild(outerWrapper);
absoluteContainer.setChildPosition(outerWrapper, new Vector2(100, 100));

const stateLabel = new TextComponent();
outerWrapper.addChild(stateLabel);

root.setDrawnPosition(Vector2.zero);
root.setSize(canvas.size);

function handleBatchedUpdates() {
    root.handleBatchedUpdates();

    requestIdleCallback(handleBatchedUpdates);
}

handleBatchedUpdates();

let inspecting = false;
canvas.start(ctx => {
    rect(ctx, Vector2.zero, ctx.screenSize, {
        fill: activePlayer.get() === "player1" ? "#ff3370" : "#ffbe33"
    });

    roundedRectangle(ctx, new Vector2(16, 16), ctx.screenSize.subtract(new Vector2(16, 16)), 8, {
        fill: "white"
    });

    root.setSize(canvas.size);
    root.render();
    copyFrom(root.getImageSource(), ctx, Vector2.zero);

    if (ctx.keyPressed.get("KeyD")) {
        inspecting = !inspecting;
    }

    if (inspecting) {
        drawScuiInspector(ctx, root);
        canvas.drawDebug(ctx);
    } else {
        text(ctx, new Vector2(24, 24), "Press D to inspect", {
            align: "left",
            font: "16px sans-serif",
            fill: "#888"
        });
    }
});

onCleanup(() => {
    canvas.stop();
});
