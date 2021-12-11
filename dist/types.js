export var FLOAT32_OPTIONS;
(function (FLOAT32_OPTIONS) {
    FLOAT32_OPTIONS[FLOAT32_OPTIONS["NEVER"] = 0] = "NEVER";
    FLOAT32_OPTIONS[FLOAT32_OPTIONS["ALWAYS"] = 1] = "ALWAYS";
    FLOAT32_OPTIONS[FLOAT32_OPTIONS["DECIMAL_ROUND"] = 3] = "DECIMAL_ROUND";
    FLOAT32_OPTIONS[FLOAT32_OPTIONS["DECIMAL_FIT"] = 4] = "DECIMAL_FIT";
})(FLOAT32_OPTIONS || (FLOAT32_OPTIONS = {}));
// export class Decoder {
// 	constructor(options?: Options)
// 	decode(messagePack: Buffer | Uint8Array): any
// 	decodeMultiple(messagePack: Buffer | Uint8Array, forEach?: (value: any) => any): [] | void
// }
// export function decode(messagePack: Buffer | Uint8Array): any
// export function decodeMultiple(messagePack: Buffer | Uint8Array, forEach?: (value: any) => any): [] | void
// export function addExtension(extension: Extension): void
// export function roundFloat32(float32Number: number): number
export let isNativeAccelerationEnabled;
//# sourceMappingURL=types.js.map