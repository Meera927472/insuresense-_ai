const DB_NAME = "insuresense-local";
const DB_VERSION = 2;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("trips")) {
        database.createObjectStore("trips", { keyPath: "tripId" });
      }
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains("documents")) {
        database.createObjectStore("documents", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local trip storage."));
  });
}

async function withStore(storeName, mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let request;
    try {
      request = operation(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve(request?.result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Local trip storage failed."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("Local trip storage was interrupted."));
    };
  });
}

export function getAllTrips() {
  return withStore("trips", "readonly", (store) => store.getAll());
}

export function saveTrip(trip) {
  return withStore("trips", "readwrite", (store) => store.put(trip));
}

export function getSetting(key) {
  return withStore("settings", "readonly", (store) => store.get(key));
}

export function saveSetting(value) {
  return withStore("settings", "readwrite", (store) => store.put(value));
}

export function getAllDocuments() {
  return withStore("documents", "readonly", (store) => store.getAll());
}

export function saveDocument(documentRecord) {
  return withStore("documents", "readwrite", (store) => store.put(documentRecord));
}

export function deleteDocument(id) {
  return withStore("documents", "readwrite", (store) => store.delete(id));
}

export async function getDeviceIdentity() {
  const existing = await getSetting("device-identity");
  if (existing?.privateKey) return existing;
  if (existing?.keyPair?.privateKey) {
    let privateKey = existing.keyPair.privateKey;
    if (privateKey.extractable) {
      const encoded = await crypto.subtle.exportKey("pkcs8", privateKey);
      privateKey = await crypto.subtle.importKey(
        "pkcs8",
        encoded,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
      );
    }
    const migrated = { ...existing, privateKey };
    delete migrated.keyPair;
    await saveSetting(migrated);
    return migrated;
  }
  if (existing) {
    throw new Error("The saved device signing key is unreadable. Existing trips were preserved for review.");
  }

  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure device signing is not available in this browser. Use localhost or HTTPS.");
  }

  const exportablePair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("spki", exportablePair.publicKey));
  const privateKeyBytes = await crypto.subtle.exportKey("pkcs8", exportablePair.privateKey);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const publicKey = bytesToBase64(publicKeyBytes);
  const identity = {
    key: "device-identity",
    deviceId: crypto.randomUUID(),
    privateKey,
    publicKey,
    previousHash: null,
  };
  await saveSetting(identity);
  return identity;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signTrip(identity, unsignedPacket) {
  const signatureBytes = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    identity.privateKey,
    new TextEncoder().encode(canonicalJson(unsignedPacket))
  ));
  return bytesToBase64(signatureBytes);
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
