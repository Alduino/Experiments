import Component from "../lib/Component";
import Vector2 from "../../../Vector2";
import {CanvasFrameContext} from "../../../canvas-setup";
import {rect} from "../../../imgui";
import SizeRequest from "../lib/SizeRequest";

export default class RectangleComponent extends Component {
    #size = this.createLinkedReference(new Vector2(16, 16));

    #fill = this.createLinkedReference("black", {
        triggers: {
            resize: false,
            render: true
        }
    });

    get size() {
        return this.#size.get();
    }

    set size(value) {
        this.#size.set(value);
    }

    get fill() {
        return this.#fill.get();
    }

    set fill(value) {
        this.#fill.set(value);
    }

    protected getChildLimit(): number {
        return 0;
    }

    protected render(ctx: CanvasFrameContext) {
        rect(ctx, Vector2.zero, this.getSize(), {
            fill: this.fill
        });
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        return {
            minSize: Vector2.one,
            requestedSize: this.size
        };
    }
}
