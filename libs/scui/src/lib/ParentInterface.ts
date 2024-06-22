import Component from "./Component";
import SizeRequest from "./SizeRequest";
import {Batch} from "@experiment-libs/utils";

/**
 * @internal
 *
 * Allows a child component to communicate with its parent, without exposing the parent's implementation.
 */
export default interface ParentInterface {
    /**
     * Resizes the child component to fit the given size request.
     * This method asynchronously updates this branch's transforms.
     */
    updateChildSizeRequest(newSizeRequest: SizeRequest): void;

    /**
     * Returns the name of this child component, as decided by the parent.
     */
    getChildName(): string;

    /**
     * Returns the path to the parent component.
     */
    getPath(): string;

    /**
     * Get the global batch object for this component tree.
     */
    getBatch(): Batch;
}
