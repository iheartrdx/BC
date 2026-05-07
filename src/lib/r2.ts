import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, configured } from "./env";

// Cloudflare R2 speaks S3, so we point the AWS SDK at R2's endpoint.
function client() {
  if (!configured.r2) throw new Error("R2 not configured.");
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2AccessKeyId!,
      secretAccessKey: env.r2SecretAccessKey!,
    },
  });
}

export async function presignUpload(key: string, contentType: string, expiresInSec = 3600) {
  const cmd = new PutObjectCommand({
    Bucket: env.r2Bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client(), cmd, { expiresIn: expiresInSec });
}

export async function presignDownload(key: string, expiresInSec = 3600) {
  const cmd = new GetObjectCommand({ Bucket: env.r2Bucket, Key: key });
  return getSignedUrl(client(), cmd, { expiresIn: expiresInSec });
}

export function publicUrl(key: string): string | null {
  if (!env.r2PublicBaseUrl) return null;
  return `${env.r2PublicBaseUrl.replace(/\/$/, "")}/${key}`;
}

export function buildEpisodeKey(episodeId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `episodes/${episodeId}/source/${Date.now()}-${safe}`;
}
