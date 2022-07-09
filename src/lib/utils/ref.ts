export interface Setter<in T> {
    set(value: T): void;
}

export interface Getter<out T> {
    get(): T;
}

export type Dereffable<T> = T | Getter<T>;
export type Reference<T> = Setter<T> & Getter<T>;

class ReferenceImpl<T> implements Setter<T>, Getter<T> {
    constructor(private value: T) {
    }

    set(value: T) {
        this.value = value;
    }

    get(): T {
        return this.value;
    }
}

function isGetter<T>(value: T | Getter<T>): value is Getter<T> {
    if (!value) return false;
    if (typeof value !== "object") return false;
    const casted = value as Getter<T>;
    return typeof casted.get === "function";
}

/**
 * Creates a reference from the initial value.
 * If the initial value is a reference already, its value is cloned into a new reference.
 */
export function ref<T>(initialValue: Dereffable<T>): Reference<T> {
    const value = deref(initialValue);
    return new ReferenceImpl(value);
}

/**
 * Returns the value in the reference, or the value if it is passed directly.
 */
export function deref<T>(reference: Dereffable<T>): T {
    if (isGetter(reference)) return reference.get();
    return reference;
}
