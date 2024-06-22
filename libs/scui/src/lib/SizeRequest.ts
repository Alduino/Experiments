import {Vector2} from "@experiment-libs/utils";

export default interface SizeRequest {
    /**
     * The size the component must not be smaller than.
     * If no minimum size, use zero, as that's what no min size actually means.
     */
    minSize: Vector2;

    /**
     * The size that the component wants to be, if it has one.
     */
    requestedSize?: Vector2;
}
