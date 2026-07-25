/**
 * Distributed Processing & Cluster Scatter-Gather Router —
 * Enables multi-node query scatter-gather, document hash partitioning, and map-reduce aggregation.
 * Supports scaling Anvesh search & vector workloads to large distributed environments.
 */

function fnv1a32(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

import type { AnveshEngine } from "./engine.js";
import type { DocumentId, SearchHit, SearchQuery, SearchResult, FacetBucket } from "../types.js";
import { AnveshError } from "../messaging/vaakly.js";

export interface ClusterNode {
  id: string;
  url: string;
  role: "primary" | "replica" | "shard";
  shardId?: number;
  healthy: boolean;
  lastPing?: string;
}

export interface ClusterConfig {
  clusterName: string;
  shardCount: number;
  nodes: ClusterNode[];
}

export class DistributedClusterCoordinator {
  private nodes = new Map<string, ClusterNode>();
  private shardMap = new Map<number, string[]>(); // shardId -> nodeId[]

  constructor(
    public readonly clusterName = "anvesh-cluster",
    public readonly shardCount = 4,
    private readonly localEngine?: AnveshEngine,
  ) {}

  registerNode(node: ClusterNode): void {
    this.nodes.set(node.id, { ...node, healthy: true, lastPing: new Date().toISOString() });
    const shardId = node.shardId ?? 0;
    if (!this.shardMap.has(shardId)) {
      this.shardMap.set(shardId, []);
    }
    const list = this.shardMap.get(shardId)!;
    if (!list.includes(node.id)) {
      list.push(node.id);
    }
  }

  unregisterNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    for (const [shardId, list] of this.shardMap) {
      this.shardMap.set(shardId, list.filter((id) => id !== nodeId));
    }
  }

  getShardForDocument(docId: DocumentId): number {
    const hash = fnv1a32(docId);
    return hash % this.shardCount;
  }

  listNodes(): ClusterNode[] {
    return [...this.nodes.values()];
  }

  /**
   * Scatter-Gather Distributed Search:
   * Broadcasts query to all shard nodes, gathers shard results, and merges hits & facets.
   */
  async scatterGatherSearch(
    indexName: string,
    query: SearchQuery,
    localSearchFn?: (indexName: string, query: SearchQuery) => Promise<SearchResult> | SearchResult,
  ): Promise<SearchResult> {
    const started = performance.now();
    const activeNodes = [...this.nodes.values()].filter((n) => n.healthy);

    // If local search function or local engine is provided and no cluster nodes registered, perform local query
    if (activeNodes.length === 0) {
      if (localSearchFn) {
        return localSearchFn(indexName, query);
      }
      if (this.localEngine) {
        return this.localEngine.search(indexName, query);
      }
      throw new AnveshError("ERR_STORAGE", { detail: "no active cluster nodes available for scatter-gather search" });
    }

    // Execute queries across shards in parallel
    const from = query.from ?? 0;
    const size = query.size ?? 10;
    const fetchSize = from + size;

    const shardQueries = activeNodes.map(async (node) => {
      try {
        if (node.url === "local" && localSearchFn) {
          return await localSearchFn(indexName, { ...query, from: 0, size: fetchSize });
        }
        if (node.url === "local" && this.localEngine) {
          return this.localEngine.search(indexName, { ...query, from: 0, size: fetchSize });
        }
        // Remote node invocation via HTTP REST API
        const response = await fetch(`${node.url}/api/v1/indexes/${indexName}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...query, from: 0, size: fetchSize }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        return (await response.json()) as SearchResult;
      } catch (err) {
        // Soft fail per node on distributed query
        return {
          tookMs: 0,
          total: 0,
          hits: [],
          message: `Node ${node.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    });

    const shardResults = await Promise.all(shardQueries);

    // Merge document hits across all node responses
    const allHits: SearchHit[] = [];
    const seenIds = new Set<string>();
    let totalDocs = 0;

    for (const res of shardResults) {
      totalDocs += res.total;
      for (const hit of res.hits) {
        if (!seenIds.has(hit.id)) {
          seenIds.add(hit.id);
          allHits.push(hit);
        }
      }
    }

    // Re-rank combined hits by score descending
    allHits.sort((a, b) => b.score - a.score);
    const hits = allHits.slice(from, from + size);

    // Merge Facets across shards
    const mergedFacets: Record<string, FacetBucket[]> = {};
    for (const res of shardResults) {
      if (!res.facets) continue;
      for (const [facetName, buckets] of Object.entries(res.facets)) {
        if (!mergedFacets[facetName]) {
          mergedFacets[facetName] = [];
        }
        for (const bucket of buckets) {
          const existing = mergedFacets[facetName].find((b) => b.key === bucket.key);
          if (existing) {
            existing.count += bucket.count;
          } else {
            mergedFacets[facetName].push({ ...bucket });
          }
        }
      }
    }

    // Sort term facet buckets by count descending
    for (const [key, buckets] of Object.entries(mergedFacets)) {
      if (!key.startsWith("stats:")) {
        buckets.sort((a, b) => (typeof b.count === "number" ? b.count : 0) - (typeof a.count === "number" ? a.count : 0));
      }
    }

    const tookMs = Math.round((performance.now() - started) * 100) / 100;
    const message = `Distributed search OK (shards: ${shardResults.length}, total: ${totalDocs}, tookMs: ${tookMs})`;

    return {
      tookMs,
      total: totalDocs,
      hits,
      facets: Object.keys(mergedFacets).length > 0 ? mergedFacets : undefined,
      message,
    };
  }
}
