import {makeNoise2D, makeNoise3D} from "open-simplex-noise";
import InteractiveCanvas from "./canvas-setup";
import {arc, circle, draw, line, moveTo, path, polygon, rect} from "./imgui";
import Vector2 from "./Vector2";

interface Point {
    pos: Vector2,
    dir: number;
    targetDir: number;
    speed: number;
}

// https://soundcloud.com/meganeko/space-magic

const pointsCount = 500;

const radius = .01;
const viewDistance = .15;
const viewAngle = Math.PI * 1.5;

const noHitAmnt = 4;
const sameDirAmnt = 1;
const centrePosAmnt = 3;

const maxSpinSpeed = .01;

const noHitExponent = .5;

const dirExpansion = new Vector2(.1, .1);

const wind = new Vector2(.05, .05);
const windNoiseX = makeNoise3D(Date.now());
const windNoiseY = makeNoise3D(Date.now() + 1);
const terrainNoise = makeNoise2D(Date.now() + 2);

function colourWithOpacity(colour: string, opacity: number) {
    opacity = Math.min(1, Math.max(0, opacity));
    return colour + Math.floor(opacity * 255).toString(16).padStart(2, "0");
}

function greyscale(brightness: number) {
    const val = Math.round(Math.min(1, Math.max(0, brightness)) * 255).toString(16).padStart(2, " ");
    return "#" + val + val + val;
}

const canvas = new InteractiveCanvas("canvas");

const points: Point[] = Array.from({length: pointsCount}, _ => {
    const dir = Math.random() * 2 * Math.PI;

    return {
        pos: new Vector2(Math.random() * 3 - 1, Math.random() * 3 - 1),
        dir,
        targetDir: dir,
        speed: .2 + Math.random() * 1.6
    };
});

function mod(a: number, b: number) {
    return (a % b + b) % b;
}

function angleNormalised(angle: number, test: number) {
    let n = angle - test + Math.PI;
    if (n > Math.PI * 2 || n < -Math.PI * 2) n %= Math.PI * 2;
    return n > 0 ? n - Math.PI : n + Math.PI;
}

function isInView(usPos: Vector2, usDir: number, themPos: Vector2, viewAngle: number) {
    const dirBetween = usPos.subtract(themPos).dir();
    const startDir = usDir - viewAngle / 2;
    const endDir = usDir + viewAngle / 2;

    const startAdj = angleNormalised(startDir, dirBetween);
    const endAdj = angleNormalised(endDir, dirBetween);

    return (startAdj ^ endAdj) < 0 &&
        (startAdj > endAdj ? startAdj - endAdj : endAdj - startAdj) < 180;
}

