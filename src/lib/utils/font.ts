import {Font, create as createFontFromBuffer} from "fontkit";

let defaultFont: Font | null;

export function setDefaultFont(font: Font) {
    defaultFont = font;
}

export function getDefaultFont(): Font {
    if (!defaultFont) throw new Error("No default font has been loaded");
    return defaultFont;
}

export async function loadFont(url: URL | string) {
    const arrayBuffer = await fetch(url).then(res => res.arrayBuffer());
    const buffer = new Uint8Array(arrayBuffer);
    // @ts-ignore - Types appear to be wrong.
    return createFontFromBuffer(buffer);
}
