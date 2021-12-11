'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var module$1 = require('module');
var stream = require('stream');

(function (FLOAT32_OPTIONS) {
    FLOAT32_OPTIONS[FLOAT32_OPTIONS["NEVER"] = 0] = "NEVER";
    FLOAT32_OPTIONS[FLOAT32_OPTIONS["ALWAYS"] = 1] = "ALWAYS";
    FLOAT32_OPTIONS[FLOAT32_OPTIONS["DECIMAL_ROUND"] = 3] = "DECIMAL_ROUND";
    FLOAT32_OPTIONS[FLOAT32_OPTIONS["DECIMAL_FIT"] = 4] = "DECIMAL_FIT";
})(exports.FLOAT32_OPTIONS || (exports.FLOAT32_OPTIONS = {}));

let decoder;
try {
    decoder = new TextDecoder();
}
catch (error) { }
let src;
let srcEnd;
let position = 0;
const EMPTY_ARRAY = [];
const RECORD_TAG_ID = 0x69;
const PACKED_REFERENCE_TAG_ID = 6;
const STOP_CODE = {};
let strings = EMPTY_ARRAY;
let stringPosition = 0;
let currentDecoder;
let currentStructures;
let srcString;
let srcStringStart = 0;
let srcStringEnd = 0;
let referenceMap;
let currentExtensions = [];
let currentExtensionRanges = [];
let packedValues;
let dataView;
let restoreMapsAsObject;
let defaultOptions = {
    useRecords: false,
    mapsAsObjects: true
};
let sequentialMode = false;
class Decoder {
    constructor(options) {
        if (options) {
            if (options.useRecords === false && options.mapsAsObjects === undefined) {
                options.mapsAsObjects = true;
            }
            if (options.getStructures && !options.structures) {
                // @ts-ignore
                (options.structures = []).uninitialized = true; // this is what we use to denote uninitialized structures
            }
        }
        Object.assign(this, options);
    }
    decode(source, end) {
        if (src) {
            // re-entrant execution, save the state and restore it after we do this decode
            return saveState(() => {
                clearSource();
                return this instanceof Decoder ? this.decode(source, end) : Decoder.prototype.decode.call(defaultOptions, source, end);
            });
        }
        srcEnd = end > -1 ? end : source.length;
        position = 0;
        stringPosition = 0;
        srcStringEnd = 0;
        srcString = null;
        strings = EMPTY_ARRAY;
        src = source;
        // this provides cached access to the data view for a buffer if it is getting reused, which is a recommended
        // technique for getting data from a database where it can be copied into an existing buffer instead of creating
        // new ones
        try {
            dataView = source.dataView || (source.dataView = new DataView(source.buffer, source.byteOffset, source.byteLength));
        }
        catch (error) {
            // if it doesn't have a buffer, maybe it is the wrong type of object
            src = null;
            if (source instanceof Uint8Array) {
                throw error;
            }
            throw new Error('Source must be a Uint8Array or Buffer but was a ' + ((source && typeof source == 'object') ? source.constructor.name : typeof source));
        }
        if (this instanceof Decoder) {
            currentDecoder = this;
            packedValues = this.sharedValues &&
                (this.pack ? new Array(this.maxPrivatePackedValues || 16).concat(this.sharedValues) :
                    this.sharedValues);
            if (this.structures) {
                currentStructures = this.structures;
                return checkedRead();
            }
            else if (!currentStructures || currentStructures.length > 0) {
                currentStructures = [];
            }
        }
        else {
            currentDecoder = defaultOptions;
            if (!currentStructures || currentStructures.length > 0) {
                currentStructures = [];
            }
            packedValues = null;
        }
        return checkedRead();
    }
    decodeMultiple(source, forEach) {
        let values, lastPosition = 0;
        try {
            let size = source.length;
            sequentialMode = true;
            let value = this ? this.decode(source, size) : defaultDecoder.decode(source, size);
            if (forEach) {
                if (forEach(value) === false) {
                    return;
                }
                while (position < size) {
                    lastPosition = position;
                    if (forEach(checkedRead()) === false) {
                        return;
                    }
                }
            }
            else {
                values = [value];
                while (position < size) {
                    lastPosition = position;
                    values.push(checkedRead());
                }
                return values;
            }
        }
        catch (error) {
            error.lastPosition = lastPosition;
            error.values = values;
            throw error;
        }
        finally {
            sequentialMode = false;
            clearSource();
        }
    }
}
function checkedRead() {
    try {
        let result = read();
        if (position == srcEnd) {
            // finished reading this source, cleanup references
            currentStructures = null;
            src = null;
            if (referenceMap) {
                referenceMap = null;
            }
        }
        else if (position > srcEnd) {
            // over read
            let error = new Error('Unexpected end of CBOR data');
            // @ts-ignore
            error.incomplete = true;
            throw error;
        }
        else if (!sequentialMode) {
            throw new Error('Data read, but end of buffer not reached');
        }
        // else more to read, but we are reading sequentially, so don't clear source yet
        return result;
    }
    catch (error) {
        clearSource();
        if (error instanceof RangeError || error.message.startsWith('Unexpected end of buffer')) {
            error.incomplete = true;
        }
        throw error;
    }
}
function read() {
    let token = src[position++];
    let majorType = token >> 5;
    token = token & 0x1f;
    if (token > 0x17) {
        switch (token) {
            case 0x18:
                token = src[position++];
                break;
            case 0x19:
                if (majorType == 7) {
                    return getFloat16();
                }
                token = dataView.getUint16(position);
                position += 2;
                break;
            case 0x1a:
                if (majorType == 7) {
                    let value = dataView.getFloat32(position);
                    if (currentDecoder.useFloat32 > 2) {
                        // this does rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
                        let multiplier = mult10[((src[position] & 0x7f) << 1) | (src[position + 1] >> 7)];
                        position += 4;
                        return ((multiplier * value + (value > 0 ? 0.5 : -0.5)) >> 0) / multiplier;
                    }
                    position += 4;
                    return value;
                }
                token = dataView.getUint32(position);
                position += 4;
                break;
            case 0x1b:
                if (majorType == 7) {
                    let value = dataView.getFloat64(position);
                    position += 8;
                    return value;
                }
                if (currentDecoder.int64AsNumber) {
                    token = dataView.getUint32(position) * 0x100000000;
                    token += dataView.getUint32(position + 4);
                }
                else
                    token = dataView.getBigUint64(position);
                position += 8;
                break;
            case 0x1f:
                // indefinite length
                switch (majorType) {
                    case 2: // byte string
                    case 3: // text string
                    case 4: // array
                        let array = [];
                        let value, i = 0;
                        while ((value = read()) != STOP_CODE) {
                            array[i++] = value;
                        }
                        return majorType == 4 ? array : majorType == 3 ? array.join('') : Buffer.concat(array);
                    case 5: // map
                        let key;
                        if (currentDecoder.mapsAsObjects) {
                            let object = {};
                            while ((key = readKey()) != STOP_CODE) {
                                object[key] = read();
                            }
                            return object;
                        }
                        else {
                            if (restoreMapsAsObject) {
                                currentDecoder.mapsAsObjects = true;
                                restoreMapsAsObject = false;
                            }
                            let map = new Map();
                            while ((key = read()) != STOP_CODE) {
                                map.set(key, read());
                            }
                            return map;
                        }
                    case 7:
                        return STOP_CODE;
                    default:
                        throw new Error('Invalid major type for indefinite length ' + majorType);
                }
            default:
                throw new Error('Unknown token ' + token);
        }
    }
    switch (majorType) {
        case 0: // positive int
            return token;
        case 1: // negative int
            return ~token;
        case 2: // buffer
            return readBin(token);
        case 3: // string
            if (srcStringEnd >= position) {
                return srcString.slice(position - srcStringStart, (position += token) - srcStringStart);
            }
            if (srcStringEnd == 0 && srcEnd < 140 && token < 32) {
                // for small blocks, avoiding the overhead of the extract call is helpful
                let string = token < 16 ? shortStringInJS(token) : longStringInJS(token);
                if (string != null) {
                    return string;
                }
            }
            return readFixedString(token);
        case 4: // array
            let array = new Array(token);
            for (let i = 0; i < token; i++) {
                array[i] = read();
            }
            return array;
        case 5: // map
            if (currentDecoder.mapsAsObjects) {
                let object = {};
                for (let i = 0; i < token; i++) {
                    object[readKey()] = read();
                }
                return object;
            }
            else {
                if (restoreMapsAsObject) {
                    currentDecoder.mapsAsObjects = true;
                    restoreMapsAsObject = false;
                }
                let map = new Map();
                for (let i = 0; i < token; i++) {
                    map.set(read(), read());
                }
                return map;
            }
        case 6: // extension
            if ((token >> 8) == RECORD_TAG_ID) { // record structures
                let structure = currentStructures[token & 0xff];
                if (structure) {
                    if (!structure.read) {
                        structure.read = createStructureReader(structure);
                    }
                    return structure.read();
                }
                else if (currentDecoder.getStructures) {
                    let updatedStructures = saveState(() => {
                        // save the state in case getStructures modifies our buffer
                        src = null;
                        return currentDecoder.getStructures();
                    });
                    if (currentStructures === true) {
                        currentDecoder.structures = currentStructures = updatedStructures;
                    }
                    else {
                        currentStructures.splice.apply(currentStructures, [0, updatedStructures.length].concat(updatedStructures));
                    }
                    structure = currentStructures[token & 0xff];
                    if (structure) {
                        if (!structure.read) {
                            structure.read = createStructureReader(structure);
                        }
                        return structure.read();
                    }
                    else {
                        return token;
                    }
                }
                else {
                    return token;
                }
            }
            else {
                let extension = currentExtensions[token];
                if (extension) {
                    if (extension.handlesRead) {
                        return extension(read);
                    }
                    else {
                        return extension(read());
                    }
                }
                else {
                    let input = read();
                    for (let i = 0; i < currentExtensionRanges.length; i++) {
                        let value = currentExtensionRanges[i](token, input);
                        if (value !== undefined) {
                            return value;
                        }
                    }
                    return new Tag(input);
                }
            }
        case 7: // fixed value
            switch (token) {
                case 0x14: return false;
                case 0x15: return true;
                case 0x16: return null;
                case 0x17: return; // undefined
                case 0x1f:
                default:
                    let packedValue = packedValues[token];
                    if (packedValue !== undefined) {
                        return packedValue;
                    }
                    throw new Error('Unknown token ' + token);
            }
        default: // negative int
            if (isNaN(token)) {
                let error = new Error('Unexpected end of CBOR data');
                // @ts-ignore
                error.incomplete = true;
                throw error;
            }
            throw new Error('Unknown CBOR token ' + token);
    }
}
const validName = /^[a-zA-Z_$][a-zA-Z\d_$]*$/;
function createStructureReader(structure) {
    let l = structure.length;
    function readObject() {
        // This initial function is quick to instantiate, but runs slower. After several iterations pay the cost to build the faster function
        if (readObject.count++ > 2) {
            this.read = (new Function('a', 'r', 'return function(){a();return {' + structure.map(key => validName.test(key) ? key + ':r()' : ('[' + JSON.stringify(key) + ']:r()')).join(',') + '}}'))(readArrayHeader, read);
            return this.read();
        }
        readArrayHeader();
        let object = {};
        for (let i = 0; i < l; i++) {
            let key = structure[i];
            object[key] = read();
        }
        return object;
    }
    readObject.count = 0;
    return readObject;
}
function readArrayHeader(expectedLength) {
    // consume the array header, TODO: check expected length
    let token = src[position++];
    //let majorType = token >> 5
    token = token & 0x1f;
    if (token > 0x17) {
        switch (token) {
            case 0x18:
                position++;
                break;
            case 0x19:
                position += 2;
                break;
            case 0x1a: position += 4;
        }
    }
}
let readFixedString = readStringJS;
// let readString8 = readStringJS;
// let readString16 = readStringJS;
// let readString32 = readStringJS;
exports.isNativeAccelerationEnabled = false;
function setExtractor(extractStrings) {
    exports.isNativeAccelerationEnabled = true;
    readFixedString = readString();
    // readString8 = readString(2);
    // readString16 = readString(3);
    // readString32 = readString(5);
    function readString(headerLength) {
        return function readString(length) {
            let string = strings[stringPosition++];
            if (string == null) {
                let extraction = extractStrings(position, srcEnd, length, src);
                if (typeof extraction == 'string') {
                    string = extraction;
                    strings = EMPTY_ARRAY;
                }
                else {
                    strings = extraction;
                    stringPosition = 1;
                    srcStringEnd = 1; // even if a utf-8 string was decoded, must indicate we are in the midst of extracted strings and can't skip strings
                    string = strings[0];
                    if (string === undefined) {
                        throw new Error('Unexpected end of buffer');
                    }
                }
            }
            let srcStringLength = string.length;
            if (srcStringLength <= length) {
                position += length;
                return string;
            }
            srcString = string;
            srcStringStart = position;
            srcStringEnd = position + srcStringLength;
            position += length;
            return string.slice(0, length); // we know we just want the beginning
        };
    }
}
function readStringJS(length) {
    let result;
    if (length < 16) {
        if (result = shortStringInJS(length)) {
            return result;
        }
    }
    if (length > 64 && decoder) {
        return decoder.decode(src.subarray(position, position += length));
    }
    const end = position + length;
    const units = [];
    result = '';
    while (position < end) {
        const byte1 = src[position++];
        if ((byte1 & 0x80) === 0) {
            // 1 byte
            units.push(byte1);
        }
        else if ((byte1 & 0xe0) === 0xc0) {
            // 2 bytes
            const byte2 = src[position++] & 0x3f;
            units.push(((byte1 & 0x1f) << 6) | byte2);
        }
        else if ((byte1 & 0xf0) === 0xe0) {
            // 3 bytes
            const byte2 = src[position++] & 0x3f;
            const byte3 = src[position++] & 0x3f;
            units.push(((byte1 & 0x1f) << 12) | (byte2 << 6) | byte3);
        }
        else if ((byte1 & 0xf8) === 0xf0) {
            // 4 bytes
            const byte2 = src[position++] & 0x3f;
            const byte3 = src[position++] & 0x3f;
            const byte4 = src[position++] & 0x3f;
            let unit = ((byte1 & 0x07) << 0x12) | (byte2 << 0x0c) | (byte3 << 0x06) | byte4;
            if (unit > 0xffff) {
                unit -= 0x10000;
                units.push(((unit >>> 10) & 0x3ff) | 0xd800);
                unit = 0xdc00 | (unit & 0x3ff);
            }
            units.push(unit);
        }
        else {
            units.push(byte1);
        }
        if (units.length >= 0x1000) {
            result += fromCharCode.apply(String, units);
            units.length = 0;
        }
    }
    if (units.length > 0) {
        result += fromCharCode.apply(String, units);
    }
    return result;
}
let fromCharCode = String.fromCharCode;
function longStringInJS(length) {
    let start = position;
    let bytes = new Array(length);
    for (let i = 0; i < length; i++) {
        const byte = src[position++];
        if ((byte & 0x80) > 0) {
            position = start;
            return;
        }
        bytes[i] = byte;
    }
    return fromCharCode.apply(String, bytes);
}
function shortStringInJS(length) {
    if (length < 4) {
        if (length < 2) {
            if (length === 0) {
                return '';
            }
            else {
                let a = src[position++];
                if ((a & 0x80) > 1) {
                    position -= 1;
                    return;
                }
                return fromCharCode(a);
            }
        }
        else {
            let a = src[position++];
            let b = src[position++];
            if ((a & 0x80) > 0 || (b & 0x80) > 0) {
                position -= 2;
                return;
            }
            if (length < 3) {
                return fromCharCode(a, b);
            }
            let c = src[position++];
            if ((c & 0x80) > 0) {
                position -= 3;
                return;
            }
            return fromCharCode(a, b, c);
        }
    }
    else {
        let a = src[position++];
        let b = src[position++];
        let c = src[position++];
        let d = src[position++];
        if ((a & 0x80) > 0 || (b & 0x80) > 0 || (c & 0x80) > 0 || (d & 0x80) > 0) {
            position -= 4;
            return;
        }
        if (length < 6) {
            if (length === 4) {
                return fromCharCode(a, b, c, d);
            }
            else {
                let e = src[position++];
                if ((e & 0x80) > 0) {
                    position -= 5;
                    return;
                }
                return fromCharCode(a, b, c, d, e);
            }
        }
        else if (length < 8) {
            let e = src[position++];
            let f = src[position++];
            if ((e & 0x80) > 0 || (f & 0x80) > 0) {
                position -= 6;
                return;
            }
            if (length < 7) {
                return fromCharCode(a, b, c, d, e, f);
            }
            let g = src[position++];
            if ((g & 0x80) > 0) {
                position -= 7;
                return;
            }
            return fromCharCode(a, b, c, d, e, f, g);
        }
        else {
            let e = src[position++];
            let f = src[position++];
            let g = src[position++];
            let h = src[position++];
            if ((e & 0x80) > 0 || (f & 0x80) > 0 || (g & 0x80) > 0 || (h & 0x80) > 0) {
                position -= 8;
                return;
            }
            if (length < 10) {
                if (length === 8) {
                    return fromCharCode(a, b, c, d, e, f, g, h);
                }
                else {
                    let i = src[position++];
                    if ((i & 0x80) > 0) {
                        position -= 9;
                        return;
                    }
                    return fromCharCode(a, b, c, d, e, f, g, h, i);
                }
            }
            else if (length < 12) {
                let i = src[position++];
                let j = src[position++];
                if ((i & 0x80) > 0 || (j & 0x80) > 0) {
                    position -= 10;
                    return;
                }
                if (length < 11) {
                    return fromCharCode(a, b, c, d, e, f, g, h, i, j);
                }
                let k = src[position++];
                if ((k & 0x80) > 0) {
                    position -= 11;
                    return;
                }
                return fromCharCode(a, b, c, d, e, f, g, h, i, j, k);
            }
            else {
                let i = src[position++];
                let j = src[position++];
                let k = src[position++];
                let l = src[position++];
                if ((i & 0x80) > 0 || (j & 0x80) > 0 || (k & 0x80) > 0 || (l & 0x80) > 0) {
                    position -= 12;
                    return;
                }
                if (length < 14) {
                    if (length === 12) {
                        return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l);
                    }
                    else {
                        let m = src[position++];
                        if ((m & 0x80) > 0) {
                            position -= 13;
                            return;
                        }
                        return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m);
                    }
                }
                else {
                    let m = src[position++];
                    let n = src[position++];
                    if ((m & 0x80) > 0 || (n & 0x80) > 0) {
                        position -= 14;
                        return;
                    }
                    if (length < 15) {
                        return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n);
                    }
                    let o = src[position++];
                    if ((o & 0x80) > 0) {
                        position -= 15;
                        return;
                    }
                    return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o);
                }
            }
        }
    }
}
function readBin(length) {
    return currentDecoder.copyBuffers ?
        // specifically use the copying slice (not the node one)
        Uint8Array.prototype.slice.call(src, position, position += length) :
        src.subarray(position, position += length);
}
function getFloat16() {
    let byte0 = src[position++];
    let byte1 = src[position++];
    let half = (byte0 << 8) + byte1;
    let exp = (half >> 10) & 0x1f;
    let mant = half & 0x3ff;
    let val;
    if (exp == 0) {
        // @ts-ignore
        val = Math.exp(mant, -24);
    }
    else if (exp != 31) {
        // @ts-ignore
        val = Math.exp(mant + 1024, exp - 25);
    }
    else {
        val = mant == 0 ? Infinity : NaN;
    }
    return half & 0x8000 ? -val : val;
}
let keyCache = new Array(4096);
function readKey() {
    let length = src[position++];
    if (length >= 0x60 && length < 0x78) {
        // fixstr, potentially use key cache
        length = length - 0x60;
        if (srcStringEnd >= position) { // if it has been extracted, must use it (and faster anyway)
            return srcString.slice(position - srcStringStart, (position += length) - srcStringStart);
        }
        else if (!(srcStringEnd == 0 && srcEnd < 180)) {
            return readFixedString(length);
        }
    }
    else { // not cacheable, go back and do a standard read
        position--;
        return read();
    }
    let key = ((length << 5) ^ (length > 1 ? dataView.getUint16(position) : length > 0 ? src[position] : 0)) & 0xfff;
    let entry = keyCache[key];
    let checkPosition = position;
    let end = position + length - 3;
    let chunk;
    let i = 0;
    if (entry && entry.bytes == length) {
        while (checkPosition < end) {
            chunk = dataView.getUint32(checkPosition);
            if (chunk != entry[i++]) {
                checkPosition = 0x70000000;
                break;
            }
            checkPosition += 4;
        }
        end += 3;
        while (checkPosition < end) {
            chunk = src[checkPosition++];
            if (chunk != entry[i++]) {
                checkPosition = 0x70000000;
                break;
            }
        }
        if (checkPosition === end) {
            position = checkPosition;
            return entry.string;
        }
        end -= 3;
        checkPosition = position;
    }
    entry = [];
    keyCache[key] = entry;
    entry.bytes = length;
    while (checkPosition < end) {
        chunk = dataView.getUint32(checkPosition);
        entry.push(chunk);
        checkPosition += 4;
    }
    end += 3;
    while (checkPosition < end) {
        chunk = src[checkPosition++];
        entry.push(chunk);
    }
    // for small blocks, avoiding the overhead of the extract call is helpful
    let string = length < 16 ? shortStringInJS(length) : longStringInJS(length);
    if (string != null) {
        return entry.string = string;
    }
    return entry.string = readFixedString(length);
}
class Tag {
    constructor(value) {
        this.value = value;
    }
}
let glbl = typeof window == 'object' ? window : global;
currentExtensions[0] = (dateString) => {
    // string date extension
    return new Date(dateString);
};
currentExtensions[1] = (epochSec) => {
    // numeric date extension
    return new Date(epochSec * 1000);
};
currentExtensions[2] = (buffer) => {
    // bigint extension
    return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getBigUint64(0);
};
currentExtensions[3] = (buffer) => {
    // negative bigint extension
    return BigInt(-1) - (new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getBigUint64(0));
};
// the registration of the record definition extension (tag 105)
const recordDefinition = () => {
    let definition = read();
    let structure = definition[0];
    let id = definition[1];
    currentStructures[id & 0xff] = structure;
    structure.read = createStructureReader(structure);
    let object = {};
    for (let i = 2, l = definition.length; i < l; i++) {
        let key = structure[i - 2];
        object[key] = definition[i];
    }
    return object;
};
recordDefinition.handlesRead = true;
currentExtensions[RECORD_TAG_ID] = recordDefinition;
currentExtensions[27] = (data) => {
    return (glbl[data[0]] || Error)(data[1], data[2]);
};
const packedTable = (read) => {
    if (src[position++] != 0x84) {
        throw new Error('Packed values structure must be followed by 4 element array');
    }
    let newPackedValues = read(); // packed values
    packedValues = packedValues ? newPackedValues.concat(packedValues.slice(newPackedValues.length)) : newPackedValues;
    packedValues.prefixes = read();
    packedValues.suffixes = read();
    return read(); // read the rump
};
packedTable.handlesRead = true;
currentExtensions[51] = packedTable;
currentExtensions[PACKED_REFERENCE_TAG_ID] = (data) => {
    if (typeof data == 'number') {
        return packedValues[16 + (data >= 0 ? 2 * data : (-2 * data - 1))];
    }
    throw new Error('No support for non-integer packed references yet');
};
currentExtensions[40009] = (id) => {
    // id extension (for structured clones)
    if (!referenceMap) {
        referenceMap = new Map();
    }
    let token = src[position];
    const target = ((token >> 5) == 4) ? [] : {};
    // TODO: handle Maps, Sets, and other types that can cycle; this is complicated, because you potentially need to read
    // ahead past references to record structure definitions
    let refEntry = { target, used: false }; // a placeholder object
    referenceMap.set(id, refEntry);
    let targetProperties = read(); // read the next value as the target object to id
    if (refEntry.used) // there is a cycle, so we have to assign properties to original target
        return Object.assign(target, targetProperties);
    refEntry.target = targetProperties; // the placeholder wasn't used, replace with the deserialized one
    return targetProperties; // no cycle, can just use the returned read object
};
currentExtensions[40010] = (id) => {
    // pointer extension (for structured clones)
    let refEntry = referenceMap.get(id);
    refEntry.used = true;
    return refEntry.target;
};
currentExtensions[258] = (array) => new Set(array); // https://github.com/input-output-hk/cbor-sets-spec/blob/master/CBOR_SETS.md
const standardMap = (read) => {
    // https://github.com/shanewholloway/js-cbor-codec/blob/master/docs/CBOR-259-spec
    // for decoding as a standard Map
    if (currentDecoder.mapsAsObjects) {
        currentDecoder.mapsAsObjects = false;
        restoreMapsAsObject = true;
    }
    return read();
};
standardMap.handlesRead = true;
currentExtensions[259] = standardMap;
function combine(a, b) {
    if (typeof a === 'string') {
        return a + b;
    }
    if (a instanceof Array) {
        return a.concat(b);
    }
    return Object.assign({}, a, b);
}
currentExtensionRanges.push((tag, input) => {
    if (tag >= 225 && tag <= 255) {
        return combine(packedValues.prefixes[tag - 224], input);
    }
    if (tag >= 28704 && tag <= 32767) {
        return combine(packedValues.prefixes[tag - 28672], input);
    }
    if (tag >= 1879052288 && tag <= 2147483647) {
        return combine(packedValues.prefixes[tag - 1879048192], input);
    }
    if (tag >= 216 && tag <= 223) {
        return combine(input, packedValues.suffixes[tag - 216]);
    }
    if (tag >= 27647 && tag <= 28671) {
        return combine(input, packedValues.suffixes[tag - 27639]);
    }
    if (tag >= 1811940352 && tag <= 1879048191) {
        return combine(input, packedValues.suffixes[tag - 1811939328]);
    }
});
const typedArrays = ['Uint8', 'Uint8Clamped', 'Uint16', 'Uint32', 'BigUint64', 'Int8', 'Int16', 'Int32', 'BigInt64', 'Float32', 'Float64'].map(type => type + 'Array');
const typedArrayTags = [64, 68, 69, 70, 71, 72, 77, 78, 79, 81, 82];
for (let i = 0; i < typedArrays.length; i++) {
    registerTypedArray(typedArrays[i], typedArrayTags[i]);
}
function registerTypedArray(typedArrayName, tag) {
    currentExtensions[tag] = (buffer) => {
        if (!typedArrayName) {
            throw new Error('Could not find typed array for code ' + tag);
        }
        // we have to always slice/copy here to get a new ArrayBuffer that is word/byte aligned
        return new glbl[typedArrayName](Uint8Array.prototype.slice.call(buffer, 0).buffer);
    };
}
function saveState(callback) {
    let savedSrcEnd = srcEnd;
    let savedPosition = position;
    let savedStringPosition = stringPosition;
    let savedSrcStringStart = srcStringStart;
    let savedSrcStringEnd = srcStringEnd;
    let savedSrcString = srcString;
    let savedStrings = strings;
    let savedReferenceMap = referenceMap;
    // TODO: We may need to revisit this if we do more external calls to user code (since it could be slow)
    let savedSrc = new Uint8Array(src.slice(0, srcEnd)); // we copy the data in case it changes while external data is processed
    let savedStructures = currentStructures;
    let savedDecoder = currentDecoder;
    let savedSequentialMode = sequentialMode;
    let value = callback();
    srcEnd = savedSrcEnd;
    position = savedPosition;
    stringPosition = savedStringPosition;
    srcStringStart = savedSrcStringStart;
    srcStringEnd = savedSrcStringEnd;
    srcString = savedSrcString;
    strings = savedStrings;
    referenceMap = savedReferenceMap;
    src = savedSrc;
    sequentialMode = savedSequentialMode;
    currentStructures = savedStructures;
    currentDecoder = savedDecoder;
    dataView = new DataView(src.buffer, src.byteOffset, src.byteLength);
    return value;
}
function clearSource() {
    src = null;
    referenceMap = null;
    currentStructures = null;
}
function addExtension(extension) {
    currentExtensions[extension.tag] = extension.decode;
}
const mult10 = new Array(147); // this is a table matching binary exponents to the multiplier to determine significant digit rounding
for (let i = 0; i < 256; i++) {
    mult10[i] = +('1e' + Math.floor(45.15 - i * 0.30103));
}
let defaultDecoder = new Decoder({ useRecords: false });
const decode = defaultDecoder.decode;
const decodeMultiple = defaultDecoder.decodeMultiple;
let f32Array = new Float32Array(1);
let u8Array = new Uint8Array(f32Array.buffer, 0, 4);
function roundFloat32(float32Number) {
    f32Array[0] = float32Number;
    let multiplier = mult10[((u8Array[3] & 0x7f) << 1) | (u8Array[2] >> 7)];
    return ((multiplier * float32Number + (float32Number > 0 ? 0.5 : -0.5)) >> 0) / multiplier;
}

