import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";
import { hasMatchingFileSignature } from "../src/lib/fileSignatures.ts";
import {
  ObjectStorageService,
  ObjectInvalidSizeError,
  ObjectTooLargeError,
} from "../src/lib/objectStorage.ts";

const signatures = {
  "application/pdf": Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]),
  "application/msword": Uint8Array.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
  ]),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    makeZip([
      ["[Content_Types].xml", "<Types/>"],
      ["_rels/.rels", "<Relationships/>"],
      ["word/document.xml", "<document/>"],
    ]),
  "image/png": makePng(),
  "image/jpeg": Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x00, 0xff, 0xd9,
  ]),
  "image/webp": Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20, 0x0a, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00,
  ]),
};

test("public application accepts structurally valid supported document types", () => {
  for (const [contentType, content] of Object.entries(signatures)) {
    assert.equal(
      hasMatchingFileSignature(content, contentType),
      true,
      `expected ${contentType} content to be accepted`,
    );
  }
});

test("public application rejects content whose signature contradicts its MIME type", () => {
  for (const [contentType, content] of Object.entries(signatures)) {
    for (const otherContentType of Object.keys(signatures)) {
      if (contentType === otherContentType) continue;
      assert.equal(
        hasMatchingFileSignature(content, otherContentType),
        false,
        `expected ${contentType} content to be rejected as ${otherContentType}`,
      );
    }
  }
});

test("object storage validates size metadata before downloading and caps accepted ranges", async () => {
  const maxUploadBytes = 10 * 1024 * 1024;
  const downloadCalls = [];
  const file = {
    size: String(maxUploadBytes + 1),
    async getMetadata() {
      return [{ size: this.size, contentType: "application/pdf" }];
    },
    async download(options) {
      downloadCalls.push(options);
      return [Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])];
    },
  };
  const objectStorage = new ObjectStorageService();
  objectStorage.getObjectEntityFile = async () => file;

  await assert.rejects(
    objectStorage.getObjectEntityMetadataAndContent(
      "/objects/uploads/oversized",
      maxUploadBytes,
    ),
    ObjectTooLargeError,
  );
  assert.deepEqual(downloadCalls, []);

  file.size = String(maxUploadBytes);
  const result = await objectStorage.getObjectEntityMetadataAndContent(
    "/objects/uploads/at-limit",
    maxUploadBytes,
  );
  assert.deepEqual(downloadCalls, [{ end: maxUploadBytes - 1 }]);
  assert.equal(result.metadata.size, String(maxUploadBytes));

  for (const invalidSize of [
    undefined,
    null,
    "",
    "not-a-number",
    -1,
    "1.5",
    Infinity,
  ]) {
    file.size = invalidSize;
    await assert.rejects(
      objectStorage.getObjectEntityMetadataAndContent(
        "/objects/uploads/invalid-size",
        maxUploadBytes,
      ),
      ObjectInvalidSizeError,
    );
  }
  assert.deepEqual(downloadCalls, [{ end: maxUploadBytes - 1 }]);
});

test("public application rejects unsupported, truncated, and malformed signatures", () => {
  assert.equal(
    hasMatchingFileSignature(signatures["image/png"], "application/octet-stream"),
    false,
  );
  assert.equal(
    hasMatchingFileSignature(signatures["image/png"].slice(0, 8), "image/png"),
    false,
  );
  assert.equal(
    hasMatchingFileSignature(signatures["image/webp"].slice(0, 12), "image/webp"),
    false,
  );
  assert.equal(
    hasMatchingFileSignature(Uint8Array.from([0xff, 0xd8, 0xff]), "image/jpeg"),
    false,
  );
});

test("DOCX validation requires the core Word package entries", () => {
  assert.equal(
    hasMatchingFileSignature(
      makeZip([["random.txt", "not a Word document"]]),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    false,
  );
  assert.equal(
    hasMatchingFileSignature(
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    false,
  );
});

test("PNG validation checks chunk CRCs and image data", () => {
  const malformed = Uint8Array.from(signatures["image/png"]);
  malformed[malformed.length - 5] ^= 0xff;
  assert.equal(hasMatchingFileSignature(malformed, "image/png"), false);

  const truncated = signatures["image/png"].slice(
    0,
    signatures["image/png"].length - 4,
  );
  assert.equal(hasMatchingFileSignature(truncated, "image/png"), false);
});

test("WEBP validation checks the RIFF container and image chunk", () => {
  const malformed = Uint8Array.from(signatures["image/webp"]);
  malformed[4] = 0;
  assert.equal(hasMatchingFileSignature(malformed, "image/webp"), false);

  const headerOnly = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
  ]);
  assert.equal(hasMatchingFileSignature(headerOnly, "image/webp"), false);
});

