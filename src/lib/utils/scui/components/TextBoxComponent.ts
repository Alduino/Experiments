import Component from "../lib/Component";
import InteractiveCanvas, {
    CanvasFrameContext,
    Collider,
    CommonAwaiterOptions,
    CoroutineAwait,
    CoroutineGeneratorFunction,
    CoroutineManager,
    FocusTarget,
    RectangleCollider,
    waitUntil
} from "../../../canvas-setup";
import {Getter, ref, Reference, Setter} from "../../ref";
import Vector2 from "../../../Vector2";
import SizeRequest from "../lib/SizeRequest";
import {clear, draw, path, rect, RectangleRadii, roundedRectangle} from "../../../imgui";
import AbsoluteComponent from "./AbsoluteComponent";
import SingleEventEmitter from "../../SingleEventEmitter";
import {Font, Glyph, GlyphRun} from "fontkit";
import {getDefaultFont} from "../../font";
import iter from "itiriri";

const WORD_BOUNDARY_REGEX = /\b(?=\S+)/g;

function getLastWordBoundary(source: string) {
    if (source.length === 0) return 0;

    const matches = source.matchAll(WORD_BOUNDARY_REGEX);
    const lastMatch = iter(matches).last();
    if (!lastMatch) return 0;

    return lastMatch.index;
}

function getFirstWordBoundary(source: string) {
    if (source.length === 0) return 0;

    const matches = source.matchAll(WORD_BOUNDARY_REGEX);
    const firstMatch = iter(matches).filter(match => match.index > 0).first();
    if (!firstMatch) return source.length;

    return firstMatch.index;
}

function isWordBoundary(source: string, index: number) {
    if (index === 0) return false;
    if (index === source.length) return false;

    const testText = source.substring(index - 1, index + 1);
    const matches = testText.matchAll(WORD_BOUNDARY_REGEX);
    const firstMatch = iter(matches).filter(match => match.index > 0).first();

    return firstMatch?.index === 1;
}

const enum KeyPressedRepeatingState {
    waiting,
    delay,
    interval
}

interface KeyPressedRepeatingOptions extends CommonAwaiterOptions {
    repeatDelay?: number;
    repeatInterval?: number;
    keyBlocklist?: readonly string[];
}

function createKeyPressedRepeating(abortedRef: Setter<boolean>, keyRef: Reference<string | undefined>, options: KeyPressedRepeatingOptions = {}): CoroutineGeneratorFunction {
    const {
        repeatDelay = 300,
        repeatInterval = 30,
        keyBlocklist = [],
        ...awaiterOptions
    } = options;

    let state: KeyPressedRepeatingState = KeyPressedRepeatingState.waiting;

    function nextOrCancel(waiter: CoroutineAwait<void>, nextState: KeyPressedRepeatingState): CoroutineGeneratorFunction {
        return function* handleNextOrCancel() {
            const testKey = keyRef.get() ?? "NONE";

            const {data, ctx} = yield waitUntil.one([
                waitUntil.anyKeyPressed({ignore: keyBlocklist}),
                waitUntil.keyReleased(testKey),
                waiter
            ]);

            if (data === 1 || !ctx.keyDown.get(testKey)) {
                abortedRef.set(true);
                state = KeyPressedRepeatingState.waiting;
            } else if (data === 0) {
                keyRef.set(ctx.keyPressed.getActive()[0]);
                state = KeyPressedRepeatingState.delay;
            } else {
                abortedRef.set(false);
                state = nextState;
            }
        };
    }

    return function* handleKeyPressedRepeating() {
        switch (state) {
            case KeyPressedRepeatingState.waiting:
                const {ctx} = yield waitUntil.anyKeyPressed(awaiterOptions);
                const pressedKey = ctx.keyPressed.getActive().find(key => !keyBlocklist.includes(key));

                if (pressedKey) {
                    state = KeyPressedRepeatingState.delay;
                    keyRef.set(pressedKey);
                    abortedRef.set(false);
                } else {
                    keyRef.set(undefined);
                    abortedRef.set(true);
                }

                break;
            case KeyPressedRepeatingState.delay:
                yield nextOrCancel(waitUntil.delay(repeatDelay), KeyPressedRepeatingState.interval);
                break;
            case KeyPressedRepeatingState.interval:
                yield nextOrCancel(waitUntil.delay(repeatInterval), KeyPressedRepeatingState.interval);
                break;
        }
    }
}

interface EditorInterface {
    collider: Getter<Collider>;

    setFocusState(focused: boolean): void;
}

interface SelectionBlockInterface {
    getGlyphPosition(index: number): number;
}