let textEncoder;
try {
    textEncoder = new TextEncoder();
}
catch (error) { }
let extensions, extensionClasses;
// const hasNodeBuffer = typeof Buffer !== 'undefined';
const ByteArrayAllocate = /*hasNodeBuffer ? */ Buffer.allocUnsafeSlow /* : Uint8Array*/;
const ByteArray = /*hasNodeBuffer ? */ Buffer /* : Uint8Array*/;
const RECORD_STARTING_ID_PREFIX = 0x69; // tag 105/0x69
const MAX_STRUCTURES = 0x100;
const MAX_BUFFER_SIZE = /*hasNodeBuffer ? */ 0x100000000 /* : 0x7fd00000*/;
// let serializationId = 1;
let target;
let targetView;
let position$1 = 0;
let safeEnd;
const RECORD_SYMBOL = Symbol('record-id');
class Encoder extends Decoder {
    constructor(options) {
        super(options);
        this.offset = 0;
        // this.offset = 0;
        // let typeBuffer;
        let start;
        let sharedStructures;
        let hasSharedUpdate;
        let structures;
        let referenceMap;
        options = options || {};
        let lastSharedStructuresLength = 0;
        // let encodeUtf8 = hasNodeBuffer ? Buffer : Uint8Array;
        let encodeUtf8 = (textEncoder && textEncoder.encodeInto)
            ? function (string, position) {
                return textEncoder.encodeInto(string, target.subarray(position)).written;
            }
            : false;
        // : function(string, position, maxBytes) {
        // 		return target.utf8Write(string, position, maxBytes)
        // 	}
        // let encodeUtf8 = ByteArray.prototype.utf8Write
        // 	? function(string, position, maxBytes) {
        // 			return target.utf8Write(string, position, maxBytes)
        // 		}
        // 	: (textEncoder && textEncoder.encodeInto)
        // 		? function(string, position) {
        // 				return textEncoder.encodeInto(string, target.subarray(position)).written
        // 			}
        // 		: false;
        let encoder = this;
        let maxSharedStructures = 64;
        let isSequential = options.sequential;
        if (isSequential) {
            maxSharedStructures = 0;
            this.structures = [];
        }
        let samplingPackedValues, packedObjectMap, sharedValues = options.sharedValues;
        let sharedPackedObjectMap;
        if (sharedValues) {
            sharedPackedObjectMap = Object.create(null);
            for (let i = 0, l = sharedValues.length; i < l; i++) {
                sharedPackedObjectMap[sharedValues[i]] = i;
            }
        }
        let recordIdsToRemove = [];
        let transitionsCount = 0;
        let serializationsSinceTransitionRebuild = 0;
        this.encode = function (value, encodeOptions) {
            if (!target) {
                target = ByteArrayAllocate(8192);
                targetView = new DataView(target.buffer, 0, 8192);
                position$1 = 0;
            }
            safeEnd = target.length - 10;
            if (safeEnd - position$1 < 0x800) {
                // don't start too close to the end,
                target = ByteArrayAllocate(target.length);
                targetView = new DataView(target.buffer, 0, target.length);
                safeEnd = target.length - 10;
                position$1 = 0;
            }
            else if (encodeOptions === REUSE_BUFFER_MODE) {
                position$1 = (position$1 + 7) & 0x7ffffff8; // Word align to make any future copying of this buffer faster
            }
            start = position$1;
            referenceMap = encoder.structuredClone ? new Map() : null;
            sharedStructures = encoder.structures;
            if (sharedStructures) {
                if (sharedStructures.uninitialized) {
                    encoder.structures = sharedStructures = encoder.getStructures();
                }
                let sharedStructuresLength = sharedStructures.length;
                if (sharedStructuresLength > maxSharedStructures && !isSequential) {
                    sharedStructuresLength = maxSharedStructures;
                }
                if (!sharedStructures.transitions) {
                    // rebuild our structure transitions
                    sharedStructures.transitions = Object.create(null);
                    for (let i = 0; i < sharedStructuresLength; i++) {
                        let keys = sharedStructures[i];
                        if (!keys) {
                            continue;
                        }
                        let nextTransition, transition = sharedStructures.transitions;
                        for (let j = 0, l = keys.length; j < l; j++) {
                            let key = keys[j];
                            nextTransition = transition[key];
                            if (!nextTransition) {
                                nextTransition = transition[key] = Object.create(null);
                            }
                            transition = nextTransition;
                        }
                        transition[RECORD_SYMBOL] = i;
                    }
                    lastSharedStructuresLength = sharedStructures.length;
                }
                if (!isSequential) {
                    sharedStructures.nextId = sharedStructuresLength;
                }
            }
            if (hasSharedUpdate) {
                hasSharedUpdate = false;
            }
            structures = sharedStructures || [];
            packedObjectMap = sharedPackedObjectMap;
            if (options.pack) {
                let packedValues = new Map();
                // @ts-ignore
                packedValues.values = [];
                // @ts-ignore
                packedValues.encoder = encoder;
                // @ts-ignore
                packedValues.maxValues = options.maxPrivatePackedValues || (sharedPackedObjectMap ? 16 : Infinity);
                // @ts-ignore
                packedValues.objectMap = sharedPackedObjectMap || false;
                // @ts-ignore
                packedValues.samplingPackedValues = samplingPackedValues;
                findRepetitiveStrings(value, packedValues);
                if (packedValues.values.length > 0) {
                    target[position$1++] = 0xd8; // one-byte tag
                    target[position$1++] = 51; // tag 51 for packed shared structures https://www.potaroo.net/ietf/ids/draft-ietf-cbor-packed-03.txt
                    writeArrayHeader(4);
                    let valuesArray = packedValues.values;
                    encode(valuesArray);
                    writeArrayHeader(0); // prefixes
                    writeArrayHeader(0); // suffixes
                    packedObjectMap = Object.create(sharedPackedObjectMap || null);
                    for (let i = 0, l = valuesArray.length; i < l; i++) {
                        packedObjectMap[valuesArray[i]] = i;
                    }
                }
            }
            try {
                encode(value);
                encoder.offset = position$1; // update the offset so next serialization doesn't write over our buffer, but can continue writing to same buffer sequentially
                if (referenceMap && referenceMap.idsToInsert) {
                    position$1 += referenceMap.idsToInsert.length * 8;
                    if (position$1 > safeEnd) {
                        makeRoom(position$1);
                    }
                    encoder.offset = position$1;
                    let serialized = insertIds(target.subarray(start, position$1), referenceMap.idsToInsert);
                    referenceMap = null;
                    return serialized;
                }
                if (encodeOptions === REUSE_BUFFER_MODE) {
                    target.start = start;
                    target.end = position$1;
                    return target;
                }
                return target.subarray(start, position$1); // position can change if we call pack again in saveStructures, so we get the buffer now
            }
            finally {
                if (sharedStructures) {
                    if (serializationsSinceTransitionRebuild < 10) {
                        serializationsSinceTransitionRebuild++;
                    }
                    if (transitionsCount > 10000) {
                        // force a rebuild occasionally after a lot of transitions so it can get cleaned up
                        sharedStructures.transitions = null;
                        serializationsSinceTransitionRebuild = 0;
                        transitionsCount = 0;
                        if (recordIdsToRemove.length > 0) {
                            recordIdsToRemove = [];
                        }
                    }
                    else if (recordIdsToRemove.length > 0 && !isSequential) {
                        for (let i = 0, l = recordIdsToRemove.length; i < l; i++) {
                            recordIdsToRemove[i][RECORD_SYMBOL] = undefined;
                        }
                        recordIdsToRemove = [];
                    }
                    if (hasSharedUpdate && encoder.saveStructures) {
                        if (encoder.structures.length > maxSharedStructures) {
                            encoder.structures = encoder.structures.slice(0, maxSharedStructures);
                        }
                        // we can't rely on start/end with REUSE_BUFFER_MODE since they will (probably) change when we save
                        let returnBuffer = target.subarray(start, position$1);
                        let shared = encoder.structures || [];
                        if (sharedValues) {
                            shared = shared.concat(sharedValues);
                        }
                        if (encoder.saveStructures(encoder.structures, lastSharedStructuresLength) === false) {
                            // get updated structures and try again if the update failed
                            encoder.structures = encoder.getStructures() || [];
                            return encoder.encode(value);
                        }
                        lastSharedStructuresLength = shared.length;
                        return returnBuffer;
                    }
                }
            }
        };
        this.findCommonStringsToPack = () => {
            samplingPackedValues = new Map();
            if (!sharedPackedObjectMap) {
                sharedPackedObjectMap = Object.create(null);
            }
            return ({ threshold }) => {
                threshold = threshold || 4;
                let position = this.pack ? options.maxPrivatePackedValues || 16 : 0;
                if (!sharedValues) {
                    sharedValues = this.sharedValues = [];
                }
                for (let [key, status] of samplingPackedValues) {
                    if (status.count > threshold) {
                        sharedPackedObjectMap[key] = position++;
                        sharedValues.push(key);
                        hasSharedUpdate = true;
                    }
                }
                samplingPackedValues = null;
            };
        };
        const encode = (value) => {
            if (position$1 > safeEnd) {
                target = makeRoom(position$1);
            }
            const type = typeof value;
            let length;
            if (type === 'string') {
                if (packedObjectMap) {
                    let packedPosition = packedObjectMap[value];
                    if (packedPosition >= 0) {
                        if (packedPosition < 16) {
                            target[position$1++] = packedPosition + 0xe0; // simple values, defined in https://www.potaroo.net/ietf/ids/draft-ietf-cbor-packed-03.txt
                        }
                        else {
                            target[position$1++] = 0xc6; // tag 6 defined in https://www.potaroo.net/ietf/ids/draft-ietf-cbor-packed-03.txt
                            if (packedPosition & 1) {
                                encode((15 - packedPosition) >> 1);
                            }
                            else {
                                encode((packedPosition - 16) >> 1);
                            }
                        }
                        return;
                        /*						} else if (packedStatus.serializationId != serializationId) {
                                                    packedStatus.serializationId = serializationId
                                                    packedStatus.count = 1
                                                    if (options.sharedPack) {
                                                        let sharedCount = packedStatus.sharedCount = (packedStatus.sharedCount || 0) + 1
                                                        if (shareCount > (options.sharedPack.threshold || 5)) {
                                                            let sharedPosition = packedStatus.position = packedStatus.nextSharedPosition
                                                            hasSharedUpdate = true
                                                            if (sharedPosition < 16)
                                                                target[position++] = sharedPosition + 0xc0
                        
                                                        }
                                                    }
                                                } // else any in-doc incrementation?*/
                    }
                    else if (samplingPackedValues && !options.pack) {
                        let status = samplingPackedValues.get(value);
                        if (status) {
                            status.count++;
                        }
                        else {
                            samplingPackedValues.set(value, {
                                count: 1,
                            });
                        }
                    }
                }
                let strLength = value.length;
                let headerSize;
                // first we estimate the header size, so we can write to the correct location
                if (strLength < 0x20) {
                    headerSize = 1;
                }
                else if (strLength < 0x100) {
                    headerSize = 2;
                }
                else if (strLength < 0x10000) {
                    headerSize = 3;
                }
                else {
                    headerSize = 5;
                }
                let maxBytes = strLength * 3;
                if (position$1 + maxBytes > safeEnd) {
                    target = makeRoom(position$1 + maxBytes);
                }
                if (strLength < 0x40 || encodeUtf8 === false) {
                    let i, c1, c2, strPosition = position$1 + headerSize;
                    for (i = 0; i < strLength; i++) {
                        c1 = value.charCodeAt(i);
                        if (c1 < 0x80) {
                            target[strPosition++] = c1;
                        }
                        else if (c1 < 0x800) {
                            target[strPosition++] = c1 >> 6 | 0xc0;
                            target[strPosition++] = c1 & 0x3f | 0x80;
                        }
                        else if ((c1 & 0xfc00) === 0xd800 &&
                            ((c2 = value.charCodeAt(i + 1)) & 0xfc00) === 0xdc00) {
                            c1 = 0x10000 + ((c1 & 0x03ff) << 10) + (c2 & 0x03ff);
                            i++;
                            target[strPosition++] = c1 >> 18 | 0xf0;
                            target[strPosition++] = c1 >> 12 & 0x3f | 0x80;
                            target[strPosition++] = c1 >> 6 & 0x3f | 0x80;
                            target[strPosition++] = c1 & 0x3f | 0x80;
                        }
                        else {
                            target[strPosition++] = c1 >> 12 | 0xe0;
                            target[strPosition++] = c1 >> 6 & 0x3f | 0x80;
                            target[strPosition++] = c1 & 0x3f | 0x80;
                        }
                    }
                    length = strPosition - position$1 - headerSize;
                }
                else {
                    // @ts-ignore
                    length = encodeUtf8(value, position$1 + headerSize, maxBytes);
                }
                if (length < 0x18) {
                    target[position$1++] = 0x60 | length;
                }
                else if (length < 0x100) {
                    if (headerSize < 2) {
                        target.copyWithin(position$1 + 2, position$1 + 1, position$1 + 1 + length);
                    }
                    target[position$1++] = 0x78;
                    target[position$1++] = length;
                }
                else if (length < 0x10000) {
                    if (headerSize < 3) {
                        target.copyWithin(position$1 + 3, position$1 + 2, position$1 + 2 + length);
                    }
                    target[position$1++] = 0x79;
                    target[position$1++] = length >> 8;
                    target[position$1++] = length & 0xff;
                }
                else {
                    if (headerSize < 5) {
                        target.copyWithin(position$1 + 5, position$1 + 3, position$1 + 3 + length);
                    }
                    target[position$1++] = 0x7a;
                    targetView.setUint32(position$1, length);
                    position$1 += 4;
                }
                position$1 += length;
            }
            else if (type === 'number') {
                if (value >>> 0 === value) { // positive integer, 32-bit or less
                    // positive uint
                    if (value < 0x18) {
                        target[position$1++] = value;
                    }
                    else if (value < 0x100) {
                        target[position$1++] = 0x18;
                        target[position$1++] = value;
                    }
                    else if (value < 0x10000) {
                        target[position$1++] = 0x19;
                        target[position$1++] = value >> 8;
                        target[position$1++] = value & 0xff;
                    }
                    else {
                        target[position$1++] = 0x1a;
                        targetView.setUint32(position$1, value);
                        position$1 += 4;
                    }
                }
                else if (value >> 0 === value) { // negative integer
                    if (value >= -0x18) {
                        target[position$1++] = 0x1f - value;
                    }
                    else if (value >= -0x100) {
                        target[position$1++] = 0x38;
                        target[position$1++] = ~value;
                    }
                    else if (value >= -0x10000) {
                        target[position$1++] = 0x39;
                        targetView.setUint16(position$1, ~value);
                        position$1 += 2;
                    }
                    else {
                        target[position$1++] = 0x3a;
                        targetView.setUint32(position$1, ~value);
                        position$1 += 4;
                    }
                }
                else {
                    let useFloat32;
                    if ((useFloat32 = this.useFloat32) > 0 && value < 0x100000000 && value >= -0x80000000) {
                        target[position$1++] = 0xfa;
                        targetView.setFloat32(position$1, value);
                        let xShifted;
                        if (useFloat32 < 4 ||
                            // this checks for rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
                            ((xShifted = value * mult10[((target[position$1] & 0x7f) << 1) | (target[position$1 + 1] >> 7)]) >> 0) === xShifted) {
                            position$1 += 4;
                            return;
                        }
                        else {
                            position$1--; // move back into position for writing a double
                        }
                    }
                    target[position$1++] = 0xfb;
                    targetView.setFloat64(position$1, value);
                    position$1 += 8;
                }
            }
            else if (type === 'object') {
                if (!value) {
                    target[position$1++] = 0xf6;
                }
                else {
                    if (referenceMap) {
                        let referee = referenceMap.get(value);
                        if (referee) {
                            if (!referee.id) {
                                let idsToInsert = referenceMap.idsToInsert || (referenceMap.idsToInsert = []);
                                referee.id = idsToInsert.push(referee);
                            }
                            target[position$1++] = 0xd9;
                            target[position$1++] = 40010 >> 8;
                            target[position$1++] = 40010 & 0xff;
                            target[position$1++] = 0x1a; // uint32
                            targetView.setUint32(position$1, referee.id);
                            position$1 += 4;
                            return;
                        }
                        else {
                            referenceMap.set(value, { offset: position$1 - start });
                        }
                    }
                    let constructor = value.constructor;
                    if (constructor === Object) {
                        writeObject(value, true);
                    }
                    else if (constructor === Array) {
                        length = value.length;
                        if (length < 0x18) {
                            target[position$1++] = 0x80 | length;
                        }
                        else {
                            writeArrayHeader(length);
                        }
                        for (let i = 0; i < length; i++) {
                            encode(value[i]);
                        }
                    }
                    else if (constructor === Map) {
                        if (this.mapsAsObjects ? this.useTag259ForMaps !== false : this.useTag259ForMaps) {
                            // use Tag 259 (https://github.com/shanewholloway/js-cbor-codec/blob/master/docs/CBOR-259-spec--explicit-maps.md) for maps if the user wants it that way
                            target[position$1++] = 0xd9;
                            target[position$1++] = 1;
                            target[position$1++] = 3;
                        }
                        length = value.size;
                        if (length < 0x18) {
                            target[position$1++] = 0xa0 | length;
                        }
                        else if (length < 0x100) {
                            target[position$1++] = 0xb8;
                            target[position$1++] = length;
                        }
                        else if (length < 0x10000) {
                            target[position$1++] = 0xb9;
                            target[position$1++] = length >> 8;
                            target[position$1++] = length & 0xff;
                        }
                        else {
                            target[position$1++] = 0xba;
                            targetView.setUint32(position$1, length);
                            position$1 += 4;
                        }
                        for (let [key, entryValue] of value) {
                            encode(key);
                            encode(entryValue);
                        }
                    }
                    else {
                        for (let i = 0, l = extensions.length; i < l; i++) {
                            let extensionClass = extensionClasses[i];
                            if (value instanceof extensionClass) {
                                let extension = extensions[i];
                                let tag = extension.tag;
                                if (tag < 0x18) {
                                    target[position$1++] = 0xc0 | tag;
                                }
                                else if (tag < 0x100) {
                                    target[position$1++] = 0xd8;
                                    target[position$1++] = tag;
                                }
                                else if (tag < 0x10000) {
                                    target[position$1++] = 0xd9;
                                    target[position$1++] = tag >> 8;
                                    target[position$1++] = tag & 0xff;
                                }
                                else if (tag > -1) {
                                    target[position$1++] = 0xda;
                                    targetView.setUint32(position$1, tag);
                                    position$1 += 4;
                                } // else undefined, don't write tag
                                extension.encode.call(this, value, encode, makeRoom);
                                return;
                            }
                        }
                        if (value[Symbol.iterator]) {
                            target[position$1++] = 0x9f; // indefinite length array
                            for (let entry of value) {
                                encode(entry);
                            }
                            target[position$1++] = 0xff; // stop-code
                            return;
                        }
                        // no extension found, write as object
                        writeObject(value, !value.hasOwnProperty); // if it doesn't have hasOwnProperty, don't do hasOwnProperty checks
                    }
                }
            }
            else if (type === 'boolean') {
                target[position$1++] = value ? 0xf5 : 0xf4;
            }
            else if (type === 'bigint') {
                if (value < (BigInt(1) << BigInt(64)) && value >= 0) {
                    // use an unsigned int as long as it fits
                    target[position$1++] = 0x1b;
                    targetView.setBigUint64(position$1, value);
                }
                else if (value > -(BigInt(1) << BigInt(64)) && value < 0) {
                    // if we can fit an unsigned int, use that
                    target[position$1++] = 0x3b;
                    // @ts-ignore
                    targetView.setBigUint64(position$1, -value - BigInt(1));
                }
                else {
                    // overflow
                    if (this.largeBigIntToFloat) {
                        target[position$1++] = 0xfb;
                        targetView.setFloat64(position$1, Number(value));
                    }
                    else {
                        throw new RangeError(value + ' was too large to fit in CBOR 64-bit integer format, set largeBigIntToFloat to convert to float-64');
                    }
                }
                position$1 += 8;
            }
            else if (type === 'undefined') {
                target[position$1++] = 0xf7;
            }
            else {
                throw new Error('Unknown type: ' + type);
            }
        };
        const writeObject = this.useRecords === false ? this.variableMapSize ? (object) => {
            // this method is slightly slower, but generates "preferred serialization" (optimally small for smaller objects)
            let keys = Object.keys(object);
            let length = keys.length;
            if (length < 0x18) {
                target[position$1++] = 0xa0 | length;
            }
            else if (length < 0x100) {
                target[position$1++] = 0xb8;
                target[position$1++] = length;
            }
            else if (length < 0x10000) {
                target[position$1++] = 0xb9;
                target[position$1++] = length >> 8;
                target[position$1++] = length & 0xff;
            }
            else {
                target[position$1++] = 0xba;
                targetView.setUint32(position$1, length);
                position$1 += 4;
            }
            let key;
            for (let i = 0; i < length; i++) {
                encode(key = keys[i]);
                encode(object[key]);
            }
        } :
            (object, safePrototype) => {
                target[position$1++] = 0xb9; // always use map 16, so we can preallocate and set the length afterwards
                let objectOffset = position$1 - start;
                position$1 += 2;
                let size = 0;
                for (let key in object) {
                    if (safePrototype || object.hasOwnProperty(key)) {
                        encode(key);
                        encode(object[key]);
                        size++;
                    }
                }
                target[objectOffset++ + start] = size >> 8;
                target[objectOffset + start] = size & 0xff;
            } :
            /*	sharedStructures ?  // For highly stable structures, using for-in can a little bit faster
                (object, safePrototype) => {
                    let nextTransition, transition = structures.transitions || (structures.transitions = Object.create(null))
                    let objectOffset = position++ - start
                    let wroteKeys
                    for (let key in object) {
                        if (safePrototype || object.hasOwnProperty(key)) {
                            nextTransition = transition[key]
                            if (!nextTransition) {
                                nextTransition = transition[key] = Object.create(null)
                                nextTransition.__keys__ = (transition.__keys__ || []).concat([key])
                                /*let keys = Object.keys(object)
                                if
                                let size = 0
                                let startBranch = transition.__keys__ ? transition.__keys__.length : 0
                                for (let i = 0, l = keys.length; i++) {
                                    let key = keys[i]
                                    size += key.length << 2
                                    if (i >= startBranch) {
                                        nextTransition = nextTransition[key] = Object.create(null)
                                        nextTransition.__keys__ = keys.slice(0, i + 1)
                                    }
                                }
                                makeRoom(position + size)
                                nextTransition = transition[key]
                                target.copy(target, )
                                objectOffset
                            }
                            transition = nextTransition
                            encode(object[key])
                        }
                    }
                    let id = transition.id
                    if (!id) {
                        id = transition.id = structures.push(transition.__keys__) + 63
                        if (sharedStructures.onUpdate)
                            sharedStructures.onUpdate(id, transition.__keys__)
                    }
                    target[objectOffset + start] = id
                }*/
            (object) => {
                let keys = Object.keys(object);
                let nextTransition, transition = structures.transitions || (structures.transitions = Object.create(null));
                let newTransitions = 0;
                let length = keys.length;
                for (let i = 0; i < length; i++) {
                    let key = keys[i];
                    nextTransition = transition[key];
                    if (!nextTransition) {
                        nextTransition = transition[key] = Object.create(null);
                        newTransitions++;
                    }
                    transition = nextTransition;
                }
                let recordId = transition[RECORD_SYMBOL];
                if (recordId !== undefined) {
                    target[position$1++] = 0xd9; // tag two byte
                    target[position$1++] = RECORD_STARTING_ID_PREFIX;
                    target[position$1++] = recordId;
                }
                else {
                    recordId = structures.nextId++;
                    if (!recordId) {
                        recordId = 0;
                        structures.nextId = 1;
                    }
                    if (recordId >= MAX_STRUCTURES) { // cycle back around
                        structures.nextId = (recordId = maxSharedStructures) + 1;
                    }
                    transition[RECORD_SYMBOL] = recordId;
                    structures[recordId] = keys;
                    if (sharedStructures && sharedStructures.length <= maxSharedStructures) {
                        target[position$1++] = 0xd9; // tag two byte
                        target[position$1++] = RECORD_STARTING_ID_PREFIX;
                        target[position$1++] = recordId; // tag number
                        hasSharedUpdate = true;
                    }
                    else {
                        target[position$1++] = 0xd8;
                        target[position$1++] = RECORD_STARTING_ID_PREFIX;
                        if (newTransitions) {
                            transitionsCount += serializationsSinceTransitionRebuild * newTransitions;
                        }
                        // record the removal of the id, we can maintain our shared structure
                        if (recordIdsToRemove.length >= MAX_STRUCTURES - maxSharedStructures) {
                            recordIdsToRemove.shift()[RECORD_SYMBOL] = undefined; // we are cycling back through, and have to remove old ones
                        }
                        recordIdsToRemove.push(transition);
                        writeArrayHeader(length + 2);
                        encode(keys);
                        target[position$1++] = 0x19; // uint16
                        target[position$1++] = RECORD_STARTING_ID_PREFIX;
                        target[position$1++] = recordId;
                        // now write the values
                        for (let i = 0; i < length; i++) {
                            encode(object[keys[i]]);
                        }
                        return;
                    }
                }
                if (length < 0x18) { // write the array header
                    target[position$1++] = 0x80 | length;
                }
                else {
                    writeArrayHeader(length);
                }
                for (let i = 0; i < length; i++) {
                    encode(object[keys[i]]);
                }
            };
        const makeRoom = (end) => {
            let newSize;
            if (end > 0x1000000) {
                // special handling for really large buffers
                if ((end - start) > MAX_BUFFER_SIZE) {
                    throw new Error('Encoded buffer would be larger than maximum buffer size');
                }
                newSize = Math.min(MAX_BUFFER_SIZE, Math.round(Math.max((end - start) * (end > 0x4000000 ? 1.25 : 2), 0x400000) / 0x1000) * 0x1000);
            }
            else { // faster handling for smaller buffers
                newSize = ((Math.max((end - start) << 2, target.length - 1) >> 12) + 1) << 12;
            }
            let newBuffer = ByteArrayAllocate(newSize);
            targetView = new DataView(newBuffer.buffer, 0, newSize);
            if (target.copy) {
                target.copy(newBuffer, 0, start, end);
            }
            else {
                newBuffer.set(target.slice(start, end));
            }
            position$1 -= start;
            start = 0;
            safeEnd = newBuffer.length - 10;
            return target = newBuffer;
        };
    }
    useBuffer(buffer) {
        // this means we are finished using our own buffer and we can write over it safely
        target = buffer;
        targetView = new DataView(target.buffer, target.byteOffset, target.byteLength);
        position$1 = 0;
    }
}
// function copyBinary(source, target, targetOffset, offset, endOffset) {
// 	while (offset < endOffset) {
// 		target[targetOffset++] = source[offset++]
// 	}
// }
function writeArrayHeader(length) {
    if (length < 0x18) {
        target[position$1++] = 0x80 | length;
    }
    else if (length < 0x100) {
        target[position$1++] = 0x98;
        target[position$1++] = length;
    }
    else if (length < 0x10000) {
        target[position$1++] = 0x99;
        target[position$1++] = length >> 8;
        target[position$1++] = length & 0xff;
    }
    else {
        target[position$1++] = 0x9a;
        targetView.setUint32(position$1, length);
        position$1 += 4;
    }
}
function findRepetitiveStrings(value, packedValues) {
    if (typeof value === 'string') {
        if (value.length > 3) {
            if (packedValues.objectMap[value] > -1 || packedValues.values.length >= packedValues.maxValues) {
                return;
            }
            let packedStatus = packedValues.get(value);
            if (packedStatus) {
                if (++packedStatus.count == 2) {
                    packedValues.values.push(value);
                }
            }
            else {
                packedValues.set(value, {
                    count: 1,
                });
                if (packedValues.samplingPackedValues) {
                    let status = packedValues.samplingPackedValues.get(value);
                    if (status) {
                        status.count++;
                    }
                    else {
                        packedValues.samplingPackedValues.set(value, {
                            count: 1,
                        });
                    }
                }
            }
        }
    }
    else {
        if (Array.isArray(value)) {
            for (let i = 0, l = value.length; i < l; i++) {
                findRepetitiveStrings(value[i], packedValues);
            }
        }
        else {
            let includeKeys = !packedValues.encoder.useRecords;
            for (var key in value) {
                if (value.hasOwnProperty(key)) {
                    if (includeKeys) {
                        findRepetitiveStrings(key, packedValues);
                    }
                    findRepetitiveStrings(value[key], packedValues);
                }
            }
        }
    }
}
extensionClasses = [
    Date, Set, Error, RegExp, ArrayBuffer, ByteArray,
    Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array,
    typeof BigUint64Array == 'undefined' ? function () { } : BigUint64Array,
    Int8Array, Int16Array, Int32Array,
    typeof BigInt64Array == 'undefined' ? function () { } : BigInt64Array,
    Float32Array, Float64Array
];
//Object.getPrototypeOf(Uint8Array.prototype).constructor /*TypedArray*/
extensions = [{
        tag: 1,
        encode(date, encode) {
            let seconds = date.getTime() / 1000;
            if ((this.useTimestamp32 || date.getMilliseconds() === 0) && seconds >= 0 && seconds < 0x100000000) {
                // Timestamp 32
                target[position$1++] = 0x1a;
                targetView.setUint32(position$1, seconds);
                position$1 += 4;
            }
            else {
                // Timestamp float64
                target[position$1++] = 0xfb;
                targetView.setFloat64(position$1, seconds);
                position$1 += 8;
            }
        }
    }, {
        tag: 258,
        encode(set, encode) {
            let array = Array.from(set);
            encode(array);
        }
    }, {
        tag: 27,
        encode(error, encode) {
            encode([error.name, error.message]);
        }
    }, {
        tag: 27,
        encode(regex, encode) {
            encode(['RegExp', regex.source, regex.flags]);
        }
    }, {
        encode(arrayBuffer, encode, makeRoom) {
            writeBuffer(arrayBuffer, makeRoom);
        }
    }, {
        encode(arrayBuffer, encode, makeRoom) {
            writeBuffer(arrayBuffer, makeRoom);
        }
    }, typedArrayEncoder(64),
    typedArrayEncoder(68),
    typedArrayEncoder(69),
    typedArrayEncoder(70),
    typedArrayEncoder(71),
    typedArrayEncoder(72),
    typedArrayEncoder(77),
    typedArrayEncoder(78),
    typedArrayEncoder(79),
    typedArrayEncoder(81),
    typedArrayEncoder(82)];