test("public application normalizes MIME parameters before signature validation", () => {
  assert.equal(
    hasMatchingFileSignature(signatures["image/png"], "image/png; charset=binary"),
    true,
  );
});

test("public application rejects invalid stored signatures before creating candidate rows", async () => {
  const tenantId = "a0000000-0000-4000-8000-000000000001";
  const objectPath = `/objects/uploads/${tenantId}/mismatched-upload`;
  const maxUploadBytes = 10 * 1024 * 1024;
  const docxMimeType =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const invalidDocuments = [
    {
      label: "valid PNG bytes declared as PDF",
      objectPath: `/objects/uploads/${tenantId}/misdeclared-png`,
      name: "misdeclared.pdf",
      mimeType: "application/pdf",
      content: signatures["image/png"],
    },
    {
      label: "arbitrary ZIP declared as DOCX",
      objectPath: `/objects/uploads/${tenantId}/arbitrary-zip`,
      name: "arbitrary.zip",
      mimeType: docxMimeType,
      content: makeZip([["random.txt", "not a Word document"]]),
    },
    {
      label: "truncated PNG",
      objectPath: `/objects/uploads/${tenantId}/truncated-png`,
      name: "truncated.png",
      mimeType: "image/png",
      content: signatures["image/png"].slice(0, -4),
    },
    {
      label: "truncated JPEG",
      objectPath: `/objects/uploads/${tenantId}/truncated-jpeg`,
      name: "truncated.jpg",
      mimeType: "image/jpeg",
      content: Uint8Array.from([0xff, 0xd8, 0xff]),
    },
    {
      label: "invalid WEBP",
      objectPath: `/objects/uploads/${tenantId}/invalid-webp`,
      name: "invalid.webp",
      mimeType: "image/webp",
      content: Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50,
      ]),
    },
  ];
  const validDocuments = Object.entries(signatures).map(
    ([mimeType, content], index) => ({
      objectPath: `/objects/uploads/${tenantId}/valid-${index}`,
      name: `valid-${index}`,
      mimeType,
      content,
    }),
  );
  const storedObjects = new Map(
    [...invalidDocuments, ...validDocuments].map((document) => [
      document.objectPath,
      document,
    ]),
  );
  const persisted = {
    candidates: [],
    candidateDocuments: [],
    candidateStageHistory: [],
    transactionCalls: 0,
    oversized: false,
    storedSize: "8",
  };
  const tables = {
    tenantsTable: { id: "tenants.id" },
    candidatesTable: { id: "candidates.id" },
    candidateDocumentsTable: { id: "candidate_documents.id" },
    jobsTable: { id: "jobs.id" },
    candidateStageHistoryTable: { id: "candidate_stage_history.id" },
    publicApplicationUploadsTable: { id: "public_application_uploads.id" },
  };

  test.mock.module("drizzle-orm", {
    namedExports: {
      and: (...conditions) => conditions,
      desc: (column) => column,
      eq: (column, value) => ({ column, value }),
      isNull: (column) => ({ column, isNull: true }),
      sql: () => ({ sql: true }),
    },
  });
  test.mock.module("@workspace/api-zod", {
    namedExports: {
      SubmitApplicationBody: {
        safeParse: (value) => ({ success: true, data: value }),
      },
      RequestPublicUploadUrlBody: {
        safeParse: (value) => ({ success: true, data: value }),
      },
      RequestPublicUploadUrlResponse: {
        parse: (value) => value,
      },
    },
  });
  test.mock.module("@workspace/db", {
    namedExports: {
      ...tables,
      db: {
        select() {
          const query = {
            table: null,
            from(table) {
              this.table = table;
              return this;
            },
            where() {
              return this;
            },
            orderBy() {
              return this;
            },
            then(resolve, reject) {
              const rows =
                this.table === tables.tenantsTable
                  ? [{ id: tenantId }]
                  : this.table === tables.candidatesTable
                    ? persisted.candidates
                    : this.table === tables.candidateDocumentsTable
                      ? persisted.candidateDocuments
                      : [];
              return Promise.resolve(rows).then(resolve, reject);
            },
          };
          return query;
        },
        transaction(callback) {
          persisted.transactionCalls += 1;
          return callback({
            select() {
              const query = {
                from() {
                  return this;
                },
                where() {
                  return this;
                },
                limit() {
                  return this;
                },
                then(resolve, reject) {
                  return Promise.resolve([]).then(resolve, reject);
                },
              };
              return query;
            },
            update() {
              const query = {
                set() {
                  return this;
                },
                where() {
                  return this;
                },
                returning: async () => [{ id: 1 }],
              };
              return query;
            },
            execute: async () => undefined,
            insert(table) {
              return {
                values(rows) {
                  const values = Array.isArray(rows) ? rows : [rows];
                  if (table === tables.candidatesTable) {
                    const candidate = {
                      ...values[0],
                      id: persisted.candidates.length + 1,
                    };
                    persisted.candidates.push(candidate);
                    return {
                      returning: async () => [candidate],
                    };
                  }
                  if (table === tables.candidateDocumentsTable) {
                    persisted.candidateDocuments.push(...values);
                  } else if (table === tables.candidateStageHistoryTable) {
                    persisted.candidateStageHistory.push(...values);
                  }
                  return {};
                },
              };
            },
          });
        },
      },
    },
  });
  test.mock.module("../src/lib/objectStorage.ts", {
    namedExports: {
      ObjectNotFoundError: class ObjectNotFoundError extends Error {},
      ObjectInvalidSizeError: class ObjectInvalidSizeError extends Error {},
      ObjectTooLargeError: class ObjectTooLargeError extends Error {},
      ObjectStorageService: class ObjectStorageService {
        async getObjectEntityMetadataAndContent(path, maxBytes) {
          assert.equal(maxBytes, maxUploadBytes);
          if (path === objectPath) {
            if (persisted.oversized) {
              return {
                metadata: {
                  size: String(maxUploadBytes + 1),
                  contentType: "application/pdf",
                  metadata: { name: "resume.pdf" },
                },
                content: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]),
              };
            }
            return {
              metadata: {
                size: persisted.storedSize,
                contentType: "application/pdf",
                metadata: { name: "resume.pdf" },
              },
              content: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
            };
          }
          const storedObject = storedObjects.get(path);
          assert.ok(storedObject, `unexpected object path ${path}`);
          return {
            metadata: {
              size: String(storedObject.content.length),
              contentType: storedObject.mimeType,
              metadata: { name: storedObject.name },
            },
            content: storedObject.content.slice(0, maxBytes),
          };
        }
      },
    },
  });
  test.mock.module("../src/lib/email.ts", {
    namedExports: { sendApplicationConfirmation: async () => undefined },
  });
  test.mock.module("../src/lib/activity.ts", {
    namedExports: { logActivity: async () => undefined },
  });
  test.mock.module("../src/lib/rateLimit.ts", {
    namedExports: {
      rateLimit: () => (_req, _res, next) => next(),
    },
  });
  test.mock.module("../src/lib/publicJobs.ts", {
    namedExports: { listPublicJobs: async () => undefined },
  });
  test.mock.module("../src/lib/publicUploadCleanup.ts", {
    namedExports: { PUBLIC_UPLOAD_RETENTION_MS: 60_000 },
  });

  const { default: publicRouter } = await import("../src/routes/public.ts");
  const express = (await import("express")).default;
  const app = express();
  app.use(express.json());
  app.use(publicRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });

  try {
    const applicationUrl =
      `http://127.0.0.1:${server.address().port}/public/amiga/applications`;
    for (const [index, document] of invalidDocuments.entries()) {
      const response = await fetch(applicationUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: "Malformed",
          lastName: `Upload ${index}`,
          email: `malformed-upload-${index}@example.com`,
          documents: [
            {
              name: document.name,
              category: "cv",
              objectPath: document.objectPath,
              fileSize: document.content.length,
              mimeType: document.mimeType,
            },
          ],
        }),
      });

      assert.equal(response.status, 400, document.label);
      assert.deepEqual(await response.json(), {
        error: "Invalid document reference.",
      });
      assert.deepEqual(persisted.candidates, [], document.label);
      assert.deepEqual(persisted.candidateDocuments, [], document.label);
      assert.equal(persisted.transactionCalls, 0, document.label);
    }

    const mismatchedResponse = await fetch(applicationUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Mismatched",
        lastName: "Upload",
        email: "mismatched-upload@example.com",
        documents: [
          {
            name: "resume.pdf",
            category: "cv",
            objectPath,
            fileSize: 8,
            mimeType: "application/pdf",
          },
        ],
      }),
    });
    assert.equal(mismatchedResponse.status, 400);
    assert.deepEqual(await mismatchedResponse.json(), {
      error: "Invalid document reference.",
    });
    assert.deepEqual(persisted.candidates, []);
    assert.deepEqual(persisted.candidateDocuments, []);
    assert.equal(persisted.transactionCalls, 0);

    for (const [label, storedSize] of [
      ["missing stored size", undefined],
      ["non-numeric stored size", "not-a-number"],
      ["otherwise invalid stored size", -1],
    ]) {
      persisted.storedSize = storedSize;
      const invalidSizeResponse = await fetch(applicationUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: "Invalid",
          lastName: label,
          email: `${label.replaceAll(" ", "-")}@example.com`,
          documents: [
            {
              name: "resume.pdf",
              category: "cv",
              objectPath,
              fileSize: 8,
              mimeType: "application/pdf",
            },
          ],
        }),
      });
      assert.equal(invalidSizeResponse.status, 400, label);
      assert.deepEqual(await invalidSizeResponse.json(), {
        error: "Invalid document reference.",
      });
      assert.deepEqual(persisted.candidates, [], label);
      assert.deepEqual(persisted.candidateDocuments, [], label);
      assert.equal(persisted.transactionCalls, 0, label);
    }
    persisted.storedSize = "8";

    persisted.oversized = true;
    const oversizedResponse = await fetch(applicationUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Oversized",
        lastName: "Upload",
        email: "oversized-upload@example.com",
        documents: [
          {
            name: "resume.pdf",
            category: "cv",
            objectPath,
            fileSize: maxUploadBytes + 1,
            mimeType: "application/pdf",
          },
        ],
      }),
    });
    assert.equal(oversizedResponse.status, 413);
    assert.deepEqual(await oversizedResponse.json(), {
      error: "File too large. Maximum size is 10MB.",
    });
    assert.deepEqual(persisted.candidates, []);
    assert.deepEqual(persisted.candidateDocuments, []);
    assert.equal(persisted.transactionCalls, 0);

    for (const [index, document] of validDocuments.entries()) {
      const response = await fetch(applicationUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: "Valid",
          lastName: `Upload ${index}`,
          email: `valid-upload-${index}@example.com`,
          documents: [
            {
              name: document.name,
              category: "cv",
              objectPath: document.objectPath,
              fileSize: document.content.length,
              mimeType: document.mimeType,
            },
          ],
        }),
      });

      assert.equal(response.status, 201, document.mimeType);
      assert.deepEqual(await response.json(), {
        id: index + 1,
        message: "Thank you — your application has been received.",
      });
    }

    assert.equal(persisted.candidates.length, validDocuments.length);
    assert.equal(
      persisted.candidateDocuments.length,
      validDocuments.length,
    );
    assert.equal(
      persisted.candidateStageHistory.length,
      validDocuments.length,
    );
    assert.equal(
      persisted.transactionCalls,
      validDocuments.length,
    );
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

