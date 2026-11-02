import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { MediaStorage } from "./types.js";

export interface R2StorageOptions {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function createR2Storage(options: R2StorageOptions): MediaStorage {
  if (!/^[a-f0-9]{32}$/i.test(options.accountId)) {
    throw new Error("R2 account ID must be a 32-character hexadecimal ID.");
  }
  if (!/^(?=.{3,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(options.bucket)) {
    throw new Error("R2 bucket name is invalid.");
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });

  return {
    async putObject({ key, body, contentType }) {
      await client.send(new PutObjectCommand({
        Bucket: options.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentDisposition: "attachment",
        CacheControl: "private, no-store",
      }));
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: key }));
    },
  };
}
