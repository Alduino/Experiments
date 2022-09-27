import InteractiveCanvas, {waitUntil} from "../../lib/canvas-setup";
import AbsoluteComponent from "../../lib/utils/scui/components/AbsoluteComponent";
import RootComponent from "../../lib/utils/scui/lib/RootComponent";
import Vector2 from "../../lib/Vector2";
import TextBoxComponent from "../../lib/utils/scui/components/TextBoxComponent";
import {clear, copyFrom} from "../../lib/imgui";
import {drawScuiInspector} from "../../lib/utils/scui/lib/debugger";
import {loadFont, setDefaultFont} from "../../lib/utils/font";
import interFontUrl from "@fontsource/inter/files/inter-all-400-normal.woff";
import TextComponent from "../../lib/utils/scui/components/TextComponent";

(async () => {
    setDefaultFont(await loadFont(interFontUrl));

    const canvas = new InteractiveCanvas("canvas");
    const cm = canvas.getCoroutineManager();

    const rootComponent = new RootComponent();

    const absolutePositioner = new AbsoluteComponent();
    rootComponent.setChild(absolutePositioner);

    const textboxComponent = new TextBoxComponent(canvas);
    absolutePositioner.addChild(textboxComponent);
    absolutePositioner.setChildPosition(textboxComponent, new Vector2(200, 200));

    const infoText = TextComponent.createWithText("Just a text box for now!");
    absolutePositioner.addChild(infoText);
    absolutePositioner.setChildPosition(infoText, new Vector2(210, 180));

    rootComponent.setDrawnPosition(Vector2.zero);
    rootComponent.setSize(canvas.size);

    let popInspectCursor: () => void | null = null;

    canvas.start(ctx => {
        rootComponent.setSize(canvas.size);
        rootComponent.handleBatchedUpdates();

        clear(ctx);

        rootComponent.render();
        const rootComponentImageSource = rootComponent.getImageSource();
        copyFrom(rootComponentImageSource, ctx);

        if (cm.isFocusGlobal() && ctx.keyDown.get("d")) {
            if (!popInspectCursor) {
                popInspectCursor = canvas.pushCursor("crosshair");
            }

            drawScuiInspector(ctx, rootComponent);
            canvas.pauseCoroutines = true;
        } else {
            popInspectCursor?.();
            popInspectCursor = null;

            canvas.pauseCoroutines = false;
        }

        canvas.drawDebug(ctx);
    });

    canvas.preventKeyDefault("Backspace", true);
    canvas.preventKeyDefault("Tab", true);
    canvas.preventKeyDefault("/", true);
    canvas.preventKeyDefault("'", true);

    cm.startCoroutine(function* testKeyboard() {
        while (true) {
            const {ctx} = yield waitUntil.anyKeyPressed();

            //console.log(ctx.keyPressed.getActive().join(", "));
        }
    });
})();