function typedArrayEncoder(tag) {
    return {
        tag: tag,
        encode: function writeExtBuffer(typedArray, encode) {
            let length = typedArray.byteLength;
            let offset = typedArray.byteOffset || 0;
            let buffer = typedArray.buffer || typedArray;
            encode(/*hasNodeBuffer ? */ Buffer.from(buffer, offset, length) /* :
                new Uint8Array(buffer, offset, length)*/);
        }
    };
}
function writeBuffer(buffer, makeRoom) {
    let length = buffer.byteLength;
    if (length < 0x18) {
        target[position$1++] = 0x40 + length;
    }
    else if (length < 0x100) {
        target[position$1++] = 0x58;
        target[position$1++] = length;
    }
    else if (length < 0x10000) {
        target[position$1++] = 0x59;
        target[position$1++] = length >> 8;
        target[position$1++] = length & 0xff;
    }
    else {
        target[position$1++] = 0x5a;
        targetView.setUint32(position$1, length);
        position$1 += 4;
    }
    if (position$1 + length >= target.length) {
        makeRoom(position$1 + length);
    }
    target.set(buffer, position$1);
    position$1 += length;
}
function insertIds(serialized, idsToInsert) {
    // insert the ids that need to be referenced for structured clones
    let nextId;
    let distanceToMove = idsToInsert.length * 8;
    let lastEnd = serialized.length - distanceToMove;
    idsToInsert.sort((a, b) => a.offset > b.offset ? 1 : -1);
    while (nextId = idsToInsert.pop()) {
        let offset = nextId.offset;
        let id = nextId.id;
        serialized.copyWithin(offset + distanceToMove, offset, lastEnd);
        distanceToMove -= 8;
        let position = offset + distanceToMove;
        serialized[position++] = 0xd9;
        serialized[position++] = 40009 >> 8;
        serialized[position++] = 40009 & 0xff;
        serialized[position++] = 0x1a; // uint32
        serialized[position++] = id >> 24;
        serialized[position++] = (id >> 16) & 0xff;
        serialized[position++] = (id >> 8) & 0xff;
        serialized[position++] = id & 0xff;
        lastEnd = offset;
    }
    return serialized;
}
function addExtension$1(extension) {
    if (extension.Class) {
        if (!extension.encode) {
            throw new Error('Extension has no encode function');
        }
        extensionClasses.unshift(extension.Class);
        extensions.unshift(extension);
    }
    addExtension(extension);
}
let defaultEncoder = new Encoder({ useRecords: false });
const encode = defaultEncoder.encode;
const { NEVER, ALWAYS, DECIMAL_ROUND, DECIMAL_FIT } = exports.FLOAT32_OPTIONS;
const REUSE_BUFFER_MODE = 1000;

