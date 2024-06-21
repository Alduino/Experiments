import {CanvasFrameContext, CoroutineManager, InteractiveCanvas} from "@experiment-libs/canvas";
import {Component, SizeRequest} from "@experiment-libs/scui";
import {Vector2} from "@experiment-libs/utils";
import {circle} from "@experiment-libs/imui";

const DIAMETER = 80;

type HoleStatus = "empty" | "player1" | "player2";

export class HoleComponent extends Component {
    #status = this.createLinkedReference("empty" as HoleStatus, {
        triggers: {
            render: true,
            resize: false,
            childPositions: false
        }
    });

    setStatus(status: HoleStatus) {
        this.#status.set(status);
    }

    protected getChildLimit(): number {
        return 0;
    }

    protected render(ctx: CanvasFrameContext): void {
        circle(ctx, this.size.divide(2), DIAMETER / 2, {
            fill: this.#getFill()
        });
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        return {
            minSize: new Vector2(DIAMETER, DIAMETER)
        };
    }

    #getFill() {
        switch (this.#status.get()) {
            case "empty":
                return "#fff";
            case "player1":
                return "#ff3269";
            case "player2":
                return "#ffc037";
        }
    }
}
