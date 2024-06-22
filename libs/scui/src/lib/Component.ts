import {CanvasFrameContext, Collider, OffscreenCanvas, RectangleCollider} from "@experiment-libs/canvas";
import {
    Batch,
    deref,
    Getter,
    ref,
    Reference,
    SingleEventEmitter,
    SingleEventListener,
    Vector2
} from "@experiment-libs/utils";
import SizeRequest from "./SizeRequest";
import Association from "../Association";
import ParentInterface from "./ParentInterface";
import {GET_GLOBAL_BR, GET_GLOBAL_TL, GET_IMAGE_SOURCE, GET_NAME} from "./inspector-symbols";
import {clear, copyFrom} from "@experiment-libs/imui";
import {RootChildInterface} from "./RootChildInterface";
import iter from "itiriri";

export interface UpdateDependencyTriggers {
    /**
     * Renders the component when the value changes.
     * @default true
     */
    render: boolean;

    /**
     * Recalculates the component size when the value changes.
     * @default true
     */
    resize: boolean;

    /**
     * Recalculates the position of the component's children when the value changes.
     * @default true
     */
    childPositions: boolean;
}

interface InternalUpdateDependencyTriggers extends UpdateDependencyTriggers {
    _transform: boolean;
    _position: boolean;
    _resizedEvent: boolean;
}

export interface UpdateDependencyOptions<T> {
    checkEquality: CompareFn<T>;
    triggers: Partial<UpdateDependencyTriggers>;
}

interface InternalUpdateDependencyOptions<T> extends Omit<UpdateDependencyOptions<T>, "triggers"> {
    triggers: Partial<InternalUpdateDependencyTriggers>;
}

export interface LinkedReference<T> extends Reference<T> {
    changedEvent: SingleEventListener<[T]>;
}

export type CompareFn<in T> = (a: T, b: T) => boolean;
export type GetInitialMetadataFn<out T> = () => T;
export type ChildrenMetadataMap<T> = ReadonlyMap<symbol, T>;

const defaultCompareFn: CompareFn<unknown> = (a, b) => a === b;

export default abstract class Component {
    readonly #canvas = new OffscreenCanvas(Vector2.zero);
    readonly #children = new Association<Component, symbol>();
    readonly #childrenNeedingInitialisation = new Set<Component>();
    readonly #emptyChildren = new Set<symbol>();

    #parent: ParentInterface;
    #initialised = false;
    #renderRequired = false;
    #childCount = 0;
    #userDisplayName: string | undefined;

