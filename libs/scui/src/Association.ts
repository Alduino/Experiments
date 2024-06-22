/**
 * A two-sided map, where both sides are keys for the other side.
 */
export default class Association<A, B> {
    #abMap = new Map<A, B>();
    #baMap = new Map<B, A>();

    get size() {
        return this.#abMap.size;
    }

    add(a: A, b: B) {
        this.#abMap.set(a, b);
        this.#baMap.set(b, a);
    }

    getFromA(a: A): B {
        return this.#abMap.get(a);
    }

    getFromB(b: B): A {
        return this.#baMap.get(b);
    }

    deleteFromA(a: A) {
        const b = this.#abMap.get(a);
        this.delete(a, b);
    }

    deleteFromB(b: B) {
        const a = this.#baMap.get(b);
        this.delete(a, b);
    }

    aValues() {
        return this.#abMap.keys();
    }

    bValues() {
        return this.#baMap.keys();
    }

    [Symbol.iterator](): Iterator<[A, B]> {
        return this.#abMap[Symbol.iterator]();
    }

    private delete(a: A, b: B) {
        this.#abMap.delete(a);
        this.#baMap.delete(b);
    }
}
