import Component from "../lib/Component";
import Vector2 from "../../../Vector2";
import {Reference} from "../../ref";
import {CanvasFrameContext} from "../../../canvas-setup";
import SizeRequest from "../lib/SizeRequest";
import iter from "itiriri";

export default class AbsoluteComponent extends Component {
    #childrenPositions = this.createChildrenMetadata<Reference<Vector2>>(
        () => this.createLinkedReference(Vector2.notAVector, {
            checkEquality: Vector2.equal
        })
    );

    setChildPosition(child: Component, position: Vector2) {
        const childIdentifier = this.getChildComponentIdentifier(child);
        this.#childrenPositions.get(childIdentifier).set(position.round());
    }

    protected render(ctx: CanvasFrameContext) {
        this.renderChildren(ctx);
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        const children = this.getChildren();

        const max = (a: Vector2, b: Vector2) => Vector2.max(a, b);

        const minSize = iter(children).map(child => {
            const position = this.#childrenPositions.get(child).get();
            const {minSize} = this.getChildSizeRequest(child);
            return position.add(minSize);
        }).reduce(max, Vector2.zero);

        const requestedSize = iter(children).map(child => {
            const position = this.#childrenPositions.get(child).get();
            const {minSize, requestedSize} = this.getChildSizeRequest(child);
            return position.add(requestedSize ?? minSize);
        }).reduce(max, Vector2.zero);

        return {minSize, requestedSize};
    }

    protected getChildrenSizes(): ReadonlyMap<symbol, Vector2> {
        const children = this.getChildren();
        const size = this.getSize();

        return iter(children).map<[symbol, Vector2]>(child => {
            const position = this.#childrenPositions.get(child).get();

            if (position.isNaV) {
                throw new Error(`Position has not been set for child \`${child.description}\``);
            }

            const {minSize, requestedSize} = this.getChildSizeRequest(child);
            if (!requestedSize) return [child, minSize];

            const maxSize = size.subtract(position);
            const childSize = Vector2.max(minSize, Vector2.min(maxSize, requestedSize));

            return [child, childSize];
        }).toMap(([k]) => k, ([, v]) => v);
    }

    protected getChildPosition(identifier: symbol): Vector2 {
        return this.#childrenPositions.get(identifier).get();
    }
}
