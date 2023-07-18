import Component from "../lib/Component";
import {ref, Reference} from "../../ref";
import Vector2 from "../../../Vector2";
import {CanvasFrameContext} from "../../../canvas-setup";
import {clear, copyFrom} from "../../../imgui";
import SizeRequest from "../lib/SizeRequest";
import iter from "itiriri";

type Alignment = "start" | "centre" | "end" | "stretch";

export interface ChildMetadata {
    grow: number;
    shrink: number;
    crossAlign: Alignment | null;
}

type ChildMetadataRefs = {
    [Key in keyof ChildMetadata]: Reference<ChildMetadata[Key]>;
};

export type FlexDirection = "column" | "row";

export default class FlexComponent extends Component {
    #gap = this.createLinkedReference(8);
    #direction = this.createLinkedReference<FlexDirection>("column");
    #childrenPositions = this.createChildrenMetadata(() => ref(Vector2.notAVector));

    #childrenMetadata = this.createChildrenMetadata<ChildMetadataRefs>(() => ({
        grow: this.createLinkedReference(0),
        shrink: this.createLinkedReference(1),
        crossAlign: this.createLinkedReference(null)
    }));

    #crossAlignItems = this.createLinkedReference<Alignment>("start");

    get gap() {
        return this.#gap.get();
    }

    set gap(value) {
        this.#gap.set(value);
    }

    get direction() {
        return this.#direction.get();
    }

    set direction(value) {
        this.#direction.set(value);
    }

    get crossAlignItems() {
        return this.#crossAlignItems.get();
    }

    set crossAlignItems(value) {
        this.#crossAlignItems.set(value);
    }

    updateChildMetadata(child: Component, metadata: Partial<ChildMetadata>) {
        const childIdentifier = this.getChildComponentIdentifier(child);
        const existingMetadata = this.#childrenMetadata.get(childIdentifier);

        if (metadata.grow != null) existingMetadata.grow.set(metadata.grow);
        if (metadata.shrink != null) existingMetadata.shrink.set(metadata.shrink);
        if (typeof metadata.crossAlign !== "undefined") existingMetadata.crossAlign.set(metadata.crossAlign);
    }

    protected render(ctx: CanvasFrameContext) {
        this.renderChildren(ctx);
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        const gap = this.gap;
        const gapVec = this.#getDirectedVector(gap);

        const children = this.getChildren();
        const childSizeRequests = Array.from(children)
            .map(child => this.getChildSizeRequest(child));

        const minSize = iter(childSizeRequests)
            .map(({minSize}) => minSize.add(gapVec))
            .reduce((total, curr) => this.#sumAndMax(total, curr), Vector2.zero);

        const requestedSize = iter(childSizeRequests)
            .map((size) => (size.requestedSize ?? size.minSize).add(gapVec))
            .reduce((total, curr) => this.#sumAndMax(total, curr), Vector2.zero);

        return {minSize, requestedSize};
    }

    protected getChildrenSizes(): ReadonlyMap<symbol, Vector2> {
        const children = this.getChildren();
        const thisSize = this.size;
        const directedSize = this.#getDirectedValue(thisSize);
        const crossSize = this.#getDirectedValue(thisSize, true);
        const gap = this.gap;
        const crossAlignment = this.#crossAlignItems.get();

        const growTotal = iter(this.#childrenMetadata.values())
            .reduce((total, {grow}) => total + grow.get(), 0);
        const shrinkTotal = iter(this.#childrenMetadata.values())
            .reduce((total, {shrink}) => total + shrink.get(), 0);

        const usedSpace = iter(children)
            .map(child => {
                const size = this.getChildSizeRequest(child);
                return this.#getDirectedValue(size.requestedSize ?? size.minSize) + gap;
            })
            .reduce((total, curr) => total + curr, 0) - gap;

        const usedSpaceOtherThanGrowable = iter(children)
            .map(child => {
                const size = this.#childrenMetadata.get(child).grow.get() === 0
                    ? this.getChildSizeRequest(child)
                    : {minSize: Vector2.zero};
                return this.#getDirectedValue(size.requestedSize ?? size.minSize) + gap;
            })
            .reduce((total, curr) => total + curr, 0) - gap;

        const eachItemSize = iter(children)
            .map(child => {
                const size = this.getChildSizeRequest(child);
                return [child, size.requestedSize ?? size.minSize] as const;
            })
            .toMap(element => element[0], ([, value]) => value);

        if (shrinkTotal > 0 && usedSpace > directedSize) {
            const oneShrinkAmount = (usedSpace - directedSize) / shrinkTotal;

            for (const [child, size] of eachItemSize) {
                const {shrink} = this.#childrenMetadata.get(child);
                const {minSize} = this.getChildSizeRequest(child);
                const shrinkAmount = shrink.get() * oneShrinkAmount;
                const shrinkAmountVec = this.#getDirectedVector(shrinkAmount);
                const shrunkSize = Vector2.max(minSize, size.subtract(shrinkAmountVec));
                eachItemSize.set(child, shrunkSize);
            }
        }

        if (growTotal > 0 && usedSpaceOtherThanGrowable < directedSize) {
            const oneGrowAmount = (directedSize - usedSpaceOtherThanGrowable) / growTotal;

            for (const [child, size] of eachItemSize) {
                const {grow: growRef, crossAlign: crossAlignOverride} = this.#childrenMetadata.get(child);
                const grow = growRef.get();
                const childCrossAlignment = crossAlignOverride.get() ?? crossAlignment;

                const isCrossStretched = childCrossAlignment === "stretch";

                if (grow === 0) {
                    if (isCrossStretched) {
                        const childMainSize = this.#getDirectedVector(size);
                        const childCrossSize = this.#getDirectedVector(crossSize, true);
                        eachItemSize.set(child, childMainSize.add(childCrossSize));
                    }

                    continue;
                }

                const childSize = grow * oneGrowAmount;
                const oldCrossSize = this.#getDirectedVector(isCrossStretched ? crossSize : size, true);
                const newDirectedSize = this.#getDirectedVector(childSize);
                eachItemSize.set(child, oldCrossSize.add(newDirectedSize));
            }
        }

        let position = 0;

        for (const [child, size] of eachItemSize) {
            const childCrossAlignment = this.#childrenMetadata.get(child).crossAlign.get() ?? crossAlignment;
            const mainAxisPositionVector = this.#getDirectedVector(position);
            const thisCrossAxisSize = this.#getDirectedValue(this.size, true);
            const childCrossAxisSize = this.#getDirectedValue(size, true);
            const crossAxisPositionVector = this.#getDirectedVector(this.#getAligned(thisCrossAxisSize, childCrossAxisSize, childCrossAlignment), true);
            const childPosition = mainAxisPositionVector.add(crossAxisPositionVector);
            this.#childrenPositions.get(child).set(childPosition);
            position += this.#getDirectedValue(size) + gap;
        }

        return eachItemSize;
    }

    protected getChildPosition(identifier: symbol): Vector2 {
        return this.#childrenPositions.get(identifier).get();
    }

    #sumAndMax(total: Vector2, curr: Vector2) {
        const addSrc = this.#getDirectedVector(total);
        const addCurr = this.#getDirectedVector(curr);
        const add = addSrc.add(addCurr);

        const maxSrc = this.#getDirectedVector(total, true);
        const maxCurr = this.#getDirectedVector(curr, true);
        const max = Vector2.max(maxSrc, maxCurr);

        return add.add(max);
    }

    #getDirectedVector(value: number | Vector2, cross = false) {
        const isDirX = this.direction === "row";
        const isX = isDirX !== cross;

        if (typeof value === "number") {
            value = new Vector2(value, value);
        }

        if (isX) {
            return value.justX;
        } else {
            return value.justY;
        }
    }

    #getDirectedValue(value: number | Vector2, cross = false) {
        const isDirX = this.direction === "row";
        const isX = isDirX !== cross;

        if (typeof value === "number") {
            value = new Vector2(value, value);
        }

        if (isX) return value.x;
        else return value.y;
    }

    #getAligned(thisSize: number, childSize: number, alignment: Alignment) {
        switch (alignment) {
            case "start":
            case "stretch":
                return 0;
            case "centre":
                return (thisSize - childSize) / 2;
            case "end":
                return thisSize - childSize;
        }
    }
}
