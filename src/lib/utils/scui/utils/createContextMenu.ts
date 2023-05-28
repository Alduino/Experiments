import InteractiveCanvas, {
    CoroutineGeneratorFunction,
    CoroutineManager
} from "../../../canvas-setup";
import Component from "../lib/Component";
import FlexComponent from "../components/FlexComponent";
import AbsoluteComponent from "../components/AbsoluteComponent";
import RectangleComponent from "../components/RectangleComponent";
import Vector2 from "../../../Vector2";
import PaddingComponent from "../components/PaddingComponent";
import TextComponent from "../components/TextComponent";

export interface ContextMenuOption {
    id: string;
    title: string;
    disabled?: boolean;

    onClick?(): void;
}

export interface ContextMenu {
    options: ContextMenuOption[];
}

export interface CreateContextMenuResult {
    component: Component;

    open(coroutineManager: CoroutineManager, mousePosition: Vector2): CoroutineGeneratorFunction;
}

export default function createContextMenu(canvas: InteractiveCanvas, menu: ContextMenu): CreateContextMenuResult {
    const backgroundContainer = new AbsoluteComponent({
        fillParent: true
    });

    backgroundContainer.displayName = "ContextMenu";

    const background = new RectangleComponent();

    background.minSize = new Vector2(64, 1);
    background.requestedSize = Vector2.notAVector;
    background.fill = "#eee";
    background.borderWidth = 1;
    background.borderColour = "#bbb";

    const flexContainer = new PaddingComponent();
    flexContainer.padding = 4;

    const flexRoot = new FlexComponent();
    flexContainer.addChild(flexRoot);

    flexRoot.resizedEvent.listen(() => {
        background.requestedSize = flexRoot.size;
    });

    background.opacity = 0;
    backgroundContainer.addChild(background);
    backgroundContainer.setChildPosition(background, Vector2.zero);

    flexContainer.opacity = 0;
    backgroundContainer.addChild(flexContainer);
    backgroundContainer.setChildPosition(flexContainer, Vector2.zero);

    for (const option of menu.options) {
        const optionContainer = new PaddingComponent();
        optionContainer.paddingX = 8;
        optionContainer.paddingY = 4;

        const optionFlex = new FlexComponent();

        const text = TextComponent.createWithText(option.title);
        optionFlex.addChild(text);

        optionContainer.addChild(optionFlex);

        flexRoot.addChild(optionContainer);
    }

    function open(cm: CoroutineManager, mousePos: Vector2) {
        const focusTarget = cm.createFocusTarget({
            displayName: "ContextMenu"
        });

        return function* handleContextMenu() {
            const contextMenuPosition = mousePos.add(4);
            backgroundContainer.setChildPosition(background, contextMenuPosition);
            backgroundContainer.setChildPosition(flexContainer, contextMenuPosition);
            background.opacity = 1;
            flexContainer.opacity = 1;

            focusTarget.focus();
        };
    }

    return {
        component: backgroundContainer,
        open
    };
}
