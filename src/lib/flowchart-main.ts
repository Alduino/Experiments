import Canvas, {c, CanvasFrameContext} from "./canvas-setup";
import Vector2 from "./Vector2";
import {clear, quadraticCurve} from "./imgui";
import {v4} from "uuid";

const canvas = new Canvas("canvas");
const coroutineManager = canvas.getCoroutineManager();

class FlowItem {
    children = new Set<FlowItem>();
    readonly id = v4();
    private _el = document.createElement("div");
    private _needsUpdate = true;

    constructor(private _pos: Vector2) {
        this.initDomEl();
    }

    private _hovered = false;

    get hovered() {
        return this._hovered;
    }

    set hovered(v) {
        if (v === this.hovered) return;
        this._hovered = v;
        this._needsUpdate = true;
    }

    private _selected = false;

    get selected() {
        return this._selected;
    }

    set selected(v) {
        if (v === this.selected) return;
        this._selected = v;
        this._needsUpdate = true;
    }

    private _buttonHovered = false;

    get buttonHovered() {
        return this._buttonHovered;
    }

    set buttonHovered(v) {
        if (v === this.buttonHovered) return;
        this._buttonHovered = v;
        this._needsUpdate = true;
    }

    private _size: Vector2 = new Vector2(200, 100);

    get size() {
        return this._size;
    }

    set size(v) {
        this._size = v;
        this._needsUpdate = true;
    }

    get pos() {
        return this._pos;
    }

    set pos(v) {
        this._pos = v;
        this._needsUpdate = true;
    }

    get childCount() {
        return this.children.size;
    }

    isVecInside(pos: Vector2) {
        const halfWidth = this.size.divide(new Vector2(2, 2));
        const topLeft = this.pos.subtract(halfWidth);
        const bottomRight = this.pos.add(halfWidth);
        return pos.x > topLeft.x && pos.y > topLeft.y && pos.x < bottomRight.x && pos.y < bottomRight.y;
    }

    frame() {
        if (this._needsUpdate) this.updateDomElement();
    }

    getEdgePointTowards(target: Vector2, expansion = 0) {
        return Vector2.from(pointOnRect(
            target.x, target.y,
            this.pos.x - this.size.x / 2 - expansion, this.pos.y - this.size.y / 2 - expansion,
            this.pos.x + this.size.x / 2 + expansion, this.pos.y + this.size.y / 2 + expansion
        ));
    }

    private initDomEl() {
        this._el.classList.add("flowchart-item");
        document.body.appendChild(this._el);

        this.updateDomElement();
    }

    private updateDomElement() {
        this._needsUpdate = false;
        this._el.style.top = (this.pos.y - this.size.y / 2 - 2) + "px";
        this._el.style.left = (this.pos.x - this.size.x / 2 - 2) + "px";
        this._el.style.height = this.size.y + "px";
        this._el.style.width = this.size.x + "px";
        this._el.setAttribute("data-title", "Example Label");
        this._el.setAttribute("data-hover", this.hovered.toString());
        this._el.setAttribute("data-active", this.selected.toString());
        this._el.setAttribute("data-btn-hover", this.buttonHovered.toString());
    }
}

const rootFlowItems = new Set<FlowItem>();
let selectedItem: FlowItem | null = null;
let hoveredItem: FlowItem | null = null;
let hoveredAddButtonHovered = false;

function flattenFlowItems(root = rootFlowItems, _set = new Set<FlowItem>()): FlowItem[] {
    for (const item of root) {
        _set.add(item);
        flattenFlowItems(item.children, _set);
    }

    return Array.from(_set);
}

function handleDoubleClick(ctx: CanvasFrameContext) {
    const newFlowItem = new FlowItem(ctx.mousePos);
    rootFlowItems.add(newFlowItem);
}

