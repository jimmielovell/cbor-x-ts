import { createRequire } from 'module';
import { setExtractor } from './decode.js';
export { Encoder, addExtension, encode, NEVER, ALWAYS, DECIMAL_ROUND, DECIMAL_FIT, REUSE_BUFFER_MODE } from './encode.js';
export { Tag, Decoder, decodeMultiple, decode, FLOAT32_OPTIONS, clearSource, roundFloat32, isNativeAccelerationEnabled, setExtractor } from './decode.js';
export { EncoderStream, DecoderStream } from './stream.js';
export { decodeIter, encodeIter } from './iterators.js';
export const useRecords = false;
export const mapsAsObjects = true;
const extractor = tryRequire('cbor-extract');
if (extractor) {
    setExtractor(extractor.extractStrings);
}
function tryRequire(moduleId) {
    try {
        // @ts-ignore
        let require = createRequire(import.meta.url);
        return require(moduleId);
    }
    catch (error) {
        if (typeof window != 'undefined') {
            console.warn('For browser usage, directly use cbor-x/decode or cbor-x/encode modules. ' + error.message.split('\n')[0]);
        }
    }
}
//# sourceMappingURL=node-index.js.map