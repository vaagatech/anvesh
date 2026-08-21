/**
 * Multi-Facet Autocomplete Engine & Image Metadata Suggestion Builder for Anvesh
 */

import { InvertedIndex } from "./inverted-index.js";
import { KnowledgeGraphStore } from "./knowledge-graph.js";

export type SuggestionType =
  | "query"
  | "phrase"
  | "category"
  | "document"
  | "visual_tag"
  | "motif"
  | "color"
  | "entity";

export interface AutocompleteSuggestion {
  text: string;
  type: SuggestionType;
  score: number;
  count?: number;
  field?: string;
  docId?: string;
  payload?: Record<string, unknown>;
}

export interface ImageMetadataResult {
  ocr: {
    text: string;
    confidence: number;
    words: string[];
  };
  colors: string[];
  motifs: string[];
  tags: string[];
  searchableText: string;
  autocompleteSuggestions: AutocompleteSuggestion[];
}

export interface AutocompleteOptions {
  q: string;
  fields?: string[];
  size?: number;
  includeCategories?: boolean;
  includeDocuments?: boolean;
  includeVisualTags?: boolean;
  includeGraphEntities?: boolean;
}

/**
 * Builds rich autocomplete suggestions from InvertedIndex, stored documents, and KnowledgeGraph.
 */
export function buildAutocompleteSuggestions(
  index: InvertedIndex,
  graph: KnowledgeGraphStore | null,
  options: AutocompleteOptions
): AutocompleteSuggestion[] {
  const query = options.q.trim().toLowerCase();
  if (!query) return [];

  const limit = options.size ?? 10;
  const suggestions: AutocompleteSuggestion[] = [];
  const seenTexts = new Set<string>();

  // 1. Term Dictionary & Prefix Completion
  const termSuggestions = index.suggest(query, undefined, limit * 2);
  for (const term of termSuggestions) {
    if (seenTexts.has(term.toLowerCase())) continue;
    seenTexts.add(term.toLowerCase());
    suggestions.push({
      text: term,
      type: "query",
      score: 1.0 - (term.length - query.length) * 0.05,
    });
  }

  // 2. Document Title / Name Matching
  if (options.includeDocuments !== false) {
    const titleHits = index.searchKeyword(query, ["name", "title", "product_name"], {
      size: 5,
      prefix: true,
    });

    for (const hit of titleHits.hits) {
      const title = (hit.source.fields?.name || hit.source.fields?.title || hit.source.fields?.product_name) as string | undefined;
      if (title && !seenTexts.has(title.toLowerCase())) {
        seenTexts.add(title.toLowerCase());
        suggestions.push({
          text: title,
          type: "document",
          score: Math.min(0.95, hit.score / 10),
          docId: hit.id,
          payload: {
            category: hit.source.fields?.category,
            price: hit.source.fields?.price,
            image: hit.source.fields?.image || hit.source.fields?.imageUrl,
          },
        });
      }
    }
  }

  // 3. Category & Taxonomy Suggestions
  if (options.includeCategories !== false) {
    const catFacets = index.facet("category");
    for (const f of catFacets) {
      const catStr = String(f.key);
      if (catStr.toLowerCase().includes(query) && !seenTexts.has(catStr.toLowerCase())) {
        seenTexts.add(catStr.toLowerCase());
        suggestions.push({
          text: catStr,
          type: "category",
          field: "category",
          count: f.count,
          score: 0.90,
        });
      }
    }
  }

  // 4. Visual Tags (Color & Motif Facets)
  if (options.includeVisualTags !== false) {
    const visualFacets = [
      ...index.facet("tags"),
      ...index.facet("dominant_colors"),
      ...index.facet("motifs"),
    ];

    for (const vf of visualFacets) {
      const tagStr = String(vf.key);
      if (tagStr.toLowerCase().includes(query) && !seenTexts.has(tagStr.toLowerCase())) {
        seenTexts.add(tagStr.toLowerCase());
        const isMotif = /motif|border|pallu|checks/i.test(tagStr);
        suggestions.push({
          text: tagStr,
          type: isMotif ? "motif" : "visual_tag",
          count: vf.count,
          score: 0.85,
        });
      }
    }
  }

  // 5. Knowledge Graph Entity Suggestions
  if (graph && options.includeGraphEntities !== false) {
    const entities = graph.findEntitiesByName(query, 5);
    for (const ent of entities) {
      if (!seenTexts.has(ent.name.toLowerCase())) {
        seenTexts.add(ent.name.toLowerCase());
        suggestions.push({
          text: ent.name,
          type: "entity",
          score: 0.92,
          payload: {
            entityId: ent.id,
            entityType: ent.type,
            properties: ent.properties,
          },
        });
      }
    }
  }

  // Sort by score descending and truncate
  return suggestions
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text))
    .slice(0, limit);
}