class CaretComponent extends Component {
    readonly #visible = this.createLinkedReference(false, {
        triggers: {
            render: true,
            resize: false,
            childPositions: false
        }
    });

    #updateTimeout: NodeJS.Timeout | null = null;
    #flashInterval: NodeJS.Timeout | null = null;

    constructor() {
        super();
    }

    /**
     * Keeps the caret visible for a few hundred milliseconds.
     */
    handleUpdated() {
        clearTimeout(this.#updateTimeout);
        clearInterval(this.#flashInterval);

        this.#visible.set(true);

        this.#updateTimeout = setTimeout(() => {
            this.#startFlashing();
        }, 500);
    }

    setEnabled(enabled: boolean) {
        if (enabled) {
            this.handleUpdated();
        } else {
            clearTimeout(this.#updateTimeout);
            clearInterval(this.#flashInterval);
            this.#visible.set(false);
        }
    }

    protected render(ctx: CanvasFrameContext): void {
        clear(ctx);

        if (!this.#visible.get()) return;

        rect(ctx, Vector2.zero, this.size, {
            fill: "black"
        });
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        return {
            minSize: new Vector2(1, 0),
            requestedSize: new Vector2(1, Infinity)
        }
    }

    #startFlashing() {
        clearInterval(this.#flashInterval);
        clearTimeout(this.#updateTimeout);

        this.#flashInterval = setInterval(() => {
            const oldValue = this.#visible.get();
            this.#visible.set(!oldValue);
        }, 250);
    }
}

interface Selection {
    start: number;
    end: number;
    caret: "start" | "end";
}

class SelectionBlockComponent extends Component {
    readonly #selectionBlockInterface: SelectionBlockInterface;

    readonly #selection = this.createLinkedReference<Selection | null>(null, {
        triggers: {
            render: false,
            resize: false,
            childPositions: false
        }
    });

    readonly #selectionOffsets = this.createLinkedReference<Selection | null>(null, {
        triggers: {
            render: true,
            resize: false,
            childPositions: false
        }
    });

    readonly #textOffset = this.createLinkedReference(0, {
        triggers: {
            render: true,
            resize: false,
            childPositions: false
        }
    });

    constructor(selectionBlockInterface: SelectionBlockInterface) {
        super();

        this.#selectionBlockInterface = selectionBlockInterface;

        this.#selection.changedEvent.listen(() => this.#handleSelectionChanged());
    }

    setSelection(start: number, end: number, caret: "start" | "end") {
        this.#selection.set({start, end, caret});
    }

    clearSelection() {
        this.#selection.set(null);
    }

    setTextOffset(offset: number) {
        this.#textOffset.set(Math.round(offset));
    }

    protected render(ctx: CanvasFrameContext): void {
        clear(ctx);

        const offsets = this.#selectionOffsets.get();
        if (offsets === null) return;

        const {start: startOffset, end: endOffset, caret} = offsets;
        const offsetStartOffset = startOffset - this.#textOffset.get();
        const offsetEndOffset = endOffset - this.#textOffset.get();

        const cornerRadius = 3;

        const radii: RectangleRadii = {
            topLeft: caret === "end" ? cornerRadius : 0,
            bottomLeft: caret === "end" ? cornerRadius : 0,
            topRight: caret === "start" ? cornerRadius : 0,
            bottomRight: caret === "start" ? cornerRadius : 0,
        };

        roundedRectangle(ctx, new Vector2(offsetStartOffset, 0), new Vector2(offsetEndOffset, this.size.y), radii, {
            fill: "#1375bb"
        });
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        return {minSize: new Vector2(1, 1), requestedSize: new Vector2(Infinity, Infinity)};
    }

    protected getChildLimit(): number {
        return 0;
    }

    #handleSelectionChanged() {
        const selectionIndexes = this.#selection.get();

        if (selectionIndexes === null) {
            this.#selectionOffsets.set(null);
        } else {
            const {start: startIndex, end: endIndex, caret} = selectionIndexes;

            const startOffset = Math.round(this.#selectionBlockInterface.getGlyphPosition(startIndex));
            const endOffset = Math.round(this.#selectionBlockInterface.getGlyphPosition(endIndex));

            this.#selectionOffsets.set({
                start: startOffset,
                end: endOffset,
                caret
            });
        }
    }
}

class EditorTextComponent extends Component {
    readonly #fontFamily = this.createLinkedReference<Font>(getDefaultFont());

    readonly #fontSize = this.createLinkedReference(16);

