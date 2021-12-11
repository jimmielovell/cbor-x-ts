export { Encoder, addExtension, encode, NEVER, ALWAYS, DECIMAL_ROUND, DECIMAL_FIT, REUSE_BUFFER_MODE } from './encode.js';
export { Tag, Decoder, decodeMultiple, decode, FLOAT32_OPTIONS, clearSource, roundFloat32, isNativeAccelerationEnabled, setExtractor } from './decode.js';
export { EncoderStream, DecoderStream } from './stream.js';
export { decodeIter, encodeIter } from './iterators.js';
export declare const useRecords = false;
export declare const mapsAsObjects = true;
