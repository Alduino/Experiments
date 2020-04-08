import Canvas from "./canvas-setup";
import {line, rect, copyFrom} from "./imgui";
import Vector2 from "./Vector2";

interface Point {
    pos: Vector2,
    dir: Vector2;
}

const pointsCount = 200;
const lineMaxDistance = .1;

const canvas = new Canvas("canvas");

const points: Point[] = Array.from({length: pointsCount}, _ => ({
    pos: new Vector2(Math.random(), Math.random()),
    dir: new Vector2(Math.random() * 2 - 1, Math.random() * 2 - 1).normalise().divide(new Vector2(10000, 10000))
}));

function makeColour(alpha: number): string {
    const alphaVal = Math.floor(255 - alpha * 255).toString(16).padStart(2, '0');
    return "#c42aed" + alphaVal;
}

canvas.start(ctx => {
    rect(ctx, new Vector2(), ctx.screenSize, {
        fill: "black"
    });

    const pointsWithMouse = [...points, {
        pos: ctx.mousePos.divide(ctx.screenSize),
        dir: new Vector2()
    }];

    for (const pt of pointsWithMouse) {
        const closePoints = pointsWithMouse.filter(p => pt.pos.distance(p.pos) < lineMaxDistance);

        for (const closePt of closePoints) {
            const dist = pt.pos.distance(closePt.pos);
            line(ctx, {
                start: pt.pos.multiply(ctx.screenSize),
                end: closePt.pos.multiply(ctx.screenSize),
                colour: makeColour(dist / lineMaxDistance),
                thickness: (1 - dist / lineMaxDistance) * 2
            });
        }
    }

    for (const pt of points) {
        const speed = (ctx.mouseDown.left ? 600 : 60) * ctx.deltaTime;
        pt.pos = pt.pos.add(pt.dir.multiply(new Vector2(speed, speed)));
        if (pt.pos.x < -lineMaxDistance) pt.pos = new Vector2(1 + lineMaxDistance, pt.pos.y);
        if (pt.pos.x > 1 + lineMaxDistance) pt.pos = new Vector2(-lineMaxDistance, pt.pos.y);
        if (pt.pos.y < -lineMaxDistance) pt.pos = new Vector2(pt.pos.x, 1 + lineMaxDistance);
        if (pt.pos.y > 1 + lineMaxDistance) pt.pos = new Vector2(pt.pos.x, -lineMaxDistance);
    }
});
