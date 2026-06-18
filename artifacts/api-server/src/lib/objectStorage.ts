import { randomUUID } from "crypto";

const SIDECAR = "http://127.0.0.1:1106";

function getBucketId(): string {
  const id = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
  if (!id) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
  return id;
}

async function signObjectURL(bucketName: string, objectName: string, method: string, expiresAt: string): Promise<string> {
  const res = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket_name: bucketName, object_name: objectName, method, expires_at: expiresAt }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Storage sidecar error (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { signed_url?: string };
  if (!data.signed_url) throw new Error("Sidecar returned no signed_url");
  return data.signed_url;
}

export async function generateMealPhotoUploadUrl(userId: string): Promise<{ uploadUrl: string; objectKey: string }> {
  const objectKey = `meal-photos/${userId}/${randomUUID()}.jpg`;
  const uploadUrl = await signObjectURL(
    getBucketId(),
    objectKey,
    "PUT",
    new Date(Date.now() + 900_000).toISOString(),
  );
  return { uploadUrl, objectKey };
}
