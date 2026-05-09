export const Validators = {
    validatePassword: (password: string) => {
        if (!password || typeof password !== 'string') return false;
        if (password.length < 8) return false;
        return true;
    },
    validateAddress: (address: string) => {
        return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address);
    },
    validateJWT: (jwt: string) => {
        if (!jwt || typeof jwt !== 'string') return false;
        return jwt.trim().length > 20;
    },
    validateFileSize: (file: File, maxSize = 104857600) => {
        return file && file.size <= maxSize;
    },
    validateCID: (cid: string) => {
        if (!cid || typeof cid !== 'string') return false;
        return cid.trim().length > 0;
    }
};

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

const bufferToHex = (buf: ArrayBuffer | Uint8Array): string => {
    const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
};

const hexToBuffer = (hex: string): Uint8Array => {
    try {
        const matched = hex.match(/.{1,2}/g);
        if (!matched) throw new Error('Invalid hex format');
        return new Uint8Array(matched.map(byte => parseInt(byte, 16)));
    } catch (_e) {
        throw new Error('Invalid hex format', { cause: _e });
    }
};

const readFileChunk = (file: File, start: number, length: number): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file.slice(start, start + length));
    });
};

export const CryptoUtils = {
    bufferToHex,
    hexToBuffer,
    
    encryptString: async (text: string, password: string): Promise<string> => {
        if (!Validators.validatePassword(password)) {
            throw new Error('Password must be at least 8 characters');
        }
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const keyMaterial = await crypto.subtle.importKey(
            "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
        );
        const key = await crypto.subtle.deriveKey(
            { 
                name: "PBKDF2", 
                salt: salt as unknown as BufferSource,
                iterations: 600000,
                hash: "SHA-256" 
            },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
        );
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(text));
        return bufferToHex(salt) + bufferToHex(iv) + bufferToHex(encrypted);
    },
    
    encryptFile: async (file: File, password: string): Promise<Uint8Array> => {
        if (!Validators.validatePassword(password)) {
            throw new Error('Password must be at least 8 characters');
        }
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const keyMaterial = await crypto.subtle.importKey(
            "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
        );
        const key = await crypto.subtle.deriveKey(
            { 
                name: "PBKDF2", 
                salt: salt as unknown as BufferSource,
                iterations: 600000,
                hash: "SHA-256" 
            },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
        );

        const totalLength = file.size;
        const numChunks = Math.ceil(totalLength / CHUNK_SIZE);
        const ivs: Uint8Array[] = [];
        const encryptedChunks: Uint8Array[] = [];

        for (let i = 0; i < numChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, totalLength);
            const chunk = await readFileChunk(file, start, end - start);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            ivs.push(iv);
            const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, chunk);
            encryptedChunks.push(new Uint8Array(encrypted));
        }

        // Build the output: salt (16) + numChunks (4) + ivs (12*numChunks) + encryptedChunks
        const numChunksBuffer = new Uint32Array([numChunks]);
        const output = new Uint8Array(16 + 4 + 12 * numChunks + encryptedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
        let offset = 0;
        output.set(salt, offset); offset += 16;
        output.set(new Uint8Array(numChunksBuffer.buffer), offset); offset += 4;
        for (const iv of ivs) {
            output.set(iv, offset); offset += 12;
        }
        for (const chunk of encryptedChunks) {
            output.set(chunk, offset); offset += chunk.byteLength;
        }

        return output;
    },
    
    decryptString: async (hex: string, password: string): Promise<string> => {
        if (!Validators.validatePassword(password)) {
            throw new Error('Invalid password');
        }
        const salt = hexToBuffer(hex.slice(0, 32));
        const iv = hexToBuffer(hex.slice(32, 56));
        const encrypted = hexToBuffer(hex.slice(56));
        const keyMaterial = await crypto.subtle.importKey(
            "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
        );
        const key = await crypto.subtle.deriveKey(
            { 
                name: "PBKDF2", 
                salt: salt as unknown as BufferSource,
                iterations: 600000,
                hash: "SHA-256" 
            },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
        );
        const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, encrypted as unknown as BufferSource);
        return new TextDecoder().decode(decryptedBuffer);
    },
    decryptFile: async (file: File, password: string): Promise<Blob> => {
        if (!Validators.validatePassword(password)) {
            throw new Error('Invalid password');
        }
        const headerSize = 20; // salt + numChunks
        const header = await readFileChunk(file, 0, headerSize);
        const headerView = new Uint8Array(header);
        const salt = headerView.slice(0, 16);
        const numChunks = new Uint32Array(header.slice(16, 20))[0];

        const ivsSize = 12 * numChunks;
        const ivsBuffer = await readFileChunk(file, headerSize, ivsSize);
        const ivsView = new Uint8Array(ivsBuffer);
        const ivs: Uint8Array[] = [];
        for (let i = 0; i < numChunks; i++) {
            ivs.push(ivsView.slice(i * 12, (i + 1) * 12));
        }

        const keyMaterial = await crypto.subtle.importKey(
            "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
        );
        const key = await crypto.subtle.deriveKey(
            { 
                name: "PBKDF2", 
                salt: salt as unknown as BufferSource,
                iterations: 600000,
                hash: "SHA-256" 
            },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
        );

        const encryptedStart = headerSize + ivsSize;
        const decryptedChunks: Uint8Array[] = [];
        let chunkOffset = encryptedStart;
        for (let i = 0; i < numChunks; i++) {
            // Calculate chunk size: for AES-GCM, encrypted chunk is chunk + 16 bytes tag
            const chunkSize = (i === numChunks - 1) ? (file.size - chunkOffset) : (CHUNK_SIZE + 16);
            const encryptedChunk = await readFileChunk(file, chunkOffset, chunkSize);
            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivs[i] as unknown as BufferSource }, key, encryptedChunk);
            decryptedChunks.push(new Uint8Array(decrypted));
            chunkOffset += chunkSize;
        }

        return new Blob(decryptedChunks.map(chunk => new Uint8Array(chunk)));
    }
};