import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface StoredImage {
  /** Relative to the storage root -- what gets persisted on Asset.storagePath. */
  storagePath: string;
  /** Public URL the client can load directly (see main.ts static mount). */
  url: string;
}

/**
 * Disk-backed storage for generated images -- chosen over S3/MinIO for this
 * phase since this is a local dev/portfolio deployment, not a real
 * multi-instance deployment (see design doc §8's note that object storage
 * is the "real" answer; this is a documented simplification, not the
 * intended production shape). Swapping to S3-compatible storage later only
 * needs a new implementation of this same save() signature.
 */
@Injectable()
export class LocalImageStorageService {
  // process.cwd(), not __dirname -- compiled output runs from dist/src/..,
  // and pnpm scripts always run with cwd = apps/api (same reasoning as the
  // public/ static mount in main.ts).
  private readonly root = join(process.cwd(), "storage", "generated");

  async save(organizationId: string, base64: string, mimeType: string): Promise<StoredImage> {
    const ext = MIME_EXTENSIONS[mimeType] ?? "bin";
    const storagePath = `${organizationId}/${randomUUID()}.${ext}`;
    const absolutePath = join(this.root, storagePath);

    await mkdir(join(this.root, organizationId), { recursive: true });
    await writeFile(absolutePath, Buffer.from(base64, "base64"));

    return { storagePath, url: `/generated/${storagePath}` };
  }
}
