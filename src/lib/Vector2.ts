export const RAD2DEG = 180 / Math.PI;
export const DEG2RAD = Math.PI / 180;

export default class Vector2 {
    static equal(a: Vector2, b: Vector2) {
        return a.x === b.x && a.y === b.y;
    }

    public readonly x: number;
    public readonly y: number;

    constructor(x: number = 0, y: number = 0) {
        this.x = x;
        this.y = y;
    }

    clone() {
        return new Vector2(this.x, this.y);
    }

    equal(to: Vector2) {
        return Vector2.equal(this, to);
    }

    add(to: Vector2) {
        return new Vector2(this.x + to.x, this.y + to.y);
    }

    subtract(from: Vector2) {
        return new Vector2(this.x - from.x, this.y - from.y);
    }

    multiply(by: Vector2) {
        return new Vector2(this.x * by.x, this.y * by.y);
    }

    divide(by: Vector2) {
        return new Vector2(this.x / by.x, this.y / by.y);
    }

    inverse() {
        return new Vector2(-this.x, -this.y);
    }

    length() {
        return Math.sqrt(this.x ** 2 + this.y ** 2);
    }

    withLength(length: number) {
        const len = this.length();
        const ratio = length / len;
        return new Vector2(this.x * ratio, this.y * ratio);
    }

    normalise() {
        return this.withLength(1);
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
}