    readonly #text = this.createLinkedReference("", {
        triggers: {
            render: true,
            resize: false,
            childPositions: false
        }
    });

    readonly #fill = this.createLinkedReference("black", {
        triggers: {
            childPositions: false,
            resize: false,
            render: true
        }
    });

    readonly #selection = this.createLinkedReference<[number, number] | null>(null, {
        triggers: {
            render: true,
            resize: false,
            childPositions: false
        }
    });

    readonly #glyphs = this.createLinkedReference<GlyphRun | null>(null, {
        triggers: {
            render: true,
            resize: false,
            childPositions: false
        }
    });

    readonly #textOffset = this.createLinkedReference(0, {
        triggers: {
            render: true,
            resize: false,
            childPositions: false
        }
    });

    constructor() {
        super();

        this.#fontFamily.changedEvent.listen(() => this.#calculateLayout());
        this.#text.changedEvent.listen(() => this.#calculateLayout());
    }

    get fontFamily() {
        return this.#fontFamily.get();
    }

    set fontFamily(value) {
        this.#fontFamily.set(value);
    }

    get fontSize() {
        return this.#fontSize.get();
    }

    set fontSize(value) {
        this.#fontSize.set(value);
    }

    get text() {
        return this.#text.get();
    }

    set text(value) {
        this.#text.set(value);
    }

    get #spaceGlyph() {
        return this.#getCharGlyph(" ");
    }

    get #spaceHighlightGlyph() {
        return this.#getCharGlyph("·");
    }

    setSelection(start: number, end: number) {
        this.#selection.set([start, end]);
    }

    clearSelection() {
        this.#selection.set(null);
    }

    calculateGlyphPosition(index: number) {
        const glyphs = this.#glyphs.get();
        if (!glyphs) return 0;

        if (index > glyphs.positions.length) {
            throw new Error("Glyph position index is too high");
        }

        let offset = 0;

        for (let i = 0; i < index; i++) {
            offset += this.#unitsToPx(glyphs.positions[i].xAdvance);
        }

        return offset;
    }

    getIndexForHit(hitX: number) {
        hitX -= this.#textOffset.get();

        const glyphs = this.#glyphs.get();
        if (!glyphs) return 0;

        for (let i = 0; i < glyphs.positions.length; i++) {
            const glyph = glyphs.positions[i];
            const width = this.#unitsToPx(glyph.xAdvance);
            if (hitX < width / 2) return i;
            if (hitX < width) return i + 1;
            hitX -= width;
        }

        return glyphs.positions.length;
    }

    setTextOffset(offset: number) {
        this.#textOffset.set(Math.round(offset));
    }

    getTextWidth() {
        const glyphs = this.#glyphs.get();
        if (!glyphs) return 0;

        return this.#unitsToPx(glyphs.advanceWidth);
    }

    protected render(ctx: CanvasFrameContext): void {
        clear(ctx);

        const glyphs = this.#glyphs.get();
        if (!glyphs) return;

        ctx.renderer.fillStyle = this.#fill.get();

        const glyphRun = this.#glyphs.get();
        const [selectionStart, selectionEnd] = this.#selection.get() ?? [0, 0];

        const specialGlyphs: { glyph: Glyph, offset: number }[] = [];
        const selectedGlyphs: { glyph: Glyph, offset: number }[] = [];

        const scale = this.#unitsToPx(1);
        let offset = this.#textOffset.get();

        path(ctx, () => {
            for (let i = 0; i < glyphRun.glyphs.length; i++) {
                const glyph = glyphRun.glyphs[i];
                const glyphWidth = this.#unitsToPx(glyph.advanceWidth);

                if (offset + glyphWidth > 0 && offset < this.size.x) {
                    if (i >= selectionStart && i < selectionEnd) {
                        selectedGlyphs.push({
                            glyph: glyph,
                            offset
                        });
                    } else if (glyph.id === this.#spaceGlyph.id) {
                        specialGlyphs.push({
                            glyph: this.#spaceHighlightGlyph,
                            offset
                        });
                    } else {
                        ctx.renderer.save();
                        ctx.renderer.translate(Math.round(offset), this.fontSize);
                        ctx.renderer.scale(scale, scale * -1);

                        const pathFn = glyph.path.toFunction();
                        pathFn(ctx.renderer);

                        ctx.renderer.restore();
                    }
                }

                offset += glyphWidth;
            }
        });

        draw(ctx, {
            fill: "black"
        });

        path(ctx, () => {
            for (const {glyph, offset} of specialGlyphs) {
                ctx.renderer.save();
                ctx.renderer.translate(Math.round(offset), this.fontSize);
                ctx.renderer.scale(scale, scale * -1);

                const pathFn = glyph.path.toFunction();
                pathFn(ctx.renderer);

                ctx.renderer.restore();
            }
        });

        draw(ctx, {
            fill: "grey"
        });

        path(ctx, () => {
            for (const {glyph, offset} of selectedGlyphs) {
                ctx.renderer.save();
                ctx.renderer.translate(Math.round(offset), this.fontSize);
                ctx.renderer.scale(scale, scale * -1);

                const pathFn = glyph.path.toFunction();
                pathFn(ctx.renderer);

                ctx.renderer.restore();
            }
        });

        draw(ctx, {
            fill: "white"
        });
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        const height = this.#unitsToPx(this.fontFamily.bbox.maxY - this.fontFamily.bbox.minY);

        return {
            minSize: new Vector2(1, height),
            requestedSize: new Vector2(Infinity, height)
        };
    }

    protected getChildLimit(): number {
        return 0;
    }

    #getCharGlyph(char: string) {
        return this.fontFamily.glyphForCodePoint(char.codePointAt(0));
    }

    #unitsToPx(units: number) {
        return (units / this.fontFamily.unitsPerEm) * this.fontSize;
    }

    #calculateLayout() {
        const run = this.fontFamily.layout(this.text, ["kern"]);
        this.#glyphs.set(run);
    }
}

const CONTROL_MODIFIER_KEYS = [
    "ControlLeft",
    "ControlRight",
    "ShiftLeft",
    "AltLeft",
    "AltRight",
    "CapsLock"
];