function handleSingleClick(ctx: CanvasFrameContext) {
    selectedItem = null;

    const flattenedItems = flattenFlowItems();
    for (let i = flattenedItems.length - 1; i >= 0; i--) {
        const item = flattenedItems[i];
        if (item.isVecInside(ctx.mousePos)) {
            selectedItem = item;
            break;
        }
    }

    if (hoveredAddButtonHovered) {
        const targetItem = hoveredItem;

        coroutineManager.startCoroutine(function* handleCreateNewDrag(signal) {
            let r = yield c.mouseMoved(signal);
            const newItem = new FlowItem(r.ctx.mousePos);
            targetItem.children.add(newItem);

            yield c.waitForFirst([
                coroutineManager.startCoroutine("handleMouseDrag.impl", function* (signal) {
                    while (true) {
                        const {ctx} = yield c.mouseMoved(signal);
                        newItem.pos = ctx.mousePos;
                    }
                }).awaiter,
                c.leftMouseReleased()
            ], signal);
        });
    } else if (selectedItem && ctx.mouseDown.left) {
        coroutineManager.startCoroutine(function* handleMouseDrag(signal) {
            yield c.waitForFirst([
                coroutineManager.startCoroutine("handleMouseDrag.impl", function* (signal) {
                    while (true) {
                        const {ctx} = yield c.mouseMoved(signal);
                        selectedItem.pos = ctx.mousePos;
                    }
                }).awaiter,
                c.leftMouseReleased()
            ], signal);
        });
    }
}

function handleClick(ctx: CanvasFrameContext, clickCount: number) {
    switch (clickCount) {
        case 1:
            handleSingleClick(ctx);
            break;
        case 2:
            handleDoubleClick(ctx);
            break;
    }
}

/**
 * Finds the intersection point between
 *     * the rectangle
 *       with parallel sides to the x and y axes
 *     * the half-line pointing towards (x,y)
 *       originating from the middle of the rectangle
 *
 * Note: the function works given min[XY] <= max[XY],
 *       even though minY may not be the "top" of the rectangle
 *       because the coordinate system is flipped.
 * Note: if the input is inside the rectangle,
 *       the line segment wouldn't have an intersection with the rectangle,
 *       but the projected half-line does.
 * Warning: passing in the middle of the rectangle will return the midpoint itself
 *          there are infinitely many half-lines projected in all directions,
 *          so let's just shortcut to midpoint (GIGO).
 *
 * @param x x coordinate of point to build the half-line from
 * @param y y coordinate of point to build the half-line from
 * @param minX the "left" side of the rectangle
 * @param minY the "top" side of the rectangle
 * @param maxX the "right" side of the rectangle
 * @param maxY the "bottom" side of the rectangle
 * @param validate (optional) whether to treat point inside the rect as error
 * @return an object with x and y members for the intersection
 * @throws if validate == true and (x,y) is inside the rectangle
 * @author TWiStErRob, modified to TypeScript and to throw Errors instead of strings by Alduino
 * @licence Dual CC0/WTFPL/Unlicence, whatever floats your boat
 * @see <a href="http://stackoverflow.com/a/31254199/253468">source</a>
 * @see <a href="http://stackoverflow.com/a/18292964/253468">based on</a>
 */
function pointOnRect(x: number, y: number, minX: number, minY: number, maxX: number, maxY: number, validate: boolean = false) {
    //assert minX <= maxX;
    //assert minY <= maxY;
    if (validate && (minX < x && x < maxX) && (minY < y && y < maxY))
        throw new Error(`Point ${[x, y]}cannot be inside the rectangle: ${[minX, minY]} - ${[maxX, maxY]}`);

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    // if (midX - x == 0) -> m == ±Inf -> minYx/maxYx == x (because value / ±Inf = ±0)
    const m = (midY - y) / (midX - x);

    if (x <= midX) { // check "left" side
        const minXy = m * (minX - x) + y;
        if (minY <= minXy && minXy <= maxY)
            return {x: minX, y: minXy};
    }

    if (x >= midX) { // check "right" side
        const maxXy = m * (maxX - x) + y;
        if (minY <= maxXy && maxXy <= maxY)
            return {x: maxX, y: maxXy};
    }

    if (y <= midY) { // check "top" side
        const minYx = (minY - y) / m + x;
        if (minX <= minYx && minYx <= maxX)
            return {x: minYx, y: minY};
    }

    if (y >= midY) { // check "bottom" side
        const maxYx = (maxY - y) / m + x;
        if (minX <= maxYx && maxYx <= maxX)
            return {x: maxYx, y: maxY};
    }

    // edge case when finding midpoint intersection: m = 0/0 = NaN
    if (x === midX && y === midY) return {x: x, y: y};

    // Should never happen :) If it does, please tell me!
    throw new Error(`Cannot find intersection for ${[x, y]} inside rectangle ${[minX, minY]} - ${[maxX, maxY]}`)
}

