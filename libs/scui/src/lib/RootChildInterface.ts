import {Vector2} from "@experiment-libs/utils";
import Component from "./Component";

/**
 * An interface for the root component to interact with its child.
 */
export interface RootChildInterface {
    /**
     * Forces the child to update its size.
     */
    setChildSize(size: Vector2): void;

    /**
     * Gets the child component's canvas image source.
     * This is where everything gets drawn to.
     */
    getImageSource(): CanvasImageSource;

    /**
     * Renders the component tree.
     */
    renderTree(): void;

    /**
     * Sets the global position of the child.
     * This does not change any rendering behaviour—only for debugging.
     */
    setPosition(position: Vector2): void;

    /**
     * Gets the leaf component under the given position, based on the global position from `setPosition`.
     */
    getComponentUnderPosition(position: Vector2): Component | null;

    /**
     * Returns the name the child uses to identify itself.
     */
    getFullDisplayName(): string;
}
