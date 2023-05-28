import Component from "./Component";
import SizeRequest from "./SizeRequest";
import Batch from "../../Batch";

export default interface ParentInterface {
    updateChildSizeRequest(child: Component, newSizeRequest: SizeRequest): void;
    getChildName(child: Component): string;
    getPath(): string;
    getBatch(): Batch;
}
