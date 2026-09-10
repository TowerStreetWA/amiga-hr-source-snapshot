import { Storage, File } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl.ts";
import type { ObjectAclPolicy } from "./objectAcl.ts";
import { hasMatchingFileSignature } from "./fileSignatures.ts";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const OBJECT_SIGNATURE_PREFIX_BYTES = 12;

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectTooLargeError extends Error {
  constructor() {
    super("Object too large");
    this.name = "ObjectTooLargeError";
    Object.setPrototypeOf(this, ObjectTooLargeError.prototype);
  }
}

export class ObjectInvalidSizeError extends Error {
  constructor() {
    super("Object has invalid size metadata");
    this.name = "ObjectInvalidSizeError";
    Object.setPrototypeOf(this, ObjectInvalidSizeError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(file: File, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(
    objectPrefix = "uploads",
    originalName?: string,
  ): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const normalizedObjectPrefix = objectPrefix.replace(/^\/+|\/+$/g, "");
    if (
      !normalizedObjectPrefix ||
      !normalizedObjectPrefix
        .split("/")
        .every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))
    ) {
      throw new Error("Invalid object upload prefix");
    }

    const objectId = randomUUID();
    const encodedName =
      originalName === undefined
        ? ""
        : `_${Buffer.from(originalName, "utf8").toString("hex")}`;
    const fullPath = `${privateObjectDir}/${normalizedObjectPrefix}/${objectId}${encodedName}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    const objectFile = this.getObjectEntityFileReference(objectPath);
    let exists: boolean;
    try {
      [exists] = await objectFile.exists();
    } catch (error) {
      // The storage SDK normally reports a missing object as `false`, but some
      // provider responses reject with a 404 instead. Keep both forms on the
      // same client-validation path without hiding real storage failures.
      if (isObjectNotFoundError(error)) {
        throw new ObjectNotFoundError();
      }
      throw error;
    }
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  /**
   * Delete an object entity without requiring it to exist first. A client can
   * request an upload URL and abandon it before the PUT creates an object, so
   * cleanup treats a missing object as already clean.
   */
  async deleteObjectEntity(objectPath: string): Promise<void> {
    const objectFile = this.getObjectEntityFileReference(objectPath);
    await objectFile.delete({ ignoreNotFound: true });
  }

  private getObjectEntityFileReference(objectPath: string): File {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    return objectStorageClient.bucket(bucketName).file(objectName);
  }

  async getObjectEntityMetadata(objectPath: string) {
    const objectFile = await this.getObjectEntityFile(objectPath);
    const [metadata] = await objectFile.getMetadata();
    return normalizeObjectMetadata(metadata);
  }

  async getObjectEntityMetadataAndContent(
    objectPath: string,
    maxBytes?: number,
  ) {
    const objectFile = await this.getObjectEntityFile(objectPath);
    const [rawMetadata] = await objectFile.getMetadata();
    const metadata = normalizeObjectMetadata(rawMetadata);
    const storedSize = parseStoredObjectSize(metadata.size);
    if (maxBytes !== undefined && storedSize > maxBytes) {
      throw new ObjectTooLargeError();
    }
    const [content] =
      maxBytes === undefined
        ? await objectFile.download()
        : await objectFile.download({ end: maxBytes - 1 });
    return {
      metadata,
      content,
    };
  }

  async getObjectEntityMetadataAndContentPrefix(objectPath: string) {
    const objectFile = await this.getObjectEntityFile(objectPath);
    const [[metadata], [content]] = await Promise.all([
      objectFile.getMetadata(),
      objectFile.download({ end: OBJECT_SIGNATURE_PREFIX_BYTES - 1 }),
    ]);
    return {
      metadata: normalizeObjectMetadata(metadata),
      content,
    };
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function normalizeObjectMetadata<
  T extends { name?: string; metadata?: Record<string, unknown> },
>(
  metadata: T,
): T {
  const originalName = decodeOriginalUploadName(metadata.name);
  if (originalName === undefined) {
    return metadata;
  }
  return {
    ...metadata,
    metadata: {
      ...metadata.metadata,
      name: originalName,
    },
  } as T;
}

function parseStoredObjectSize(rawSize: unknown): number {
  if (
    (typeof rawSize !== "string" && typeof rawSize !== "number") ||
    (typeof rawSize === "string" && rawSize.trim() === "")
  ) {
    throw new ObjectInvalidSizeError();
  }

  const size = Number(rawSize);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new ObjectInvalidSizeError();
  }
  return size;
}

function isObjectNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    statusCode?: unknown;
    response?: { statusCode?: unknown };
  };
  return (
    candidate.code === 404 ||
    candidate.statusCode === 404 ||
    candidate.response?.statusCode === 404
  );
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

function decodeOriginalUploadName(objectName: string | undefined): string | undefined {
  if (typeof objectName !== "string") {
    return undefined;
  }
  const encodedName = objectName.slice(objectName.lastIndexOf("_") + 1);
  if (
    objectName.lastIndexOf("_") < 0 ||
    encodedName.length === 0 ||
    encodedName.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(encodedName)
  ) {
    return undefined;
  }
  try {
    return Buffer.from(encodedName, "hex").toString("utf8");
  } catch {
    return undefined;
  }
}
async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = (await response.json()) as { signed_url: string };
  return signedURL;
}
