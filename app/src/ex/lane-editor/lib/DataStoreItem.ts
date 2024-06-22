import {AnyDataStoreKey} from "./DataStore";
import {CanvasFrameContext} from "../../../lib/canvas-setup";

export interface DataStoreItem {
    readonly id: AnyDataStoreKey;
    highlight(ctx: CanvasFrameContext): void;
}
