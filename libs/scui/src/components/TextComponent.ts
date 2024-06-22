import {Component, SizeRequest} from "../lib";
import {CanvasFrameContext} from "@experiment-libs/canvas";
import {clear, measureText, text} from "@experiment-libs/imui";
import {Vector2} from "@experiment-libs/utils";

export default class TextComponent extends Component {
    #font = this.createLinkedReference("16px sans-serif");
    #text = this.createLinkedReference("Default Text");

    #fill = this.createLinkedReference("black", {
        triggers: {
            resize: false,
            childPositions: false,
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

    static createWithText(text: string) {
        const component = new TextComponent();
        component.text = text;
        return component;
    }

    protected getChildLimit(): number {
        return 0;
    }

    protected render(ctx: CanvasFrameContext) {
        clear(ctx, Vector2.zero, this.size);

        text(ctx, Vector2.zero, this.text, {
            font: this.font,
            align: "left",
            fill: this.fill
        });
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        const textSize = measureText(ctx, this.text || "o", {
            font: this.font
        });

        return {
            minSize: new Vector2(textSize.width, textSize.actualBoundingBoxAscent + textSize.actualBoundingBoxDescent)
        };
    }
}
