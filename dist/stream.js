import { Transform } from 'stream';
import { Encoder } from './encode';
import { Decoder } from './decode.js';
export class EncoderStream extends Transform {
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
export class DecoderStream extends Transform {
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
//# sourceMappingURL=stream.js.map