class EncoderStream extends stream.Transform {
    constructor(options) {
        if (!options) {
            options = {};
        }
        options.writableObjectMode = true;
        super(options);
        options.sequential = true;
        this.encoder = options.encoder || new Encoder(options);
    }
    _transform(value, encoding, callback) {
        this.push(this.encoder.encode(value));
        callback();
    }
}
class DecoderStream extends stream.Transform {
    constructor(options) {
        if (!options) {
            options = {};
        }
        options.objectMode = true;
        super(options);
        options.structures = [];
        this.decoder = options.decoder || new Decoder(options);
    }
    _transform(chunk, encoding, callback) {
        if (this.incompleteBuffer) {
            chunk = Buffer.concat([this.incompleteBuffer, chunk]);
            this.incompleteBuffer = null;
        }
        let values;
        try {
            values = this.decoder.decodeMultiple(chunk, undefined);
        }
        catch (error) {
            if (error.incomplete) {
                this.incompleteBuffer = chunk.slice(error.lastPosition);
                values = error.values;
            }
            else {
                throw error;
            }
        }
        finally {
            for (let value of values || []) {
                if (value === null) {
                    value = this.getNullValue();
                }
                this.push(value);
            }
        }
        if (callback) {
            callback();
        }
    }
    getNullValue() {
        return Symbol.for(null);
    }
}

