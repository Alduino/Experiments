import Component from "../lib/Component";
import {CanvasFrameContext} from "../../../canvas-setup";
import SizeRequest from "../lib/SizeRequest";
import {clear, measureText, text} from "../../../imgui";
import Vector2 from "../../../Vector2";

export default class TextComponent extends Component {
    #font = this.createLinkedReference("16px sans-serif");
    #text = this.createLinkedReference("Default Text");

    #fill = this.createLinkedReference("black", {
        triggers: {
            resize: false,
            render: true
        }
    });

    get font() {
        return this.#font.get();
    }

    set font(value) {
        this.#font.set(value);
    }

    get text() {
        return this.#text.get();
    }

    set text(value) {
        this.#text.set(value);
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
        clear(ctx, Vector2.zero, this.getSize());

        text(ctx, Vector2.zero, this.text, {
            font: this.font,
            align: "left",
            fill: this.fill
        });
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        const textSize = measureText(ctx, this.text, {
            font: this.font
        });

        return {
            minSize: new Vector2(textSize.width, textSize.actualBoundingBoxAscent + textSize.actualBoundingBoxDescent)
        };
    }
}
