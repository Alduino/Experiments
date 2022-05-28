export const RAD2DEG = 180 / Math.PI;
export const DEG2RAD = Math.PI / 180;

export default class Vector2 {
    private _source: { x: number, y: number };

    constructor(x: number = 0, y: number = 0) {
        if (Number.isNaN(x) || Number.isNaN(y)) {
            throw new Error("x or y are NaN");
        }

        this._source = {x, y};
    }

    static get zero() {
        return new Vector2(0, 0);
    }

    public get x() {
        if (!this._source) return undefined;
        return this._source.x;
    }

    public set x(value: number) {
        if (!this._source) this._source = {x: 0, y: 0};
        this._source.x = value;
    }

    public get y() {
        if (!this._source) return undefined;
        return this._source.y;
    }

    public set y(value: number) {
        if (!this._source) this._source = {x: 0, y: 0};
        this._source.y = value;
    }

    /**
     * Returns true if the points are at the same location
     */
    static equal(a: Vector2, b: Vector2) {
        return a.x === b.x && a.y === b.y;
    }

    /**
     * Clones a point-like object into a Vector2
     * @param obj An object with x and y keys
     */
    static from(obj: { x: number, y: number }) {
        return new Vector2(obj.x, obj.y);
    }

    /**
     * Imports an object, returning a Vector2 with linked values.
     * @param obj An object with x and y keys
     *
     * The point of this method is that, if the x or y properties of this Vector2 are set, they will also
     * change in the original object. This method should usually not be used, however sometimes it is just
     * easier or cleaner than the alternative.
     */
    static import(obj: { x: number, y: number }) {
        const vec = new Vector2();
        vec._source = obj;
        return vec;
    }

    static fromDir(dir: number) {
        return new Vector2(Math.cos(dir), Math.sin(dir));
    }

    static lerp(a: Vector2, b: Vector2, t: number) {
        return b.subtract(a).multiply(new Vector2(t, t)).add(a);
    }

    static max(vector: Vector2, ...vectors: Vector2[]) {
        let maxX = vector.x, maxY = vector.y;

        for (const {x, y} of vectors) {
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        return new Vector2(maxX, maxY);
    }

    static min(vector: Vector2, ...vectors: Vector2[]) {
        let minX = vector.x, minY = vector.y;

        for (const {x, y} of vectors) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
        }

        return new Vector2(minX, minY);
    }

    clone() {
        return new Vector2(this.x, this.y);
    }

    equal(to: Vector2) {
        return Vector2.equal(this, to);
    }

    replace(to: { x: number, y: number }) {
        this._source = to;
        return this;
    }

    add(to: Vector2) {
        return new Vector2(this.x + to.x, this.y + to.y);
    }

    subtract(from: Vector2) {
        return new Vector2(this.x - from.x, this.y - from.y);
    }

    multiply(by: Vector2 | number) {
        if (typeof by === "number") by = new Vector2(by, by);
        return new Vector2(this.x * by.x, this.y * by.y);
    }

    divide(by: Vector2 | number) {
        if (typeof by === "number") by = new Vector2(by, by);
        return new Vector2(this.x / by.x, this.y / by.y);
    }

    inverse() {
        return new Vector2(-this.x, -this.y);
    }

    lengthSquared() {
        return this.x * this.x + this.y * this.y;
    }

    length() {
        return Math.sqrt(this.lengthSquared());
    }

    withLength(length: number) {
        const len = this.length();
        const ratio = length / len;
        return new Vector2(this.x * ratio, this.y * ratio);
    }

    normalise() {
        return this.withLength(1);
    }

    dir() {
        return Math.atan2(this.y, this.x);
    }

    abs() {
        return new Vector2(Math.abs(this.x), Math.abs(this.y));
    }

    dot(b: Vector2) {
        return (this.x * b.x) + (this.y * b.y);
    }

    cross(b: Vector2) {
        return (this.x * b.x) - (this.y * b.y);
    }

    distance(b: Vector2) {
        return this.subtract(b).length();
    }

    rotate(radians: number) {
        return new Vector2(
            this.x * Math.cos(radians) - this.y * Math.sin(radians),
            this.y * Math.cos(radians) + this.x * Math.sin(radians)
        );
    }

    perpendicular(inv = false) {
        return new Vector2(this.y * (inv ? -1 : 1), this.x * (inv ? 1 : -1));
    }

    angleUnsigned(other: Vector2) {
        const thisNormalised = this.normalise();
        const otherNormalised = other.normalise();

        const dot = thisNormalised.dot(otherNormalised);
        const rad = Math.acos(dot);

        return other;
    }

    angleSigned(other: Vector2) {
        const thisNormalised = this.normalise();
        const otherNormalised = other.normalise();
        const dot = thisNormalised.dot(otherNormalised);
        const sign = Math.sign(thisNormalised.cross(otherNormalised));
        const rad = Math.acos(dot);

        return rad * sign;
    }

    angleTo(other: Vector2) {
        return Math.atan2(other.y - this.y, other.x - this.x);
    }

    assignTo(obj: { x: number, y: number }) {
        obj.x = this.x;
        obj.y = this.y;
    }

    toString() {
        return `[${this.x}, ${this.y}]`;
    }
}
