import { describe, expect, it } from "vitest";
import { DistributedClusterCoordinator } from "../src/core/distributed-cluster.js";
import type { SearchResult } from "../src/types.js";

describe("DistributedClusterCoordinator", () => {
  it("determines consistent shard partition for document IDs", () => {
    const coordinator = new DistributedClusterCoordinator("test-cluster", 4);
    const shard1 = coordinator.getShardForDocument("doc-100");
    const shard2 = coordinator.getShardForDocument("doc-100");
    expect(shard1).toBeGreaterThanOrEqual(0);
    expect(shard1).toBeLessThan(4);
    expect(shard1).toEqual(shard2);
  });

  it("registers and lists cluster nodes", () => {
    const coordinator = new DistributedClusterCoordinator();
    coordinator.registerNode({
      id: "node-1",
      url: "http://127.0.0.1:3848",
      role: "shard",
      shardId: 0,
      healthy: true,
    });

    const nodes = coordinator.listNodes();
    expect(nodes.length).toBe(1);
    expect(nodes[0]!.id).toBe("node-1");
  });

  it("performs scatter-gather search across cluster shards and merges hits & facets", async () => {
    const coordinator = new DistributedClusterCoordinator("test-cluster", 2);

    coordinator.registerNode({
      id: "shard-0",
      url: "local",
      role: "shard",
      shardId: 0,
      healthy: true,
    });
    coordinator.registerNode({
      id: "shard-1",
      url: "local",
      role: "shard",
      shardId: 1,
      healthy: true,
    });

    const localSearchFn = async (indexName: string): Promise<SearchResult> => {
      return {
        tookMs: 1.2,
        total: 2,
        hits: [
          { id: "doc-1", score: 0.95, source: { id: "doc-1", fields: { title: "First hit" } } },
          { id: "doc-2", score: 0.80, source: { id: "doc-2", fields: { title: "Second hit" } } },
        ],
        facets: {
          category: [
            { key: "tech", count: 5 },
            { key: "science", count: 2 },
          ],
        },
        message: "OK",
      };
    };

    const res = await coordinator.scatterGatherSearch("test-index", { q: "test" }, localSearchFn);

    expect(res.total).toBe(4);
    expect(res.hits.length).toBe(2);
    expect(res.hits[0]!.id).toBe("doc-1");
    expect(res.facets?.category).toBeDefined();
    // Verify count merging across the 2 shards (5 + 5 = 10)
    expect(res.facets?.category?.find((b) => b.key === "tech")?.count).toBe(10);
  });
});
