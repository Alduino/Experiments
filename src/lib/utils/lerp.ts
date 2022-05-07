import Vector2 from "../Vector2";

export default function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function lerpVector(a: Vector2, b: Vector2, t: number): Vector2 {
    return a.add(b.subtract(a).multiply(t));
}
