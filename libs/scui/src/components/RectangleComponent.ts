import {Component, SizeRequest} from "../lib";
import {Vector2} from "@experiment-libs/utils";
import {CanvasFrameContext} from "@experiment-libs/canvas";
import {rect} from "@experiment-libs/imui";

export default class RectangleComponent extends Component {
    #minSize = this.createLinkedReference(new Vector2(16, 16));
    #requestedSize = this.createLinkedReference(new Vector2(Infinity, Infinity));

    #fill = this.createLinkedReference("black", {
        triggers: {
            resize: false,
            childPositions: false,
            render: true
        }
    });

    #borderWidth = this.createLinkedReference(0, {
        triggers: {
            resize: false,
            childPositions: false,
            render: true
        }
    });

    #borderColour = this.createLinkedReference("black", {
        triggers: {
            resize: false,
            childPositions: false,
            render: true
        }
    });

    get minSize() {
        return this.#minSize.get();
    }

    set minSize(value) {
        this.#minSize.set(value);
    }

    get requestedSize() {
        return this.#requestedSize.get();
    }

    set requestedSize(value) {
        this.#requestedSize.set(value);
    }

    get fill() {
        return this.#fill.get();
    }

    set fill(value) {
        this.#fill.set(value);
    }

    get borderWidth() {
        return this.#borderWidth.get();
    }

    set borderWidth(value) {
        this.#borderWidth.set(value);
    }

    get borderColour() {
        return this.#borderColour.get();
    }

    set borderColour(value) {
        this.#borderColour.set(value);
    }

    protected getChildLimit(): number {
        return 0;
    }

    protected render(ctx: CanvasFrameContext) {
        rect(ctx, Vector2.zero, this.size, {
            fill: this.fill
        });
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        return {
            minSize: this.minSize,
            requestedSize: this.requestedSize.isNaV ? undefined : this.requestedSize
        };
    }
}