const IGNORED_KEYS = [
    "Tab",
    "OS",
    "NumLock",
    "Enter",
    "Home",
    "End",
    "Insert",
    "PageUp",
    "PageDown",
    ...Array.from({length: 24}).map((_, idx) => "F" + (idx + 1))
];

class TextBoxEditorComponent extends Component {
    readonly #editorInterface: EditorInterface;
    readonly #absoluteComponent: AbsoluteComponent;
    readonly #textComponent: EditorTextComponent;
    readonly #caretComponent: CaretComponent;
    readonly #selectionBlockComponent: SelectionBlockComponent;
    readonly #canvas: InteractiveCanvas;
    readonly #coroutineManager: CoroutineManager;
    readonly #focusTarget: FocusTarget;

    #controlModifierActive = false;
    #shiftModifierActive = false;

    readonly #caretPosition = this.createLinkedReference(0, {
        triggers: {
            childPositions: false,
            resize: false,
            render: false
        }
    });

    readonly #selectionEnd = this.createLinkedReference<number | null>(null, {
        triggers: {
            childPositions: false,
            resize: false,
            render: false
        }
    });

    readonly #textPxOffset = this.createLinkedReference(0, {
        triggers: {
            childPositions: true,
            render: false,
            resize: false
        }
    });

    readonly #focusChangedEvent = new SingleEventEmitter<[boolean]>();

    private constructor(canvas, editorInterface: EditorInterface, absoluteComponent: AbsoluteComponent, textComponent: EditorTextComponent, caretComponent: CaretComponent, selectionBlockComponent: SelectionBlockComponent) {
        super();

        this.#editorInterface = editorInterface;
        this.#absoluteComponent = absoluteComponent;
        this.#textComponent = textComponent;
        this.#caretComponent = caretComponent;
        this.#selectionBlockComponent = selectionBlockComponent;

        this.#canvas = canvas;
        this.#coroutineManager = canvas.getCoroutineManager();

        this.#focusTarget = this.#coroutineManager.createFocusTarget({require: true, displayName: "TextBoxEditor"});

        this.#focusChangedEvent.listen(focused => this.#handleFocusChanged(focused));
        this.#caretPosition.changedEvent.listen(() => this.#handleCaretPositionChanged());
        this.#selectionEnd.changedEvent.listen(() => this.#handleSelectionEndChanged());

        this.initialisedEvent.listen(() => this.#handleInitialised());
    }

    get text() {
        return this.#textComponent.text;
    }

    set text(text) {
        this.#textComponent.text = text;
    }

    static create(canvas: InteractiveCanvas, editorInterface: EditorInterface): TextBoxEditorComponent {
        const absoluteComponent = new AbsoluteComponent();
        const caretComponent = new CaretComponent();
        const textComponent = new EditorTextComponent();

        const selectionBlockInterface: SelectionBlockInterface = {
            getGlyphPosition: index => textComponent.calculateGlyphPosition(index)
        };

        const selectionBlockComponent = new SelectionBlockComponent(selectionBlockInterface);

        absoluteComponent.addChildren(selectionBlockComponent, textComponent, caretComponent);

        absoluteComponent.setChildPosition(textComponent, Vector2.zero);
        absoluteComponent.setChildPosition(caretComponent, Vector2.zero);
        absoluteComponent.setChildPosition(selectionBlockComponent, Vector2.zero);

        const editor = new TextBoxEditorComponent(canvas, editorInterface, absoluteComponent, textComponent, caretComponent, selectionBlockComponent);
        editor.addChild(absoluteComponent);

        return editor;
    }

    protected render(ctx: CanvasFrameContext): void {
        this.renderChildren(ctx);
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        const absoluteComponentId = this.getChildComponentIdentifier(this.#absoluteComponent);
        const {minSize} = this.getChildSizeRequest(absoluteComponentId);

        return {
            minSize: new Vector2(1, minSize.y),
            requestedSize: new Vector2(Infinity, minSize.y)
        };
    }

    protected getChildLimit(): number {
        // prevents external code from adding any children
        return 1;
    }

    protected getChildrenSizes(): ReadonlyMap<symbol, Vector2> {
        const absoluteComponentId = this.getChildComponentIdentifier(this.#absoluteComponent);
        const {minSize} = this.getChildSizeRequest(absoluteComponentId);

        return new Map([[
            absoluteComponentId,
            new Vector2(this.size.x, minSize.y)
        ]]);
    }

    protected getChildPosition(identifier: symbol): Vector2 {
        return Vector2.zero;
    }

    #handleCaretPositionChanged() {
        const glyphPosition = this.#textComponent.calculateGlyphPosition(this.#caretPosition.get());
        const width = this.#absoluteComponent.size.x - this.#caretComponent.size.x;

        if (glyphPosition < this.#textPxOffset.get()) {
            this.#textPxOffset.set(glyphPosition);
        } else if (glyphPosition > this.#textPxOffset.get() + width) {
            this.#textPxOffset.set(glyphPosition - width);
        }

        if (this.#textPxOffset.get() + width > this.#textComponent.getTextWidth()) {
            this.#textPxOffset.set(this.#textComponent.getTextWidth() - width);
        }

        if (this.#textPxOffset.get() < 0) {
            this.#textPxOffset.set(0);
        }

        this.#absoluteComponent.setChildPosition(this.#caretComponent, new Vector2(glyphPosition - this.#textPxOffset.get(), 0));
        this.#textComponent.setTextOffset(-this.#textPxOffset.get());
        this.#selectionBlockComponent.setTextOffset(Math.round(this.#textPxOffset.get()));

        this.#handleSelectionEndChanged();
    }

    #handleSelectionEndChanged() {
        const caretPosition = this.#caretPosition.get();
        const selectionEnd = this.#selectionEnd.get();

        if (selectionEnd === null || selectionEnd === caretPosition) {
            this.#textComponent.clearSelection();
            this.#selectionBlockComponent.clearSelection();
        } else {
            const selectionStartIndex = Math.min(caretPosition, selectionEnd);
            const selectionEndIndex = Math.max(caretPosition, selectionEnd);
            this.#textComponent.setSelection(selectionStartIndex, selectionEndIndex);
            this.#selectionBlockComponent.setSelection(selectionStartIndex, selectionEndIndex, caretPosition < selectionEnd ? "start" : "end");
        }
    }

    #handleInitialised() {
        this.#startMouseCaretInteraction();
        this.#startFocusCoroutine();
        this.#startKeyboardCoroutine();
        this.#startKeyboardModifiersCoroutine();
    }

    #startKeyboardModifiersCoroutine() {
        const setControlModifierActive = (value: boolean) => this.#controlModifierActive = value;
        const setShiftModifierActive = (value: boolean) => this.#shiftModifierActive = value;

        const focusTarget = this.#focusTarget;

        this.#coroutineManager.startCoroutine(function* handleControlKeyModifier() {
            while (true) {
                yield waitUntil.keyPressed(["ControlLeft", "ControlRight"], {focusTarget});
                setControlModifierActive(true);
                yield waitUntil.keyReleased(["ControlLeft", "ControlRight"], {});
                setControlModifierActive(false);
            }
        });

        this.#coroutineManager.startCoroutine(function* handleShiftKeyModifier() {
            while (true) {
                yield waitUntil.keyPressed(["ShiftLeft", "ShiftRight"], {focusTarget});
                setShiftModifierActive(true);
                yield waitUntil.keyReleased(["ShiftLeft", "ShiftRight"], {});
                setShiftModifierActive(false);
            }
        });
    }

    #startKeyboardCoroutine() {
        const focusTarget = this.#focusTarget;
        const cm = this.#coroutineManager;

        const setText = (text: string) => this.text = text;
        const getText = () => this.text;
        const updateCaret = () => this.#caretComponent.handleUpdated();
        const setCaretIndex = (index: number) => this.#setCaretIndexChecked(index);
        const getCaretIndex = () => this.#caretPosition.get();
        const setSelectionEnd = (index: number | null) => this.#selectionEnd.set(index);
        const getSelectionEnd = () => this.#selectionEnd.get();
        const getControlModifier = () => this.#controlModifierActive;
        const getShiftModifier = () => this.#shiftModifierActive;

        cm.startCoroutine(function* handleKeyboardInteraction() {
            const keyPressAborted = ref(false);
            const pressedKey = ref<string | undefined>(undefined);

            const keyPress = createKeyPressedRepeating(keyPressAborted, pressedKey, {
                keyBlocklist: CONTROL_MODIFIER_KEYS,
                focusTarget
            });

            function processKeyPress(code: string, key: string) {
                updateCaret();

                function deleteSelectedText() {
                    const caretIdx = getCaretIndex();
                    const selectionEnd = getSelectionEnd();
                    if (selectionEnd === null) return;

                    const min = Math.min(caretIdx, selectionEnd);
                    const max = Math.max(caretIdx, selectionEnd);

                    const text = getText();
                    setText(text.substring(0, min) + text.substring(max, text.length));

                    setSelectionEnd(null);
                    setCaretIndex(min);
                }

                if (key === "ArrowLeft") {
                    const hasShiftModifier = getShiftModifier();
                    const text = getText();
                    const caretIdx = getCaretIndex();

                    if (getSelectionEnd() === caretIdx) {
                        setSelectionEnd(null);
                    }

                    if (hasShiftModifier && getSelectionEnd() === null) {
                        setSelectionEnd(caretIdx);
                    }

                    if (!hasShiftModifier && getSelectionEnd() !== null) {
                        setCaretIndex(Math.min(caretIdx, getSelectionEnd()));
                        setSelectionEnd(null);
                        return;
                    }

                    if (caretIdx > 0) {
                        let newCaretIdx: number;

                        if (getControlModifier()) {
                            const textBeforeCaret = text.substring(0, caretIdx);
                            newCaretIdx = getLastWordBoundary(textBeforeCaret);
                        } else {
                            newCaretIdx = caretIdx - 1;
                        }

                        setCaretIndex(newCaretIdx);
                    }
                } else if (key === "ArrowRight") {
                    const hasShiftModifier = getShiftModifier();
                    const text = getText();
                    const caretIdx = getCaretIndex();

                    if (getSelectionEnd() === caretIdx) {
                        setSelectionEnd(null);
                    }

                    if (hasShiftModifier && getSelectionEnd() === null) {
                        setSelectionEnd(caretIdx);
                    }

                    if (!hasShiftModifier && getSelectionEnd() !== null) {
                        setCaretIndex(Math.max(caretIdx, getSelectionEnd()));
                        setSelectionEnd(null);
                        return;
                    }

                    if (caretIdx < text.length) {
                        let newCaretIdx: number;

                        if (getControlModifier()) {
                            const textAfterCaret = text.substring(caretIdx);
                            newCaretIdx = caretIdx + getFirstWordBoundary(textAfterCaret);
                        } else {
                            newCaretIdx = caretIdx + 1;
                        }

                        setCaretIndex(newCaretIdx);
                    }
                } else if (key === "ArrowUp") {
                    if (getShiftModifier()) {
                        setSelectionEnd(getSelectionEnd() ?? getCaretIndex());
                    } else {
                        setSelectionEnd(null);
                    }

                    setCaretIndex(0);
                } else if (key === "ArrowDown") {
                    if (getShiftModifier()) {
                        setSelectionEnd(getSelectionEnd() ?? getCaretIndex());
                    } else {
                        setSelectionEnd(null);
                    }

                    setCaretIndex(getText().length);
                } else if (key === "Escape") {
                    setSelectionEnd(null);
                } else if (getSelectionEnd() !== null && (key === "Backspace" || key === "Delete")) {
                    deleteSelectedText();
                } else if (key === "Backspace") {
                    const text = getText();
                    const caretIdx = getCaretIndex();

                    if (caretIdx > 0) {
                        if (getControlModifier()) {
                            const textBeforeCaret = text.substring(0, caretIdx);
                            const textAfterCaret = text.substring(caretIdx);
                            const cutLength = getLastWordBoundary(textBeforeCaret);
                            const cutText = textBeforeCaret.substring(0, cutLength);
                            setText(cutText + textAfterCaret);
                            setCaretIndex(cutText.length);
                        } else {
                            setText(text.substring(0, caretIdx - 1) + text.substring(caretIdx));
                            setCaretIndex(caretIdx - 1);
                        }
                    }
                } else if (key === "Delete") {
                    const text = getText();
                    const caretIdx = getCaretIndex();

                    if (caretIdx < text.length) {
                        if (getControlModifier()) {
                            const textBeforeCaret = text.substring(0, caretIdx);
                            const textAfterCaret = text.substring(caretIdx);
                            const cutLength = getFirstWordBoundary(textAfterCaret);
                            const cutText = textAfterCaret.substring(cutLength, textAfterCaret.length);
                            setText(textBeforeCaret + cutText);
                        } else {
                            setText(text.substring(0, caretIdx) + text.substring(caretIdx + 1));
                        }
                    }
                } else if (getControlModifier() && code === "KeyA") {
                    setCaretIndex(0);
                    setSelectionEnd(getText().length);
                } else if (getControlModifier() && (code === "KeyC" || code === "KeyX")) {
                    const caretIdx = getCaretIndex();
                    const selectionEnd = getSelectionEnd();

                    const min = Math.min(caretIdx, selectionEnd);
                    const max = Math.max(caretIdx, selectionEnd);

                    const selectedText = getText().substring(min, max);
                    navigator.clipboard.writeText(selectedText);

                    if (code === "KeyX") deleteSelectedText();
                } else if (getControlModifier() && code === "KeyV") {
                    // TODO: disable while pasting

                    if (navigator.clipboard.readText) {
                        navigator.clipboard.readText().then(clipboardText => {
                            deleteSelectedText();

                            const caretIdx = getCaretIndex();
                            const text = getText();

                            const beforeText = text.substring(0, caretIdx);
                            const afterText = text.substring(caretIdx);

                            setText(beforeText + clipboardText + afterText);
                            setCaretIndex(caretIdx + clipboardText.length);
                        });
                    } else {
                        console.warn("clipboard.readText is disabled. In Firefox, you can enable it by setting `dom.events.testing.asyncClipboard` in about:config.");
                    }
                } else if (!CONTROL_MODIFIER_KEYS.includes(code) && !IGNORED_KEYS.includes(key)) {
                    if (getSelectionEnd() !== null) {
                        deleteSelectedText();
                    }

                    const text = getText();
                    const caretIdx = getCaretIndex();
                    setText(text.substring(0, caretIdx) + key + text.substring(caretIdx));

                    setCaretIndex(getCaretIndex() + 1);
                }
            }

            while (true) {
                const {ctx} = yield keyPress;

                for (const code of ctx.keyPressed.getActive()) {
                    const key = ctx.keyPressed.getKeyValue(code);
                    processKeyPress(code, key);
                }

                if (keyPressAborted.get()) continue;

                if (ctx.keyPressed.getActive().length === 0) {
                    const code = pressedKey.get();
                    const key = ctx.keyDown.getKeyValue(code);
                    processKeyPress(code, key);
                }
            }
        });
    }

    #startMouseCaretInteraction() {
        const collider = this.#editorInterface.collider;
        const canvas = this.#canvas;
        const cm = this.#coroutineManager;
        const focusTarget = this.#focusTarget;
        const getText = () => this.text;
        const getGlobalPosition = () => this.getGlobalPosition();
        const setCaretFromHit = (pos: Vector2) => this.#setCaretFromHit(pos);
        const setCaretIndex = (index: number) => this.#caretPosition.set(index);
        const getCaretIndex = () => this.#caretPosition.get();
        const updateCaret = () => this.#caretComponent.handleUpdated();
        const setSelectionEnd = (index: number | null) => this.#selectionEnd.set(index);

        cm.startCoroutine(function* handleMouseCaretInteraction() {
            let lastClickTime = -Infinity;

            let clickCount = 0, lastCaretIdx = -1;

            while (true) {
                let x = yield waitUntil.leftMousePressed({focusTarget, collider});
                const localPosition = x.ctx.mousePos.subtract(getGlobalPosition());

                const textIndex = setCaretFromHit(localPosition);
                setSelectionEnd(null);
                updateCaret();

                const popMouse = canvas.pushCursor("text");

                const {stop: stopSelectingText} = cm.startCoroutine(function* handleMouseTextSelection() {
                    while (true) {
                        const {ctx} = yield waitUntil.mouseMoved({focusTarget});
                        setSelectionEnd(textIndex);
                        setCaretFromHit(ctx.mousePos.subtract(getGlobalPosition()));
                        updateCaret();
                    }
                });

                const caretIdx = getCaretIndex();
                const clickTime = x.ctx.time;

                if (caretIdx === lastCaretIdx && clickTime - lastClickTime < 0.5) {
                    const text = getText();

                    if (clickCount % 2 === 0) {
                        // select the current word on double click, and any even clicks if the user clicks lots

                        const beforeText = text.substring(0, caretIdx);
                        const afterText = text.substring(caretIdx);

                        const wordStartIndex = caretIdx === 0 ? 0 : isWordBoundary(text, caretIdx) ? caretIdx : getLastWordBoundary(beforeText);
                        const wordEndIndex = caretIdx === text.length - caretIdx ? text.length : getFirstWordBoundary(afterText);

                        setSelectionEnd(wordStartIndex);
                        setCaretIndex(caretIdx + wordEndIndex);
                    } else {
                        // select the entire thing on triple click, and any odd clicks if the user clicks lots

                        setCaretIndex(0);
                        setSelectionEnd(text.length);
                    }

                    clickCount++;
                } else {
                    clickCount = 0;
                }

                lastClickTime = clickTime;
                lastCaretIdx = caretIdx;

                yield waitUntil.leftMouseReleased();
                popMouse();
                stopSelectingText();
            }
        });
    }

    #startFocusCoroutine() {
        const collider = this.#editorInterface.collider;
        const canvas = this.#canvas;
        const focusTarget = this.#focusTarget;
        const cm = this.#coroutineManager;
        const focusChangedEvent = this.#focusChangedEvent;

        cm.startCoroutine(function* handleFocusing() {
            while (true) {
                focusTarget.blur();

                yield waitUntil.mouseEntered(collider);
                focusTarget.focus();

                let popMouse = canvas.pushCursor("text");

                let x = yield waitUntil.one([
                    waitUntil.mouseExited(collider),
                    waitUntil.leftMousePressed({focusTarget})
                ]);

                if (x.data === 0) {
                    popMouse();
                    continue;
                }

                focusChangedEvent.emit(true);

                const {stop: stopHoverUpdates} = cm.startCoroutine(function* handleMouseHover() {
                    while (true) {
                        yield waitUntil.mouseExited(collider);
                        popMouse();
                        yield waitUntil.mouseEntered(collider, {focusTarget});
                        popMouse = canvas.pushCursor("text");
                    }
                });

                yield waitUntil.leftMousePressed({
                    collider,
                    invertCollider: true,
                    focusTarget
                });

                stopHoverUpdates();

                popMouse();
                focusChangedEvent.emit(false);
            }
        });
    }

    #handleFocusChanged(focused: boolean) {
        this.#caretComponent.setEnabled(focused);
        this.#editorInterface.setFocusState(focused);

        if (!focused) {
            this.#selectionEnd.set(null);
        }
    }

    #setCaretFromHit(pos: Vector2) {
        const textIndex = this.#textComponent.getIndexForHit(pos.x);
        this.#setCaretIndexChecked(textIndex);
        return textIndex;
    }

    #setCaretIndexChecked(index: number) {
        if (index < 0) index = 0;
        if (index > this.text.length) index = this.text.length;
        this.#caretPosition.set(index);
    }
}

