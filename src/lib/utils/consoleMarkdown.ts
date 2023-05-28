const boundaries = ["**", "*", "__", "_", "`"] as const;

const boundaryStyles = {
    reset: "font-weight:inherit;font-style:inherit",
    "**": "font-weight:bold",
    "__": "font-style:italic",
    "*": "font-style:italic",
    "_": "font-style:italic",
    "`": "font-weight:bold"
}

interface MultiIndexOfResult<T extends string> {
    readonly test: T;
    readonly index: number;
}

function multiIndexOf<T extends string>(source: string, tests: readonly T[], startIndex = 0): MultiIndexOfResult<T> | null {
    for (let i = startIndex; i < source.length; i++) {
        for (const test of tests) {
            if (source[i] !== test[0]) continue;

            if (test.length === 1) {
                return {test, index: i};
            } else {
                let found = true;

                for (let testIdx = 1; testIdx < test.length; testIdx++) {
                    if (source[i + testIdx] === test[testIdx]) continue;
                    found = false;
                    break;
                }

                if (found) {
                    return {test, index: i};
                }
            }
        }
    }
}

function countLeadingCharacters(source: string, test: string): number {
    for (let i = 0; i < source.length; i++) {
        if (source[i] !== test) return i;
    }

    return source.length;
}

function trimTemplateString(str: string): string {
    const lines = str.split("\n");
    if (lines.length === 1) return lines[0].trim();

    if (lines.at(-1).trim() === "") lines.pop();

    const firstLine = lines.shift();

    const indentLength = countLeadingCharacters(lines[0], " ");

    const trimmedLines = lines.map(line => {
        const indent = line.substring(0, indentLength);
        const rest = line.substring(indentLength);

        return indent.trimStart() + rest;
    });

    if (firstLine) return [firstLine, ...trimmedLines].join("\n");
    return trimmedLines.join("\n");
}

export default function consoleMarkdown(src: string): string[] {
    const trimmedSource = trimTemplateString(src);

    const textParts: string[] = [];
    const styles: string[] = [];

    let offset = 0;

    while (offset < trimmedSource.length) {
        const startBoundary = multiIndexOf(trimmedSource, boundaries, offset);
        if (!startBoundary) break;

        const endBoundaryIdx = (
            (trimmedSource.indexOf(startBoundary.test, startBoundary.index + startBoundary.test.length) + 1) ||
            (trimmedSource.length + 1)
        ) - 1;

        styles.push(boundaryStyles[startBoundary.test], boundaryStyles.reset);

        textParts.push(
            trimmedSource.substring(offset, startBoundary.index + startBoundary.test.length),
            "%c", trimmedSource.substring(startBoundary.index + startBoundary.test.length, endBoundaryIdx),
            "%c", startBoundary.test
        );

        offset = endBoundaryIdx + startBoundary.test.length;
    }

    textParts.push(trimmedSource.substring(offset));

    return [textParts.join(""), ...styles];
}
