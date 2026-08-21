/**
 * In-Memory Knowledge Graph Store & Traversal Engine for Anvesh
 * Compatible with Graphify, Google OKF (Open Knowledge Graph Framework) & Schema.org entities.
 */

export interface GraphEntity {
  id: string;
  name: string;
  type: string;
  aliases?: string[];
  properties?: Record<string, unknown>;
  docIds?: string[];
}

export interface GraphTriple {
  subject: string;
  predicate: string;
  object: string;
  weight?: number;
}

export interface GraphNeighborhood {
  entity: GraphEntity;
  nodes: GraphEntity[];
  edges: GraphTriple[];
}

export interface GraphSearchResult {
  entities: GraphEntity[];
  expandedTerms: string[];
  relatedDocIds: string[];
  edges: GraphTriple[];
}

export class KnowledgeGraphStore {
  /** entityId -> GraphEntity */
  private entities = new Map<string, GraphEntity>();
  /** subject -> outgoing triples */
  private outEdges = new Map<string, GraphTriple[]>();
  /** object -> incoming triples */
  private inEdges = new Map<string, GraphTriple[]>();
  /** normalized name/alias -> entityId */
  private nameIndex = new Map<string, Set<string>>();

  constructor(public readonly name: string = "default") {}

  /**
   * Adds or updates an entity in the Knowledge Graph.
   */
  addEntity(entity: GraphEntity): void {
    this.entities.set(entity.id, entity);
    this.indexEntityNames(entity);
  }

  /**
   * Adds a directed triple relation (subject -> predicate -> object).
   */
  addTriple(triple: GraphTriple): void {
    const t: GraphTriple = { ...triple, weight: triple.weight ?? 1.0 };
    
    // Outgoing edge
    const outList = this.outEdges.get(t.subject) ?? [];
    outList.push(t);
    this.outEdges.set(t.subject, outList);

    // Incoming edge
    const inList = this.inEdges.get(t.object) ?? [];
    inList.push(t);
    this.inEdges.set(t.object, inList);
  }

  /**
   * Bulk ingests entities and triples (compatible with Graphify & Google OKF JSON-LD dumps).
   */
  bulkIngest(payload: {
    entities?: GraphEntity[];
    triples?: GraphTriple[];
  }): { addedEntities: number; addedTriples: number } {
    let addedEntities = 0;
    let addedTriples = 0;

    if (Array.isArray(payload.entities)) {
      for (const ent of payload.entities) {
        if (ent.id && ent.name) {
          this.addEntity(ent);
          addedEntities++;
        }
      }
    }

    if (Array.isArray(payload.triples)) {
      for (const tr of payload.triples) {
        if (tr.subject && tr.predicate && tr.object) {
          this.addTriple(tr);
          addedTriples++;
        }
      }
    }

    return { addedEntities, addedTriples };
  }

  getEntity(id: string): GraphEntity | undefined {
    return this.entities.get(id);
  }

