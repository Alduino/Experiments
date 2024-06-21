import Component from "./Component";
import SizeRequest from "./SizeRequest";
import {Batch, Vector2} from "@experiment-libs/utils";
import {RootChildInterface} from "./RootChildInterface";

export default class RootComponent {
    #batch = new Batch();
    #maxSize = Vector2.notAVector;
    #childInterface: RootChildInterface | undefined;

    #getRequiredChildInterface() {
        if (!this.#childInterface) {
            throw new Error("No child has been set");
        }

        return this.#childInterface;
    }

    /**
     * Indicates to the child its position. Doesn't affect where the child is put when rendered.
     */
    setDrawnPosition(position: Vector2) {
        this.#getRequiredChildInterface().setPosition(position);
    }

    /**
     * Sets the child of the root component. Calling this method more than once causes undefined behaviour.
     */
    setChild(child: Component) {
        const updateChildSizeRequestKey = Symbol();

        this.#childInterface = Component.setupRoot(child, {
            getBatch: () => this.#batch,
            updateChildSizeRequest: (newSizeRequest: SizeRequest) => {
                this.#batch.add(updateChildSizeRequestKey, () => {
                    const requestedSize = newSizeRequest.requestedSize &&
                        Vector2.min(newSizeRequest.requestedSize, this.#maxSize);
                    this.#childInterface.setChildSize(requestedSize ?? newSizeRequest.minSize);
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
        return this.#getRequiredChildInterface().getImageSource();
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
     *
     * ## Before the First Render
     * 1. Call `setDrawnPosition()` with the position you will draw the root component at.
     * 2. Call `setSize()` with the size you want the root component to be.
     * 3. Call `handleBatchedUpdates()` at least once. From then on it can be called whenever you want (e.g. `requestIdleCallback`)
     */
    render() {
        this.#getRequiredChildInterface().renderTree();
    }

    getComponentUnderPosition(position: Vector2) {
        return this.#getRequiredChildInterface().getComponentUnderPosition(position);
    }

    setSize(size: Vector2) {
        this.#maxSize = size;

        if (this.#childInterface) {
            this.#childInterface.setChildSize(size);
        }
    }
}