interface ConnectionDetails {
    parentPos: Vector2;
    childPos: Vector2;
    controlPos: Vector2;
    velocity: Vector2;
}

const connectionCache = new Map<string, ConnectionDetails>();

function drawFlowItem(ctx: CanvasFrameContext, item: FlowItem) {
    item.hovered = hoveredItem === item;
    item.selected = selectedItem === item;

    item.frame();

    for (const child of item.children) {
        const idealControlPosition = item.pos.add(child.pos.subtract(item.pos).divide(2));

        const cacheKey = `${item.id}::${child.id}`;
        const connectionDetails = connectionCache.get(cacheKey) ?? {
            parentPos: item.pos,
            childPos: child.pos,
            controlPos: idealControlPosition,
            velocity: new Vector2()
        };

        if (!connectionCache.has(cacheKey)) connectionCache.set(cacheKey, connectionDetails);

        const parentMovement = item.pos.subtract(connectionDetails.parentPos);
        const childMovement = child.pos.subtract(connectionDetails.childPos);

        const noSpringVelocity = parentMovement.add(childMovement).add(connectionDetails.velocity.multiply(.2)).multiply(.3);
        const springBack = connectionDetails.controlPos.add(noSpringVelocity).subtract(idealControlPosition);
        const velocity = noSpringVelocity.subtract(springBack.multiply(.2)).add(new Vector2(0, 10));

        const newControlPoint = connectionDetails.controlPos.add(velocity);

        connectionDetails.parentPos = item.pos;
        connectionDetails.childPos = child.pos;
        connectionDetails.controlPos = newControlPoint;
        connectionDetails.velocity = velocity;

        const fromPoint = item.getEdgePointTowards(newControlPoint);
        const toPoint = child.getEdgePointTowards(newControlPoint);

        // draw a line to the child
        quadraticCurve(ctx, {
            start: fromPoint,
            control: newControlPoint,
            end: toPoint,
            thickness: 2,
            colour: "red"
        });

        drawFlowItem(ctx, child);
    }
}

function drawFlowItems(ctx: CanvasFrameContext, items: Set<FlowItem>) {
    for (const item of items) {
        drawFlowItem(ctx, item);
    }
}

// Multi mouse click
coroutineManager.startCoroutine(function* handleMouseClick(signal: AbortSignal) {
    while (!signal.aborted) {
        const firstPress = yield c.leftMousePressed(signal);
        if (firstPress.aborted) break;

        let clickCount = 1, lastCtx = firstPress.ctx;

        while (!signal.aborted) {
            // wait until the button is pressed again, but don't continue if the mouse is moved first
            const nextPress = yield c.waitForFirst([
                c.leftMousePressed(),
                c.mouseMoved(),
                c.delay(200)
            ], signal);
            lastCtx = nextPress.ctx;
            if (nextPress.data !== 0) break;
            clickCount++;
        }

        handleClick(lastCtx, clickCount);
    }
});

canvas.start(ctx => {
    clear(ctx);

    hoveredItem = null;
    const flattenedItems = flattenFlowItems();
    for (let i = flattenedItems.length - 1; i >= 0; i--) {
        const item = flattenedItems[i];
        if (item.isVecInside(ctx.mousePos)) {
            hoveredItem = item;
            break;
        }
    }

    if (hoveredItem) {
        const hoveredItemOffset = ctx.mousePos.subtract(hoveredItem.pos.subtract(hoveredItem.size.divide(new Vector2(2, 2))));
        const plusButtonSize = 27;
        if (hoveredItemOffset.x > hoveredItem.size.x - plusButtonSize &&
            hoveredItemOffset.y > hoveredItem.size.y - plusButtonSize) {
            hoveredAddButtonHovered = true;
            hoveredItem.buttonHovered = true;
        } else {
            hoveredAddButtonHovered = false;
            hoveredItem.buttonHovered = false;
        }
    }

    // draw each flow item
    drawFlowItems(ctx, rootFlowItems);

    canvas.drawDebug(ctx);
});
