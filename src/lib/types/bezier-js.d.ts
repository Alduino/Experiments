declare module "bezier-js" {
    export interface BoundingBox {
        x?: [number, number];
        y?: [number, number];
        z?: [number, number];
    }

    export interface Point2D {
        x: number;
        y: number;
    }

    export interface Point3D extends Point2D {
        z: number;
    }

    type Point = Point2D & Partial<Point3D>;

    export default class Bezier {
        points: (Point2D | Point3D)[];

        // quadratic 2d
        constructor(coords: [number, number, number, number, number, number]);
        // quadratic 3d
        constructor(coords: [number, number, number, number, number, number, number, number, number]);
        // quadratic 2d obj
        constructor(coords: [Point2D, Point2D, Point2D]);
        // quadratic 3d obj
        constructor(coords: [Point3D, Point3D, Point3D]);
        // cubic 2d
        constructor(coords: [number, number, number, number, number, number, number, number]);
        // cubic 3d
        constructor(coords: [number, number, number, number, number, number, number, number, number, number, number, number]);
        // cubic 2d obj
        constructor(coords: [Point2D, Point2D, Point2D, Point2D]);
        // cubic 3d obj
        constructor(coords: [Point3D, Point3D, Point3D, Point3D]);

        valueOf(): string;
        toString(): string;

        point(idx: number): Point;

        project(point: Point): Point;

        split(t: number): {left: Bezier, right: Bezier};

        // TODO
    }

    export class PolyBezier {
        curves: Bezier[];

        constructor(curves: Bezier[]);

        valueOf(): string;
        toString(): string;

        addCurve(curve: Bezier): void;

        length(): number;

        curve(idx: number): Bezier;

        bbox(): BoundingBox;

        offset(d: number): PolyBezier;
    }
}