canvas.start(ctx => {
    // Temporarily make view square for visualisation
    // @ts-ignore
    //ctx.screenSize.x = ctx.screenSize.y;

    rect(ctx, new Vector2(), ctx.screenSize, {
        fill: "black"
    });

    //if (+ctx.mouseDown) points[0].pos = ctx.mousePos.divide(ctx.screenSize);

    const radiusMultiplier = Math.min(ctx.screenSize.x, ctx.screenSize.y);

    let noHitDir = 0, sameDirDir = 0, centrePosDir = 0, noHitInfluence = 0;
    let centrePosition = new Vector2(), centreCount = 0;

    const incr = .01;
    for (let x = 0; x < 1; x += incr) {
        for (let y = 0; y < 1; y += incr) {
            const sampleX = points[0].pos.x + x;
            const sampleY = points[0].pos.y + y;

            rect(ctx, new Vector2(x, y).multiply(ctx.screenSize), new Vector2(x + incr * 1.5, y + incr * 1.5).multiply(ctx.screenSize), {
                fill: greyscale((terrainNoise(sampleX * 4, sampleY * 4) + .5) / 2)
            });
        }
    }

    const point0Pos = points[0].pos.multiply(ctx.screenSize).subtract(ctx.screenSize.divide(new Vector2(2, 2)));
    ctx.renderer.translate(-point0Pos.x, -point0Pos.y);

    for (let i = 0; i < points.length; i++) {
        let point = points[i];

        const visibleBoids = points.filter((pt, j) =>
            j !== i &&
            pt.pos.distance(point.pos) < viewDistance &&
            true //isInView(point.pos, point.dir, pt.pos, viewAngle)
        );

        if (visibleBoids.length > 0) {
            // don't hit them
            for (const boid of visibleBoids) {
                const influence = (1 - Math.pow(point.pos.distance(boid.pos) / viewDistance, noHitExponent));
                const direction = point.pos.subtract(boid.pos).dir();

                noHitDir += direction * influence;
                noHitInfluence += influence;
            }

            // point the same way as them
            for (const boid of visibleBoids) {
                const influence = (1 - point.pos.distance(boid.pos) / viewDistance);
                sameDirDir = boid.dir * influence + sameDirDir * (1 - influence);
                point.speed = boid.speed * influence + point.speed * (1 - influence);
            }

            // try to be in the centre of them
            for (const boid of visibleBoids) {
                const influence = (1 - point.pos.distance(boid.pos) / viewDistance);
                centrePosition = centrePosition.add(boid.pos.multiply(new Vector2(influence, influence)));
                centreCount += influence;
            }
            centrePosition = centrePosition.divide(new Vector2(centreCount, centreCount));

            if (centreCount > 0) {
                centrePosDir = centrePosition.subtract(point.pos).dir();
            }

            point.targetDir = mod(
                (noHitDir * noHitAmnt + sameDirDir * sameDirAmnt + centrePosDir * centrePosAmnt) /
                (noHitAmnt * noHitInfluence + sameDirAmnt + centrePosAmnt), Math.PI * 2);
        }

        if (i === 0) {
            //circle(ctx, point.pos.multiply(ctx.screenSize), viewDistance * radiusMultiplier, {fill: "#fff2"});
            path(ctx, () => {
                moveTo(ctx, point.pos.multiply(ctx.screenSize));
                arc(ctx, point.pos.multiply(ctx.screenSize), viewDistance * radiusMultiplier,
                    point.dir - viewAngle / 2, point.dir + viewAngle / 2, false, {});
                line(ctx, {
                    end: point.pos.multiply(ctx.screenSize)
                })
            });
            draw(ctx, {fill: "#fff3"})

            line(ctx, {
                start: point.pos.multiply(ctx.screenSize),
                end: point.pos.add(Vector2.fromDir(point.dir - viewAngle / 2).multiply(dirExpansion)).multiply(ctx.screenSize),
                thickness: 2,
                colour: "#fff2"
            });

            line(ctx, {
                start: point.pos.multiply(ctx.screenSize),
                end: point.pos.add(Vector2.fromDir(point.dir + viewAngle / 2).multiply(dirExpansion)).multiply(ctx.screenSize),
                thickness: 2,
                colour: "#fff2"
            });

            for (const boid of visibleBoids) {
                circle(ctx, boid.pos.multiply(ctx.screenSize), 3, {
                    fill: "#ff0"
                });

                line(ctx, {
                    start: point.pos.multiply(ctx.screenSize),
                    end: boid.pos.multiply(ctx.screenSize),
                    thickness: 2,
                    colour: colourWithOpacity("#d97561", 1 - Math.pow(point.pos.distance(boid.pos) / viewDistance, noHitExponent))
                });

                polygon(ctx, boid.pos.multiply(ctx.screenSize), {
                    fill: "#f38c75",
                    radius: radius * radiusMultiplier,
                    rotation: boid.dir
                });
            }

            line(ctx, {
                start: point.pos.multiply(ctx.screenSize),
                end: point.pos.add(Vector2.fromDir(noHitDir).multiply(dirExpansion)).multiply(ctx.screenSize),
                thickness: 2,
                colour: "#a13320"
            });

            line(ctx, {
                start: point.pos.multiply(ctx.screenSize),
                end: point.pos.add(Vector2.fromDir(sameDirDir).multiply(dirExpansion)).multiply(ctx.screenSize),
                thickness: 2,
                colour: "#20a14b"
            });

            line(ctx, {
                start: point.pos.multiply(ctx.screenSize),
                end: point.pos.add(Vector2.fromDir(centrePosDir).multiply(dirExpansion)).multiply(ctx.screenSize),
                thickness: 2,
                colour: "#205ea1"
            });

            line(ctx, {
                start: point.pos.multiply(ctx.screenSize),
                end: point.pos.add(Vector2.fromDir(point.dir).multiply(new Vector2(.1, .1))).multiply(ctx.screenSize),
                thickness: 2,
                colour: "white"
            });

            line(ctx, {
                start: point.pos.multiply(ctx.screenSize),
                end: point.pos.add(
                    Vector2.fromDir(point.targetDir)
                        .multiply(new Vector2(.1 * point.speed, .1 * point.speed)))
                    .multiply(ctx.screenSize),
                thickness: 2,
                colour: "white"
            });

            circle(ctx, centrePosition.multiply(ctx.screenSize), 5, {
                fill: "#2454a7"
            });

            polygon(ctx, point.pos.multiply(ctx.screenSize), {
                fill: "#b82d0a",
                radius: radius * radiusMultiplier,
                rotation: point.dir
            });
        }

        polygon(ctx, point.pos.multiply(ctx.screenSize), {
            thickness: 2,
            colour: "#fff9",
            radius: radius * radiusMultiplier,
            rotation: point.dir
        });
    }

    ctx.renderer.resetTransform();

    for (const pt of points) {
        const diff = angleNormalised(pt.targetDir, pt.dir);
        pt.dir += diff * maxSpinSpeed;
        pt.dir = mod(pt.dir, Math.PI * 2);

        const speed = .05 * ctx.deltaTime * pt.speed * (1.1 - Math.abs(diff / Math.PI));

        const windAmntX = windNoiseX(pt.pos.x, pt.pos.y, performance.now() / 3000);
        const windAmntY = windNoiseY(pt.pos.x, pt.pos.y, performance.now() / 3000);

        pt.pos = pt.pos.add(Vector2.fromDir(pt.dir).multiply(new Vector2(speed, speed)));
        pt.pos = pt.pos.add(new Vector2(windAmntX, windAmntY).multiply(wind).multiply(new Vector2(ctx.deltaTime, ctx.deltaTime)));

        // if (pt.pos.x < 0) pt.pos = new Vector2(1, pt.pos.y);
        // if (pt.pos.x > 1) pt.pos = new Vector2(0, pt.pos.y);
        // if (pt.pos.y < 0) pt.pos = new Vector2(pt.pos.x, 1);
        // if (pt.pos.y > 1) pt.pos = new Vector2(pt.pos.x, 0);
    }
});
