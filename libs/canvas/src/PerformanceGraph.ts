export class PerformanceGraph {
    #maximumMeasurementCount = 0;

    #currentChunkCount = 0;
    #currentChunkData: Record<string, {total: number; count: number}> = undefined;
    #currentMeasurement: Record<string, number> | undefined;
    #previousMeasurements: (Record<string, number>)[] = [];

    #lastMeasure: { name: string, startTime: number } | undefined;

    #chunkSize = 3;

    measure(name: string) {
        if (!this.#currentMeasurement) {
            this.#currentMeasurement = {};
        }

        if (this.#lastMeasure) {
            this.#currentMeasurement[this.#lastMeasure.name] = performance.now() - this.#lastMeasure.startTime;
        }

        this.#lastMeasure = {
            name,
            startTime: performance.now(),
        };
    }

    commit() {
        if (!this.#currentMeasurement) {
            throw new Error("`commit` must be called after `measure`");
        }

        if (this.#lastMeasure) {
            this.#currentMeasurement[this.#lastMeasure.name] = performance.now() - this.#lastMeasure.startTime;
        }

        if (this.#currentChunkCount === 0) {
            this.#currentChunkData = {};
        }

        for (const [key, duration] of Object.entries(this.#currentMeasurement)) {
            if (this.#currentChunkData.hasOwnProperty(key)) {
                this.#currentChunkData[key].count++;
                this.#currentChunkData[key].total += duration;
            } else {
                this.#currentChunkData[key] = {
                    count: 1,
                    total: duration
                };
            }
        }

        this.#currentChunkCount++;

        if (this.#currentChunkCount >= this.#chunkSize) {
            const chunkMeasurement: Record<string, number> = {};
            for (const [key, {total, count}] of Object.entries(this.#currentChunkData)) {
                chunkMeasurement[key] = total / count;
            }

            this.#previousMeasurements.unshift(chunkMeasurement);
            if (this.#previousMeasurements.length > this.#maximumMeasurementCount) {
                this.#previousMeasurements.length = this.#maximumMeasurementCount;
            }

            this.#currentChunkCount = 0;
            this.#currentChunkData = undefined;
        }

        this.#currentMeasurement = undefined;
    }

    render(ctx: CanvasRenderingContext2D, width: number, height: number, offsetX: number, offsetY: number) {
        const measurementKeyColours: Record<string, string> = {};

        ctx.beginPath();
        ctx.rect(offsetX, offsetY, width, height);
        ctx.fillStyle = "#fff8";
        ctx.fill();
        ctx.strokeStyle = "#777";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.lineWidth = 1;

        this.#maximumMeasurementCount = Math.floor(width / this.#chunkSize);
        if (this.#previousMeasurements.length > this.#maximumMeasurementCount) {
            this.#previousMeasurements.length = this.#maximumMeasurementCount;
        }

        const MAX_DURATION = 1000 / 60;

        this.#previousMeasurements.forEach((measurement, index) => {
            const xOffset = index * this.#chunkSize + this.#chunkSize;

            let yOffset = 0;
            for (const [key, duration] of Object.entries(measurement)) {
                const measureHeight = duration / MAX_DURATION * height;

                if (!measurementKeyColours.hasOwnProperty(key)) {
                    const colourIndex = Object.keys(measurementKeyColours).length;
                    measurementKeyColours[key] = palette[colourIndex];
                }

                ctx.beginPath();
                ctx.fillStyle = "#" + measurementKeyColours[key];
                ctx.rect(offsetX + width - xOffset, offsetY + height - yOffset - measureHeight, this.#chunkSize, measureHeight);
                ctx.fill();

                yOffset += measureHeight;
            }
        });

        ctx.font = "12px sans-serif";
        let colourOffsetY = 0;
        for (const [key, colour] of Object.entries(measurementKeyColours)) {
            const keyMetrics = ctx.measureText(key);

            ctx.fillStyle = "#0005";
            ctx.beginPath();
            ctx.rect(offsetX, offsetY + colourOffsetY, keyMetrics.width + 18, 16);
            ctx.fill();

            ctx.fillStyle = "#" + colour;
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(offsetX + 2, offsetY + colourOffsetY + 2, 12, 12);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.fillText(key, offsetX + 16, offsetY + colourOffsetY + 3);

            colourOffsetY += 16;
        }
    }
}

const palette = [
    // https://github.com/google/palette.js/blob/79a703df344e3b24380ce1a211a2df7f2d90ca22/palette.js#L810
    'ff0029', '377eb8', '66a61e', '984ea3', '00d2d5', 'ff7f00', 'af8d00',
    '7f80cd', 'b3e900', 'c42e60', 'a65628', 'f781bf', '8dd3c7', 'bebada',
    'fb8072', '80b1d3', 'fdb462', 'fccde5', 'bc80bd', 'ffed6f', 'c4eaff',
    'cf8c00', '1b9e77', 'd95f02', 'e7298a', 'e6ab02', 'a6761d', '0097ff',
    '00d067', '000000', '252525', '525252', '737373', '969696', 'bdbdbd',
    'f43600', '4ba93b', '5779bb', '927acc', '97ee3f', 'bf3947', '9f5b00',
    'f48758', '8caed6', 'f2b94f', 'eff26e', 'e43872', 'd9b100', '9d7a00',
    '698cff', 'd9d9d9', '00d27e', 'd06800', '009f82', 'c49200', 'cbe8ff',
    'fecddf', 'c27eb6', '8cd2ce', 'c4b8d9', 'f883b0', 'a49100', 'f48800',
    '27d0df', 'a04a9b'
]