    readonly #initUpdates: InternalUpdateDependencyTriggers = {
        resize: false,
        render: false,
        childPositions: true,
        _transform: false,
        _position: false,
        _resizedEvent: false
    };

    readonly #childAddedEvent = new SingleEventEmitter<[identifier: symbol]>();
    readonly #childResizedEvent = new SingleEventEmitter();
    readonly #renderRequestedEvent = new SingleEventEmitter();
    readonly #transformUpdateEvent = new SingleEventEmitter();
    readonly #globalPositionUpdatedEvent = new SingleEventEmitter();
    readonly #userGlobalPositionUpdatedEvent = new SingleEventEmitter<[position: Vector2]>();
    readonly #initialisingEvent = new SingleEventEmitter();
    readonly #initialisedEvent = new SingleEventEmitter();
    readonly #resizedEvent = new SingleEventEmitter();
    readonly #childPositionsUpdateEvent = new SingleEventEmitter();

    readonly #childSizeRequests = this.createChildrenMetadata<Reference<SizeRequest>>(() => ref({
        minSize: Vector2.notAVector
    }));

    readonly #size = this.#createLinkedReference(Vector2.notAVector, {
        triggers: {
            resize: false,
            render: false,
            _transform: true,
            _resizedEvent: true
        },
        checkEquality: Vector2.equal
    });

    readonly #globalPosition = this.#createLinkedReference(Vector2.notAVector, {
        triggers: {
            resize: false,
            render: false,
            _position: true
        },
        checkEquality: Vector2.equal
    });

    readonly #opacity = this.#createLinkedReference(1, {
        triggers: {
            childPositions: false,
            resize: false,
            render: true
        }
    });

    #colliderRef = ref<Collider | undefined>(undefined);

    /**
     * Creates a collider for this component.
     * By default, the collider is a rectangle that covers the position and size of the component.
     */
    protected createCollider(): Collider {
        return new RectangleCollider(this.#globalPosition.get(), this.#globalPosition.get().add(this.#size.get()));
    }

    #updateCollider() {
        // Not initialised yet
        if (this.#size.get().isNaV || this.#globalPosition.get().isNaV) return;

        this.#colliderRef.set(this.createCollider());
    }

    get collider(): Getter<Collider> {
        if (!this.#colliderRef.get()) this.#updateCollider();
        return this.#colliderRef;
    }

    constructor() {
        this.#renderRequestedEvent.listen(() => this.#renderRequired = true);
        this.#childResizedEvent.listen(() => this.#handleChildResized());
        this.#transformUpdateEvent.listen(() => this.#updateTransform());
        this.#globalPositionUpdatedEvent.listen(() => this.#handleGlobalPositionUpdated());
        this.#childPositionsUpdateEvent.listen(() => this.#updateChildPositions());
        this.#initialisedEvent.listen(() => this.#handleInitialised());
    }

    /**
     * The current size of this component.
     * @remarks This value may change when you run batched updates or when something updates this component's transform.
     */
    get size() {
        return this.#size.get();
    }

    /**
     * A value between one (fully opaque) and zero (fully transparent).
     * Lower values are harder to see and let through more of the background.
     * The component will not render when the opacity is zero.
     */
    get opacity() {
        return this.#opacity.get();
    }

    set opacity(value) {
        this.#opacity.set(value);
    }

    /**
     * A user-defined name to assign to this component in the inspector.
     */
    get displayName() {
        return this.#userDisplayName;
    }

    set displayName(name) {
        this.#userDisplayName = name;
    }

    get childAddedEvent() {
        return this.#childAddedEvent.getListener();
    }

    get resizedEvent() {
        return this.#resizedEvent.getListener();
    }

    protected get globalPositionUpdatedEvent() {
        return this.#userGlobalPositionUpdatedEvent.getListener();
    }

    /**
     * Called during the initialisation process, just before the children are initialised.
     * If you need to set up children on init, do it in this event.
     *
     * Initialisation happens either when this component or a parent is connected to the root component,
     * or when adding this component as a child to a component that has already been initialised.
     */
    protected get initialisingEvent() {
        return this.#initialisingEvent.getListener();
    }

    /**
     * Called after the component has been initialised.
     *
     * Initialisation happens either when this component or a parent is connected to the root component,
     * or when adding this component as a child to a component that has already been initialised.
     */
    protected get initialisedEvent() {
        return this.#initialisedEvent.getListener();
    }

    protected get isInitialised() {
        return this.#initialised;
    }

    /**
     * Creates a top-level component
     *
     * @internal
     */
    static setupRoot(child: Component, parentInterface: ParentInterface): RootChildInterface {
        child.#init(parentInterface);

        return {
            setChildSize(size: Vector2) {
                child.#size.set(size);
            },
            getImageSource() {
                return child.#getImageSource();
            },
            renderTree() {
                child.#renderTree();
                child.#renderRequired = false;
            },
            setPosition(position: Vector2) {
                child.#globalPosition.set(position);
            },
            getComponentUnderPosition(position: Vector2): Component | null {
                return child.#getComponentUnderPosition(position);
            },
            getFullDisplayName() {
                return child.#getFullDisplayName();
            }
        };
    }

    [GET_GLOBAL_TL]() {
        return this.#globalPosition.get();
    }

    [GET_GLOBAL_BR]() {
        return this.#globalPosition.get().add(this.#size.get());
    }

    [GET_NAME]() {
        return this.#parent.getChildName();
    }

    [GET_IMAGE_SOURCE]() {
        return this.#getImageSource();
    }

    addChild(child: Component) {
        const maxChildren = this.getChildLimit();

        if (this.#childCount >= maxChildren) {
            throw new Error("Failed to add child as it would go over the limit");
        }

        this.#childCount++;

        const identifier = Symbol(`${this.#childCount}.${child.#getFullDisplayName()}`);
        this.#children.add(child, identifier);

        this.#childAddedEvent.emit(identifier);

        if (this.#initialised) {
            this.#initialiseChild(child);
        } else {
            this.#childrenNeedingInitialisation.add(child);
        }
    }

    addChildren(...children: Component[]) {
        for (const child of children) this.addChild(child);
    }

    /**
     * Forces a synchronous transform update.
     * Usually you should not need to use this—it only exists as a quick solution.
     * If you have to use it, there's a bug somewhere.
     */
    forceTransformUpdate() {
        this.#updateTransform();
    }

    protected getChildren(): ReadonlySet<symbol> {
        return new Set(this.#children.bValues());
    }

    protected getChildSizeRequest(identifier: symbol) {
        const ref = this.#childSizeRequests.get(identifier);
        if (!ref) throw new Error("Invalid child");
        return deref(ref);
    }

    protected getChildImageSource(identifier: symbol) {
        const child = this.#children.getFromB(identifier);
        if (!child) throw new Error("Invalid child");
        return child.#getImageSource();
    }

    protected getGlobalPosition() {
        return this.#globalPosition.get();
    }

    /**
     * Schedules an update to be run at the next batch handler.
     * The update function is provided with the canvas context.
     */
    protected scheduleUpdateWithContext(distinctness: symbol, handler: (context: CanvasFrameContext) => void) {
        this.#getBatch().add(distinctness, () => {
            const context = this.#canvas.getContext();
            handler(context);
        });
    }

    /**
     * Creates a `Reference` (similar to `ref`) that triggers an update event when the value changes.
     *
     * The event is returned in the `changedEvent` property of the returned object.
     */
    protected createLinkedReference<T>(initialValue: T, options: Partial<UpdateDependencyOptions<T>> = {}): LinkedReference<T> {
        const {
            checkEquality = defaultCompareFn,
            triggers = {}
        } = options;

        const changedEvent = new SingleEventEmitter<[T]>();

        let value = initialValue;

        return {
            get() {
                return value;
            },
            set: (newValue) => {
                if (checkEquality(value, newValue)) return;
                value = newValue;

                this.#emitTriggerEvents(triggers);
                changedEvent.emit(newValue);
            },
            changedEvent: changedEvent.getListener()
        };
    }

    /**
     * A piece of metadata stored per-child.
     * The values aren't monitored for changes.
     *
     * This method can be called multiple times, which will create separate metadata stores.
     *
     * @param getInitialMetadata Called when something adds a new child.
     * The result is then used as that child's metadata.
     */
    protected createChildrenMetadata<T>(getInitialMetadata: GetInitialMetadataFn<T>): ChildrenMetadataMap<T> {
        const map = new Map<symbol, T>();

        this.childAddedEvent.listen(identifier => {
            const metadata = getInitialMetadata();
            map.set(identifier, metadata);
        });

        return map;
    }

    /**
     * Helper method to get the only child of this component. Throws if there is not exactly one child.
     */
    protected getOnlyChild() {
        if (this.#children.size !== 1) throw new Error("Component does not have exactly one child");
        const children = Array.from(this.#children.bValues());
        return children[0];
    }

    /**
     * Returns the symbol that identifies the specified child component.
     */
    protected getChildComponentIdentifier(component: Component) {
        const identifier = this.#children.getFromA(component);
        if (!identifier) throw new Error("Specified component is not a child of this component");
        return identifier;
    }

    /**
     * A helper method that draws the component's children at the positions returned by `getChildPosition`.
     * Your implementation of `getChildPosition` should be fast as this method calls it directly without any memoisation.
     *
     * @remarks This method does not call the children's `render()` function –
     *          it simply copies their previously rendered images onto the canvas.
     *          However, by the time `render()` is called, the children have rendered themselves already.
     */
    protected drawChildren(ctx: CanvasFrameContext, clearCanvas = true) {
        if (clearCanvas) clear(ctx);

        const children = this.getChildren();

        for (const child of children) {
            // rendering empty children throws an error
            if (this.#emptyChildren.has(child)) continue;

            const position = this.getChildPosition(child);
            const imageSource = this.getChildImageSource(child);

            try {
                copyFrom(imageSource, ctx, position);
            } catch (err) {
                throw new Error(`Failed to render ${this.getPath() + "/" + child.description}`, {
                    cause: err
                });
            }
        }
    }

    /**
     * Renders this component onto the context.
     */
    protected abstract render(ctx: CanvasFrameContext): void;

    /**
     * Gets the size this component wants to be set to.
     */
    protected abstract getSizeRequest(ctx: CanvasFrameContext): SizeRequest;

    /**
     * Returns the maximum number of children this component can have.
     * Adding any more throws an error.
     * There is no limit by default.
     */
    protected getChildLimit(): number {
        return Infinity;
    }

    /**
     * Gets the size of each child. Must be implemented if the component supports children.
     */
    protected getChildrenSizes(): ReadonlyMap<symbol, Vector2> {
        throw new Error(`${this.getComponentName()} requires, but is missing, an implementation of \`getChildrenSizes\``);
    }

    /**
     * Gets the position of the child inside this component. Must be implemented if the component supports children.
     */
    protected getChildPosition(identifier: symbol): Vector2 {
        throw new Error(`${this.getComponentName()} requires, but is missing, an implementation of \`getChildPosition\``);
    }

    /**
     * Gets the display name of this component. Returns the class name by default without the "Component" suffix (mangled in production builds).
     */
    protected getComponentName(): string {
        const constructorName = this.constructor.name;
        const unwantedSuffix = "Component";

        if (constructorName.endsWith(unwantedSuffix)) {
            return constructorName.substring(0, constructorName.length - unwantedSuffix.length);
        } else {
            return constructorName;
        }
    }

    /**
     * Returns the name of this component and its ancestors, separated by slashes.
     * @example ~/1.Absolute/3.Padding/1.Flex/2.Text
     */
    protected getPath() {
        const thisName = this.#parent.getChildName();
        const parentPath = this.#parent.getPath();

        return `${parentPath}/${thisName}`;
    }

    /**
     * Writes a debug message to the console, prefixed with the component's path.
     * @remarks Only runs in development mode.
     */
    protected debug(...args: unknown[]) {
        if (__DEV__) {
            let name: string;

            try {
                // Fails when root hasn't loaded yet
                name = this.getPath();
            } catch {
                name = `?/${this.#getFullDisplayName()}`;
            }

            console.debug(`%c[${name}]%c`, "font-weight:bold", "", ...args);
        }
    }

    #createLinkedReference<T>(initialValue: T, options?: Partial<InternalUpdateDependencyOptions<T>>): LinkedReference<T> {
        return this.createLinkedReference(initialValue, options);
    }

    #init(parent: ParentInterface) {
        this.#parent = parent;

        const batch = parent.getBatch();
        this.#childResizedEvent.enableBatching(batch);
        this.#globalPositionUpdatedEvent.enableBatching(batch);
        this.#childPositionsUpdateEvent.enableBatching(batch);

        this.#initialisingEvent.emit();

        for (const child of this.#childrenNeedingInitialisation) {
            this.#initialiseChild(child);
        }

        this.#requestResize();

        this.#initialised = true;

        this.#initialisedEvent.emit();
    }

    #runRender() {
        const context = this.#canvas.getContext();
        this.render(context);
        context.disposeListeners.forEach(fn => fn());
    }

    #requestResize() {
        const context = this.#canvas.getContext();
        const newSizeRequest = this.getSizeRequest(context);
        this.#parent.updateChildSizeRequest(newSizeRequest);
    }

    #emitTriggerEvents(triggers: Partial<InternalUpdateDependencyTriggers>) {
        if (this.#initialised) {
            if (triggers.resize !== false) this.#requestResize();
            if (triggers.render !== false) this.#renderRequestedEvent.emit();
            if (triggers.childPositions !== false) this.#childPositionsUpdateEvent.emit();
            if (triggers._transform) this.#transformUpdateEvent.emit();
            if (triggers._position) this.#globalPositionUpdatedEvent.emit();
            if (triggers._resizedEvent) this.#resizedEvent.emit();
        } else {
            if (triggers.resize !== false) this.#initUpdates.resize = true;
            if (triggers.render !== false) this.#initUpdates.render = true;
            if (triggers._transform) this.#initUpdates._transform = true;
            if (triggers._position) this.#initUpdates._position = true;
            if (triggers._resizedEvent) this.#initUpdates._resizedEvent = true;
        }
    }

    #updateChildSizeRequest(child: Component, newSizeRequest: SizeRequest) {
        const childIdentifier = this.#children.getFromA(child);
        if (!childIdentifier) throw new Error("Component is not our child");

        const sizeRequest = this.#childSizeRequests.get(childIdentifier);
        if (!sizeRequest) throw new Error("Child has no size request");
        sizeRequest.set({
            minSize: newSizeRequest.minSize.round(),
            requestedSize: newSizeRequest.requestedSize?.round()
        });

        this.#childResizedEvent.emit();
    }

    #getChildName(child: Component) {
        const childIdentifier = this.#children.getFromA(child);
        if (!childIdentifier) throw new Error("Component is not our child");
        return childIdentifier.description;
    }

    #getBatch(): Batch {
        return this.#parent.getBatch();
    }

    #handleChildResized() {
        this.#requestResize();
    }

    #updateTransform() {
        this.#canvas.setSizeAndClear(this.#size.get());
        this.#emptyChildren.clear();

        const children = this.getChildren();
        if (children.size > 0) {
            const childSizes = this.getChildrenSizes();

            for (const identifier of children) {
                const size = childSizes.get(identifier);
                if (!size) throw new Error(`Missing size for child ${identifier.description}`);

                if (size.equal(Vector2.zero)) {
                    this.#emptyChildren.add(identifier);
                }

                const child = this.#children.getFromB(identifier);
                child.#size.set(size);
            }
        }

        this.#renderRequired = true;
    }

    #getImageSource(): CanvasImageSource {
        return this.#canvas.getCanvasElement();
    }

    #initialiseChild(child: Component) {
        child.#init({
            getBatch: this.#getBatch.bind(this),
            updateChildSizeRequest: this.#updateChildSizeRequest.bind(this, child),
            getChildName: this.#getChildName.bind(this, child),
            getPath: this.getPath.bind(this)
        });
    }

    /**
     * Rendering can safely be skipped when invisible.
     */
    #canSkipRender() {
        return this.opacity <= 0;
    }

    #renderTree() {
        if (this.#canSkipRender()) return;

        for (const child of this.#children.aValues()) {
            child.#renderTree();
            this.#renderRequired ||= child.#renderRequired;
            child.#renderRequired = false;
        }

        if (this.#renderRequired) {
            this.#runRender();
        }
    }

    #updateChildPositions() {
        for (const [component, identifier] of this.#children) {
            const position = this.getChildPosition(identifier);
            const globalPosition = this.#globalPosition.get().add(position);
            component.#globalPosition.set(globalPosition);
        }
    }

    #handleGlobalPositionUpdated() {
        this.#updateChildPositions();
        this.#updateCollider();
        this.#userGlobalPositionUpdatedEvent.emit(this.#globalPosition.get());
    }

    #getComponentUnderPosition(position: Vector2): Component | null {
        for (const child of iter(this.#children.aValues()).reverse()) {
            const childComponent = child.#getComponentUnderPosition(position);
            if (childComponent) return childComponent;
        }

        const globalPositionTL = this.#globalPosition.get();
        const globalPositionBR = globalPositionTL.add(this.#size.get());

        if (
            position.x >= globalPositionTL.x && position.y >= globalPositionTL.y &&
            position.x <= globalPositionBR.x && position.y <= globalPositionBR.y) {
            return this;
        }

        return null;
    }

    #getFullDisplayName() {
        const componentName = this.getComponentName();
        if (this.displayName) return `${componentName}[${this.displayName}]`;
        else return componentName;
    }

    #handleInitialised() {
        this.#globalPosition.changedEvent.listen(() => this.#updateCollider());
        this.#size.changedEvent.listen(() => this.#updateCollider());
    }
}