/**
 * Given an Iterable first argument, returns an Iterable where each value is encoded as a Buffer
 * If the argument is only Async Iterable, the return value will be an Async Iterable.
 * @param {Iterable|Iterator|AsyncIterable|AsyncIterator} objectIterator - iterable source, like a Readable object stream, an array, Set, or custom object
 * @param {options} [options] - cbor-x Encoder options
 * @returns {IterableIterator|Promise.<AsyncIterableIterator>}
 */
function encodeIter(objectIterator, options = {}) {
    if (!objectIterator || typeof objectIterator !== 'object') {
        throw new Error('first argument must be an Iterable, Async Iterable, or a Promise for an Async Iterable');
    }
    else if (typeof objectIterator[Symbol.iterator] === 'function') {
        return encodeIterSync(objectIterator, options);
    }
    else if (typeof objectIterator.then === 'function' || typeof objectIterator[Symbol.asyncIterator] === 'function') {
        return encodeIterAsync(objectIterator, options);
    }
    else {
        throw new Error('first argument must be an Iterable, Async Iterable, Iterator, Async Iterator, or a Promise');
    }
}
function* encodeIterSync(objectIterator, options) {
    const encoder = new Encoder(options);
    for (const value of objectIterator) {
        yield encoder.encode(value);
    }
}
async function* encodeIterAsync(objectIterator, options) {
    const encoder = new Encoder(options);
    for await (const value of objectIterator) {
        yield encoder.encode(value);
    }
}
/**
 * Given an Iterable/Iterator input which yields buffers, returns an IterableIterator which yields sync decoded objects
 * Or, given an Async Iterable/Iterator which yields promises resolving in buffers, returns an AsyncIterableIterator.
 * @param {Iterable|Iterator|AsyncIterable|AsyncIterableIterator} bufferIterator
 * @param {object} [options] - Decoder options
 * @returns {IterableIterator|Promise.<AsyncIterableIterator}
 */
