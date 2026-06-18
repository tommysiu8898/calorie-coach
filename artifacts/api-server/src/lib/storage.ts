import { Client } from "@replit/object-storage";

let _client: Client | null = null;
let _initDone = false;

export async function getStorageClient(): Promise<Client | null> {
  if (_initDone) return _client;
  _initDone = true;
  try {
    const client = new Client();
    const probe = await client.list({ maxResults: 0 });
    _client = probe.ok ? client : null;
  } catch {
    _client = null;
  }
  return _client;
}
