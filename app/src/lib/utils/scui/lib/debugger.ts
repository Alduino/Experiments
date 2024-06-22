import {InteractiveCanvasFrameContext} from "../../../canvas-setup";
import RootComponent from "./RootComponent";
import {GET_GLOBAL_BR, GET_GLOBAL_TL, GET_NAME} from "./inspector-symbols";
import {line, rect, textWithBackground} from "../../../imgui";
import Vector2 from "../../../Vector2";

const previousTlPositions = new WeakMap<CanvasRenderingContext2D, Vector2>();
const previousBrPositions = new WeakMap<CanvasRenderingContext2D, Vector2>();

export function drawScuiInspector(ctx: InteractiveCanvasFrameContext, root: RootComponent) {
    const component = root.getComponentUnderPosition(ctx.mousePos);

    if (!component) {
        previousTlPositions.delete(ctx.renderer);
        previousBrPositions.delete(ctx.renderer);
        return;
    }

    const previousTl = previousTlPositions.get(ctx.renderer);
    const previousBr = previousBrPositions.get(ctx.renderer);

    const tl = component[GET_GLOBAL_TL]();
    const br = component[GET_GLOBAL_BR]();
    const name = component[GET_NAME]();

    const actualTl = previousTl ? previousTl.add(tl.subtract(previousTl).divide(2)) : tl;
    const actualBr = previousBr ? previousBr.add(br.subtract(previousBr).divide(2)) : br;

    previousTlPositions.set(ctx.renderer, actualTl);
    previousBrPositions.set(ctx.renderer, actualBr);

    const roundedTl = actualTl.round();
    const roundedBr = actualBr.round();

    const width = br.x - tl.x;
    const height = br.y - tl.y;

    rect(ctx, roundedTl, actualBr, {
        fill: "#f0afff66"
    });

    line(ctx, {
        start: roundedTl.justX,
        end: roundedTl.justX.add(ctx.screenSize.justY),
        thickness: 1,
        colour: "#ea98ff",
        dash: [5, 5]
    });

    line(ctx, {
        start: roundedBr.justX,
        end: roundedBr.justX.add(ctx.screenSize.justY),
        thickness: 1,
        colour: "#ea98ff",
        dash: [5, 5]
    });

    line(ctx, {
        start: roundedTl.justY,
        end: roundedTl.justY.add(ctx.screenSize.justX),
        thickness: 1,
        colour: "#ea98ff",
        dash: [5, 5]
    });

    line(ctx, {
        start: roundedBr.justY,
        end: roundedBr.justY.add(ctx.screenSize.justX),
        thickness: 1,
        colour: "#ea98ff",
        dash: [5, 5]
    });

    const position = new Vector2(roundedTl.x + (roundedBr.x - roundedTl.x) / 2, roundedTl.y - 26);

    textWithBackground(ctx, position, `${name}: ${width} x ${height}`, {
        background: {
            fill: "#8a5598",
            thickness: 1,
            colour: "#f6d1ff"
        },
        text: {
            fill: "white",
            font: "12px sans-serif",
            align: "center"
        },
        padding: new Vector2(4, 4),
        minPosition: new Vector2(10, 10),
        maxPosition: ctx.screenSize.subtract(new Vector2(10, 10))
    });
}