function decodeIter(bufferIterator, options = {}) {
    if (!bufferIterator || typeof bufferIterator !== 'object') {
        throw new Error('first argument must be an Iterable, Async Iterable, Iterator, Async Iterator, or a promise');
    }
    const decoder = new Decoder(options);
    let incomplete;
    const parser = (chunk) => {
        let yields;
        // if there's incomplete data from previous chunk, concatinate and try again
        if (incomplete) {
            chunk = Buffer.concat([incomplete, chunk]);
            incomplete = undefined;
        }
        try {
            yields = decoder.decodeMultiple(chunk, undefined);
        }
        catch (err) {
            if (err.incomplete) {
                incomplete = chunk.slice(err.lastPosition);
                yields = err.values;
            }
            else {
                throw err;
            }
        }
        return yields;
    };
    if (typeof bufferIterator[Symbol.iterator] === 'function') {
        return (function* iter() {
            for (const value of bufferIterator) {
                yield* parser(value);
            }
        })();
    }
    else if (typeof bufferIterator[Symbol.asyncIterator] === 'function') {
        return (async function* iter() {
            for await (const value of bufferIterator) {
                yield* parser(value);
            }
        })();
    }
}

const useRecords = false;
const mapsAsObjects = true;
const extractor = tryRequire('cbor-extract');
if (extractor) {
    setExtractor(extractor.extractStrings);
}
function tryRequire(moduleId) {
    try {
        // @ts-ignore
        let require$1 = module$1.createRequire((typeof document === 'undefined' ? new (require('u' + 'rl').URL)('file:' + __filename).href : (document.currentScript && document.currentScript.src || new URL('node.cjs', document.baseURI).href)));
        return require$1(moduleId);
    }
    catch (error) {
        if (typeof window != 'undefined') {
            console.warn('For browser usage, directly use cbor-x/decode or cbor-x/encode modules. ' + error.message.split('\n')[0]);
        }
    }
}

exports.ALWAYS = ALWAYS;
exports.DECIMAL_FIT = DECIMAL_FIT;
exports.DECIMAL_ROUND = DECIMAL_ROUND;
exports.Decoder = Decoder;
exports.DecoderStream = DecoderStream;
exports.Encoder = Encoder;
exports.EncoderStream = EncoderStream;
exports.NEVER = NEVER;
exports.REUSE_BUFFER_MODE = REUSE_BUFFER_MODE;
exports.Tag = Tag;
exports.addExtension = addExtension$1;
exports.clearSource = clearSource;
exports.decode = decode;
exports.decodeIter = decodeIter;
exports.decodeMultiple = decodeMultiple;
exports.encode = encode;
exports.encodeIter = encodeIter;
exports.mapsAsObjects = mapsAsObjects;
exports.roundFloat32 = roundFloat32;
exports.setExtractor = setExtractor;
exports.useRecords = useRecords;
