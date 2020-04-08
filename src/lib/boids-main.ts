import Canvas from "./canvas-setup";
import {rect, polygon} from "./imgui";
import Vector2 from "./Vector2";

interface Point {
    pos: Vector2,
    dir: Vector2;
}

// https://soundcloud.com/meganeko/space-magic

const pointsCount = 100;

const canvas = new Canvas("canvas");

const points: Point[] = Array.from({length: pointsCount}, _ => ({
    pos: new Vector2(Math.random(), Math.random()),
    dir: new Vector2(Math.random() * 2 - 1, Math.random() * 2 - 1).normalise().divide(new Vector2(10000, 10000))
}));

canvas.start(ctx => {
    rect(ctx, new Vector2(), ctx.screenSize, {
        fill: "black"
    });

    for (const point of points) {
        polygon(ctx, point.pos.multiply(ctx.screenSize), {
            thickness: 1,
            colour: "#fff9",
            radius: 10,
            rotation: point.dir.dir(),
            distanceMods: [0, -2, -2]
        });
    }

    for (const pt of points) {
        const speed = (ctx.mouseDown.left ? 600 : 60) * ctx.deltaTime;
        pt.pos = pt.pos.add(pt.dir.multiply(new Vector2(speed, speed)));
        if (pt.pos.x < 0) pt.pos = new Vector2(1, pt.pos.y);
        if (pt.pos.x > 1) pt.pos = new Vector2(0, pt.pos.y);
        if (pt.pos.y < 0) pt.pos = new Vector2(pt.pos.x, 1);
        if (pt.pos.y > 1) pt.pos = new Vector2(pt.pos.x, 0);
    }
});
