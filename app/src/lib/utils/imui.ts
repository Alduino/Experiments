import Vector2 from "../Vector2";
import {InteractiveCanvasFrameContext} from "../canvas-setup";
import {measureText, rect, roundedRectangle as drawRoundedRect, text as drawText} from "../imgui";

interface Context {
    ctx: InteractiveCanvasFrameContext;
    pos: Vector2;
    direction: "horizontal" | "vertical";
    maxSize: number;
    batch: (() => void)[];
}

let workingContext: Context | null;

function getContext() {
    if (!workingContext) throw new Error("Must be called inside a root");
    return workingContext;
}

function updateMaxSize(workingContext: Context, size: Vector2) {
    if (workingContext.direction === "horizontal") {
        if (size.y > workingContext.maxSize) workingContext.maxSize = size.y;
    } else {
        if (size.x > workingContext.maxSize) workingContext.maxSize = size.x;
    }
}

function shift(workingContext: Context, amount: Vector2) {
    const padded = amount.add(new Vector2(5, 5));

    if (workingContext.direction === "horizontal") {
        workingContext.pos = workingContext.pos.add(new Vector2(padded.x, 0));
    } else {
        workingContext.pos = workingContext.pos.add(new Vector2(0, padded.y));
    }
}

function nest(direction: Context["direction"], children: () => void, padding = new Vector2(0, 0), renderBehind?: (pos: Vector2, size: Vector2) => void) {
    const oldWorkingContext = getContext();

    const oldPos = oldWorkingContext.pos;

    workingContext = {
        ctx: oldWorkingContext.ctx,
        pos: oldPos.add(padding),
        direction,
        maxSize: 0,
        batch: []
    };

    children();

    const sizeVec = direction === "horizontal"
        ? new Vector2(workingContext.pos.x - oldPos.x, workingContext.maxSize).add(padding.multiply(2))
        : new Vector2(workingContext.maxSize, workingContext.pos.y - oldPos.y).add(padding.multiply(2));

    updateMaxSize(oldWorkingContext, sizeVec);
    shift(oldWorkingContext, sizeVec);

    const newWorkingContext = workingContext;
    workingContext = oldWorkingContext;

    oldWorkingContext.batch.push(() => {
        renderBehind?.(oldPos, sizeVec);
    });

    oldWorkingContext.batch.push(...newWorkingContext.batch);

    return {pos: oldPos, size: sizeVec};
}

export function drawPopupRoot(ctx: InteractiveCanvasFrameContext, position: Vector2, children: () => void) {
    if (workingContext) throw new Error("A root cannot go inside another root");

    workingContext = {
        ctx,
        pos: position.add(new Vector2(5, 5)),
        direction: "vertical",
        maxSize: 0,
        batch: []
    };

    children();

    const wcPos = workingContext.pos;
    const wcSize = workingContext.maxSize;

    workingContext.batch.unshift(() => {
        drawRoundedRect(ctx, position, new Vector2(position.x + wcSize + 10, wcPos.y), 3, {
            fill: "#0009"
        });
    });

    const drawCalls = workingContext.batch;

    ctx.disposeListeners.push(() => {
        for (const draw of drawCalls) {
            draw();
        }
    });

    workingContext = null;
}

export function flowHorizontally(children: () => void) {
    nest("horizontal", children);
}

export function flowVertically(children: () => void) {
    nest("vertical", children);
}

interface InteractiveOptions_Auto {
    controlled?: false;
}

interface InteractiveOptions_Controlled {
    controlled: true;
    isHovered: boolean;
    isActive: boolean;
}

export type InteractiveOptions = InteractiveOptions_Auto | InteractiveOptions_Controlled;

export function drawButton(children: () => void, options: InteractiveOptions = {}) {
    const context = getContext();

    const {pos, size} = nest("horizontal", children, new Vector2(5, 5), (pos, size) => {

        const mp = context.ctx.mousePos;
        const br = pos.add(size);

        const isHovered = options.controlled ? options.isHovered : mp.x > pos.x && mp.x < br.x && mp.y > pos.y && mp.y < br.y;
        const isActive = options.controlled ? options.isActive : isHovered && context.ctx.mouseDown.left;

        drawRoundedRect(context.ctx, pos, pos.add(size), 5, {
            fill: isActive ? "#555" : isHovered ? "#333" : "#000",
            thickness: 2,
            colour: "#aaa"
        });
    });

    const mp = context.ctx.mousePos;
    const br = pos.add(size);

    return mp.x > pos.x && mp.x < br.x && mp.y > pos.y && mp.y < br.y;
}

export function drawLabel(text: string) {
    const context = getContext();

    const font = "14px sans-serif";

    const size = measureText(context.ctx, text, {font});

    const sizeVec = new Vector2(
        size.width,
        size.actualBoundingBoxAscent + size.actualBoundingBoxDescent
    );

    updateMaxSize(workingContext, sizeVec);

    const pos = workingContext.pos;

    shift(workingContext, sizeVec);

    context.batch.push(() => {
        drawText(context.ctx, pos, text, {
            font,
            align: "left",
            fill: "white"
        });
    });
}

export function drawRect(size: Vector2, fill: string) {
    const context = getContext();
    updateMaxSize(workingContext, size);
    const pos = workingContext.pos;
    shift(workingContext, size);

    context.batch.push(() => {
        rect(context.ctx, pos, pos.add(size), {
            fill
        });
    });
}