function makePng() {
  const signature = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const header = pngChunk(
    "IHDR",
    Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
  );
  const pixels = Uint8Array.from([0, 255, 0, 0, 255]);
  const imageData = pngChunk("IDAT", deflateSync(pixels));
  const end = pngChunk("IEND", new Uint8Array());
  return concat(signature, header, imageData, end);
}

function pngChunk(type, data) {
  const typeBytes = Uint8Array.from(type, (character) => character.charCodeAt(0));
  const result = new Uint8Array(12 + data.length);
  writeUint32BigEndian(result, 0, data.length);
  result.set(typeBytes, 4);
  result.set(data, 8);
  writeUint32BigEndian(result, 8 + data.length, crc32(concat(typeBytes, data)));
  return result;
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const [name, value] of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const data = new TextEncoder().encode(value);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 14, crc);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, nameBytes.length);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 16, crc);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, data.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint32(central, 42, localOffset);
    central.set(nameBytes, 46);
    centralParts.push(central);
    localOffset += local.length;
  }

  const centralDirectory = concat(...centralParts);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralDirectory.length);
  writeUint32(end, 16, localOffset);
  return concat(...localParts, centralDirectory, end);
}

function concat(...parts) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function crc32(content) {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(content, offset, value) {
  content[offset] = value & 0xff;
  content[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(content, offset, value) {
  content[offset] = value & 0xff;
  content[offset + 1] = (value >>> 8) & 0xff;
  content[offset + 2] = (value >>> 16) & 0xff;
  content[offset + 3] = (value >>> 24) & 0xff;
}

function writeUint32BigEndian(content, offset, value) {
  content[offset] = (value >>> 24) & 0xff;
  content[offset + 1] = (value >>> 16) & 0xff;
  content[offset + 2] = (value >>> 8) & 0xff;
  content[offset + 3] = value & 0xff;
}
