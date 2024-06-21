import {Reference, Vector2} from "@experiment-libs/utils";
import {CanvasFrameContext} from "@experiment-libs/canvas";
import iter from "itiriri";
import {Component, SizeRequest} from "../lib";

export interface AbsoluteComponentOptions {
    /**
     * Grow to the maximum size the parent allows, instead of the smallest size to contain the children.
     * @default false
     */
    fillParent?: boolean;

    /**
     * If `fillParent` is false, shrink to the minimum size of the children instead of their requested size.
     */
    shrink?: boolean;
}

export default class AbsoluteComponent extends Component {
    readonly #fillParent: boolean;
    readonly #shrink: boolean;

    #childrenPositions = this.createChildrenMetadata<Reference<Vector2>>(
        () => this.createLinkedReference(Vector2.notAVector, {
            checkEquality: Vector2.equal
        })
    );

    constructor(options: AbsoluteComponentOptions = {}) {
        super();

        this.#fillParent = options.fillParent ?? false;
        this.#shrink = options.shrink ?? false;
    }

    setChildPosition(child: Component, position: Vector2) {
        const childIdentifier = this.getChildComponentIdentifier(child);
        this.#childrenPositions.get(childIdentifier).set(position.round());
    }

    protected render(ctx: CanvasFrameContext) {
        this.drawChildren(ctx);
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        const children = this.getChildren();

        const max = (a: Vector2, b: Vector2) => Vector2.max(a, b);

        const minSize = iter(children).map(child => {
            const position = this.#childrenPositions.get(child).get();
            const {minSize} = this.getChildSizeRequest(child);
            return position.add(minSize);
        }).reduce(max, Vector2.zero);

        const requestedSize = this.#fillParent
            ? Vector2.infinity
            : this.#shrink
                ? undefined
                : iter(children).map(child => {
                    const position = this.#childrenPositions.get(child).get();
                    const {minSize, requestedSize} = this.getChildSizeRequest(child);
                    return position.add(requestedSize ?? minSize);
                }).reduce(max, Vector2.zero);

        return {minSize, requestedSize};
    }

    protected getChildrenSizes(): ReadonlyMap<symbol, Vector2> {
        const children = this.getChildren();
        const size = this.size;

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
