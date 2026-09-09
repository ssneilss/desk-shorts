import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { cfg } from '../config';

export const hasOpenSearch = () => Boolean(cfg.opensearchUrl);

let client: Client | null = null;

function opensearch(): Client {
  if (!cfg.opensearchUrl) throw new Error('OPENSEARCH_URL is not set');
  client ??= new Client({
    ...AwsSigv4Signer({
      region: cfg.region,
      service: 'es',
      getCredentials: () => defaultProvider()(),
    }),
    node: cfg.opensearchUrl,
  });
  return client;
}

/** `_source` of every hit for one query body. */
export async function search(index: string, body: unknown): Promise<unknown[]> {
  const res = await opensearch().search({ index, body: body as Record<string, unknown> });
  const hits = (res.body as { hits?: { hits?: { _source?: unknown }[] } }).hits?.hits ?? [];
  return hits.map((hit) => hit._source);
}
