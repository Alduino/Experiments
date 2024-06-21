import {InteractiveCanvasFrameContext} from "@experiment-libs/canvas";
import RootComponent from "./RootComponent";
import {Vector2} from "@experiment-libs/utils";
import * as inspector from "./inspector-symbols";
import {line, rect, textWithBackground} from "@experiment-libs/imui";
import Component from "./Component";

type CanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const previousTlPositions = new WeakMap<CanvasContext, Vector2>();
const previousBrPositions = new WeakMap<CanvasContext, Vector2>();

export function drawScuiInspector(ctx: InteractiveCanvasFrameContext, root: RootComponent) {
    const component = root.getComponentUnderPosition(ctx.mousePos);

    if (!component) {
        previousTlPositions.delete(ctx.renderer);
        previousBrPositions.delete(ctx.renderer);
        return;
    }

    const previousTl = previousTlPositions.get(ctx.renderer);
    const previousBr = previousBrPositions.get(ctx.renderer);

    const tl = component[inspector.GET_GLOBAL_TL]();
    const br = component[inspector.GET_GLOBAL_BR]();
    const name = component[inspector.GET_NAME]();
    const imageSource = component[inspector.GET_IMAGE_SOURCE]();

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

    const labelPosition = new Vector2(roundedTl.x + (roundedBr.x - roundedTl.x) / 2, roundedTl.y - 26);
    textWithBackground(ctx, labelPosition, `${name}: ${width} x ${height}`, {
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

    const maxPreviewSize = ctx.keyDown.get("ShiftLeft") ? 800 : 200;

    const aspectRatio = width / height;
    const previewSize = new Vector2(
        aspectRatio > 1 ? Math.min(maxPreviewSize, width) : Math.min(maxPreviewSize, height) * aspectRatio,
        aspectRatio > 1 ? Math.min(maxPreviewSize, width) / aspectRatio : Math.min(maxPreviewSize, height)
    );
    const previewPosition = new Vector2(
        roundedTl.x + (roundedBr.x - roundedTl.x) / 2 - previewSize.x / 2,
        Math.min(roundedBr.y + 10, ctx.screenSize.y - previewSize.y - 10)
    );
    rect(ctx, previewPosition.subtract(2), previewPosition.add(previewSize).add(2), {
        fill: "#8a5598"
    });

    for (let checkerboardX = 0; checkerboardX < previewSize.x / 10; checkerboardX++) {
        for (let checkerboardY = 0; checkerboardY < previewSize.y / 10; checkerboardY++) {
            const tl = previewPosition.add(new Vector2(checkerboardX * 10, checkerboardY * 10));
            const br = Vector2.min(previewPosition.add(new Vector2(checkerboardX * 10 + 10, checkerboardY * 10 + 10)), previewPosition.add(previewSize));

            if (checkerboardX % 2 === checkerboardY % 2) {
                rect(ctx, tl, br, {
                    fill: "#f6d1ff"
                });
            } else {
                rect(ctx, tl, br, {
                    fill: "#cb9ed9"
                });
            }
        }
    }

    ctx.renderer.drawImage(imageSource, previewPosition.x, previewPosition.y, previewSize.x, previewSize.y);
}
