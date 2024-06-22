import Component, {RootChildInterface} from "./Component";
import SizeRequest from "./SizeRequest";
import Batch from "../../Batch";
import Vector2 from "../../../Vector2";

export default class RootComponent {
    #batch = new Batch();
    #maxSize = Vector2.notAVector;
    #childInterface: RootChildInterface;

    /**
     * Indicates to the child its position. Doesn't affect where the child is put when rendered.
     */
    setDrawnPosition(position: Vector2) {
        this.#childInterface.setPosition(position);
    }

    /**
     * Sets the child of the root component. Calling this method more than once causes undefined behaviour.
     */
    setChild(child: Component) {
        const updateChildSizeRequestKey = Symbol();
        let lastChildSizeRequest: SizeRequest | null = null;

        this.#childInterface = Component.setupRoot(child, {
            getBatch: () => this.#batch,
            updateChildSizeRequest: (_, newSizeRequest: SizeRequest) => {
                lastChildSizeRequest = newSizeRequest;

                this.#batch.add(updateChildSizeRequestKey, () => {
                    const requestedSize = lastChildSizeRequest.requestedSize &&
                        Vector2.min(lastChildSizeRequest.requestedSize, this.#maxSize);
                    this.#childInterface.setChildSize(requestedSize ?? lastChildSizeRequest.minSize);
                });
            },
            getChildName: () => {
                return `1.${this.#childInterface.getFullDisplayName()}`;
            },
            getPath() {
                return "~";
            }
        });
    }

    /**
     * Returns an image that you can draw to a canvas.
     */
    getImageSource() {
        return this.#childInterface.getImageSource();
    }

    /**
     * Runs any waiting updates.
     */
    handleBatchedUpdates() {
        this.#batch.trigger();
    }

    /**
     * Renders anything in the component tree that needs it.
     * Should be called just before you draw to the screen.
     */
    render() {
        this.#childInterface.renderTree();
    }

    getComponentUnderPosition(position: Vector2) {
        return this.#childInterface.getComponentUnderPosition(position);
    }

    setSize(size: Vector2) {
        this.#maxSize = size;

        if (this.#childInterface) {
            this.#childInterface.setChildSize(size);
        }
    }
}
