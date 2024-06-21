import {BOARD_HEIGHT, BOARD_WIDTH} from "./constants";

export function createWinningPatterns() {
    const winningPatterns: bigint[] = [];

// vertical lines
    for (let x = 0; x < BOARD_WIDTH; x++) {
        for (let y = 0; y < BOARD_HEIGHT - 3; y++) {
            let pattern = 0n;

            for (let i = 0; i < 4; i++) {
                pattern |= 1n << getStateOffset(x, y + i);
            }

            winningPatterns.push(pattern);
        }
    }

// horizontal lines
    for (let x = 0; x < BOARD_WIDTH - 3; x++) {
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            let pattern = 0n;

            for (let i = 0; i < 4; i++) {
                pattern |= 1n << getStateOffset(x + i, y);
            }

            winningPatterns.push(pattern);
        }
    }

// bl-tr diagonal lines
    for (let x = 0; x < BOARD_WIDTH - 3; x++) {
        for (let y = 0; y < BOARD_HEIGHT - 3; y++) {
            let pattern = 0n;

            for (let i = 0; i < 4; i++) {
                pattern |= 1n << getStateOffset(x + i, y + i);
            }

            winningPatterns.push(pattern);
        }
    }

// tl-br diagonal lines
    for (let x = 0; x < BOARD_WIDTH - 3; x++) {
        for (let y = 3; y < BOARD_HEIGHT; y++) {
            let pattern = 0n;

            for (let i = 0; i < 4; i++) {
                pattern |= 1n << getStateOffset(x + i, y - i);
            }

            winningPatterns.push(pattern);
        }
    }

    return winningPatterns;
}

export function getStateOffset(x: number, y: number) {
    return BigInt(x * BOARD_HEIGHT + y);
}
