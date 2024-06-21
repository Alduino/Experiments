import {Component, SizeRequest} from "../lib";
import {Vector2} from "@experiment-libs/utils";
import {CanvasFrameContext} from "@experiment-libs/canvas";

export default class PaddingComponent extends Component {
    #paddingTop = this.createLinkedReference(0);
    #paddingBottom = this.createLinkedReference(0);
    #paddingLeft = this.createLinkedReference(0);
    #paddingRight = this.createLinkedReference(0);

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

    set paddingX(value: number) {
        this.paddingLeft = this.paddingRight = value;
    }

    set paddingY(value: number) {
        this.paddingTop = this.paddingBottom = value;
    }

    set padding(value: number | Vector2) {
        if (typeof value === "number") value = new Vector2(value, value);

        this.paddingX = value.x;
        this.paddingY = value.y;
    }

    protected getChildLimit(): number {
        return 1;
    }

    protected render(ctx: CanvasFrameContext): void {
        this.drawChildren(ctx);
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        const childSizeRequest = this.getChildSizeRequest(this.getOnlyChild());
        const paddingVec = new Vector2(this.paddingLeft + this.paddingRight, this.paddingTop + this.paddingBottom);

        return {
            minSize: childSizeRequest.minSize.add(paddingVec),
            requestedSize: childSizeRequest.requestedSize?.add(paddingVec)
        };
    }

    protected getChildrenSizes(): ReadonlyMap<symbol, Vector2> {
        const onlyChild = this.getOnlyChild();
        const sizeRequest = this.getChildSizeRequest(onlyChild);

        return new Map([[
            onlyChild,
            sizeRequest.requestedSize ?? sizeRequest.minSize
        ]]);
    }

    protected getChildPosition(identifier: symbol): Vector2 {
        return new Vector2(this.paddingLeft, this.paddingTop);
    }
}