export default class TextBoxComponent extends Component {
    readonly #paddingLeft = this.createLinkedReference(4);
    readonly #paddingRight = this.createLinkedReference(4);
    readonly #paddingTop = this.createLinkedReference(6);
    readonly #paddingBottom = this.createLinkedReference(6);
    readonly #width = this.createLinkedReference(300);

    readonly #focused = this.createLinkedReference(false, {
        triggers: {
            resize: false,
            render: true,
            childPositions: false
        }
    });

    readonly #canvas: InteractiveCanvas;

    readonly #collider = ref(new RectangleCollider(Vector2.zero, Vector2.zero));

    #isInitialised = false;
    #addEditorOnInit = true;

    constructor(canvas: InteractiveCanvas) {
        super();
        this.#canvas = canvas;

        this.initialisingEvent.listen(() => this.#handleInitialising());
        this.initialisedEvent.listen(() => this.#handleInitialised());
        this.globalPositionUpdatedEvent.listen(() => this.#updateCollider());
        this.resizedEvent.listen(() => this.#updateCollider())
    }

    get width() {
        return this.#width.get();
    }

    set width(value) {
        this.#width.set(value);
    }

    get paddingLeft() {
        return this.#paddingLeft.get();
    }

    set paddingLeft(value) {
        this.#paddingLeft.set(value);
    }

    get paddingRight() {
        return this.#paddingRight.get();
    }

    set paddingRight(value) {
        this.#paddingRight.set(value);
    }

    set paddingX(value) {
        this.#paddingLeft.set(value);
        this.#paddingRight.set(value);
    }

    get paddingTop() {
        return this.#paddingTop.get();
    }

    set paddingTop(value) {
        this.#paddingTop.set(value);
    }

    get paddingBottom() {
        return this.#paddingBottom.get();
    }

    set paddingBottom(value) {
        this.#paddingBottom.set(value);
    }

    set paddingY(value) {
        this.#paddingTop.set(value);
        this.#paddingBottom.set(value);
    }

    /**
     * Disables automatically setting the child to be the editor.
     * After calling this method, you must set the child yourself.
     * Note that you must put the return value of `getEditorComponent()` somewhere in the subtree.
     *
     * Usually, you set the children to a `FlexComponent`,
     * which can contain an icon at the start or end, and the editor in the middle.
     */
    useCustomChildren() {
        if (this.#isInitialised) {
            throw new Error("Cannot use custom children after component has been initialised");
        }

        this.#addEditorOnInit = false;
    }

    createEditorComponent(): Component {
        return TextBoxEditorComponent.create(this.#canvas, this.#createEditorInterface());
    }

    protected getComponentName(): string {
        return "TextBox";
    }

    protected getChildLimit(): number {
        return 1;
    }

    protected render(ctx: CanvasFrameContext): void {
        const focused = this.#focused.get();

        const rectInset = Vector2.one;

        clear(ctx);

        roundedRectangle(ctx, rectInset, this.size.subtract(rectInset.multiply(2)), 3, {
            fill: "white",
            thickness: focused ? 2 : 1,
            colour: focused ? "#2783c4" : "#666"
        });

        this.renderChildren(ctx, false);
    }

    protected getSizeRequest(ctx: CanvasFrameContext): SizeRequest {
        const child = this.getOnlyChild();
        const {minSize} = this.getChildSizeRequest(child);

        const innerSizeDiff = this.#getInnerSizeDiff();

        return {
            minSize: minSize.add(innerSizeDiff),
            requestedSize: new Vector2(this.width, minSize.y + innerSizeDiff.y)
        };
    }

    protected getChildrenSizes(): ReadonlyMap<symbol, Vector2> {
        const child = this.getOnlyChild();
        const size = this.getSize().subtract(this.#getInnerSizeDiff());

        const map = new Map<symbol, Vector2>();

        const {minSize, requestedSize} = this.getChildSizeRequest(child);

        if (!requestedSize) {
            map.set(child, minSize);
        } else {
            const childSize = Vector2.max(minSize, Vector2.min(size, requestedSize));
            map.set(child, childSize);
        }

        return map;
    }

    protected getChildPosition(identifier: symbol): Vector2 {
        return Vector2.one.add(new Vector2(this.paddingLeft, this.paddingTop));
    }

    #getInnerSizeDiff() {
        const vecOf2 = new Vector2(2, 2);
        const totalPadding = new Vector2(this.paddingLeft + this.paddingRight, this.paddingTop + this.paddingBottom);

        return vecOf2.add(totalPadding);
    }

    #handleInitialised() {
        this.#isInitialised = true;
    }

    #handleInitialising() {
        if (this.#addEditorOnInit) {
            const editor = this.createEditorComponent();
            this.addChild(editor);
        }
    }

    #createEditorInterface(): EditorInterface {
        return {
            collider: this.#collider,
            setFocusState: focused => this.#focused.set(focused)
        };
    }

    #updateCollider() {
        if (this.getGlobalPosition().isNaV || this.getSize().isNaV) return;
        const collider = new RectangleCollider(this.getGlobalPosition(), this.getGlobalPosition().add(this.getSize()));
        this.#collider.set(collider);
    }
}