  /**
   * Finds entities by full-text match on name or aliases.
   */
  findEntitiesByName(query: string, limit = 10): GraphEntity[] {
    const normalized = query.trim().toLowerCase();
    const matchedIds = new Set<string>();

    for (const [nameKey, ids] of this.nameIndex.entries()) {
      if (nameKey.includes(normalized) || normalized.includes(nameKey)) {
        for (const id of ids) matchedIds.add(id);
      }
      if (matchedIds.size >= limit * 2) break;
    }

    const results: GraphEntity[] = [];
    for (const id of matchedIds) {
      const ent = this.entities.get(id);
      if (ent) results.push(ent);
      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Multi-hop neighborhood traversal (BFS) around a starting entity.
   */
  getNeighborhood(entityId: string, maxHops = 1, predicates?: string[]): GraphNeighborhood | null {
    const root = this.entities.get(entityId);
    if (!root) return null;

    const visitedNodes = new Set<string>([entityId]);
    const collectedEdges: GraphTriple[] = [];
    const collectedNodes: GraphEntity[] = [];

    let currentLevel = [entityId];

    for (let hop = 0; hop < maxHops; hop++) {
      const nextLevel: string[] = [];

      for (const node of currentLevel) {
        const outE = this.outEdges.get(node) ?? [];
        for (const edge of outE) {
          if (predicates?.length && !predicates.includes(edge.predicate)) continue;
          collectedEdges.push(edge);
          if (!visitedNodes.has(edge.object)) {
            visitedNodes.add(edge.object);
            nextLevel.push(edge.object);
            const targetEnt = this.entities.get(edge.object);
            if (targetEnt) collectedNodes.push(targetEnt);
          }
        }

        const inE = this.inEdges.get(node) ?? [];
        for (const edge of inE) {
          if (predicates?.length && !predicates.includes(edge.predicate)) continue;
          collectedEdges.push(edge);
          if (!visitedNodes.has(edge.subject)) {
            visitedNodes.add(edge.subject);
            nextLevel.push(edge.subject);
            const sourceEnt = this.entities.get(edge.subject);
            if (sourceEnt) collectedNodes.push(sourceEnt);
          }
        }
      }

      currentLevel = nextLevel;
      if (!currentLevel.length) break;
    }

    return {
      entity: root,
      nodes: collectedNodes,
      edges: collectedEdges,
    };
  }

  /**
   * Searches the Knowledge Graph, resolves semantic concepts, and returns expanded terms + related document IDs.
   */
  search(query: string, options: { maxHops?: number; types?: string[]; limit?: number } = {}): GraphSearchResult {
    const limit = options.limit ?? 10;
    const maxHops = options.maxHops ?? 1;
    const initialEntities = this.findEntitiesByName(query, limit);

    const relatedDocIds = new Set<string>();
    const expandedTerms = new Set<string>();
    const allEdges: GraphTriple[] = [];
    const seenEntities = new Map<string, GraphEntity>();

    for (const ent of initialEntities) {
      seenEntities.set(ent.id, ent);
      expandedTerms.add(ent.name);
      if (ent.aliases) {
        for (const a of ent.aliases) expandedTerms.add(a);
      }
      if (ent.docIds) {
        for (const d of ent.docIds) relatedDocIds.add(d);
      }

      const neighborhood = this.getNeighborhood(ent.id, maxHops);
      if (neighborhood) {
        for (const edge of neighborhood.edges) allEdges.push(edge);
        for (const neighbor of neighborhood.nodes) {
          if (options.types?.length && !options.types.includes(neighbor.type)) continue;
          seenEntities.set(neighbor.id, neighbor);
          expandedTerms.add(neighbor.name);
          if (neighbor.docIds) {
            for (const d of neighbor.docIds) relatedDocIds.add(d);
          }
        }
      }
    }

    return {
      entities: [...seenEntities.values()].slice(0, limit * 2),
      expandedTerms: [...expandedTerms],
      relatedDocIds: [...relatedDocIds],
      edges: allEdges.slice(0, limit * 4),
    };
  }

  exportGraph(): { entities: GraphEntity[]; triples: GraphTriple[] } {
    const allTriples: GraphTriple[] = [];
    for (const list of this.outEdges.values()) {
      for (const t of list) allTriples.push(t);
    }
    return {
      entities: [...this.entities.values()],
      triples: allTriples,
    };
  }

  stats(): { totalEntities: number; totalTriples: number; entityTypes: Record<string, number> } {
    const entityTypes: Record<string, number> = {};
    for (const ent of this.entities.values()) {
      entityTypes[ent.type] = (entityTypes[ent.type] ?? 0) + 1;
    }
    let totalTriples = 0;
    for (const list of this.outEdges.values()) {
      totalTriples += list.length;
    }
    return {
      totalEntities: this.entities.size,
      totalTriples,
      entityTypes,
    };
  }

  private indexEntityNames(entity: GraphEntity): void {
    const names = [entity.name, ...(entity.aliases ?? [])];
    for (const n of names) {
      const norm = n.trim().toLowerCase();
      if (!norm) continue;
      if (!this.nameIndex.has(norm)) this.nameIndex.set(norm, new Set());
      this.nameIndex.get(norm)!.add(entity.id);
    }
  }
}
