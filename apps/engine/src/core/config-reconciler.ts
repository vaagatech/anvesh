/**
 * Anvesh Config Reconciler — Declarative GitOps engine for diffing, planning, and applying config state.
 */

import type { AnveshEngine } from "./engine.js";
import { globalCircuits } from "./circuit.js";
import type { FieldMapping, IndexDefinition, IndexSettings } from "../types.js";

export interface AnveshIndexSpec {
  name: string;
  mappings?: Record<string, FieldMapping>;
  settings?: IndexSettings;
  aliases?: string[];
}

export interface AnveshSpiderTargetSpec {
  name: string;
  targetUrl: string;
  indexName: string;
  maxDepth?: number;
  maxPages?: number;
  allowedDomains?: string[];
  scheduleCron?: string;
}

export interface AnveshCircuitSpec {
  maxBodyBytes?: number;
  maxBulkDocs?: number;
  maxConcurrentSearch?: number;
  maxResultWindow?: number;
  maxRssMb?: number;
  maxDocsPerIndex?: number;
  maxFuzzyCandidates?: number;
}

export interface AnveshConfigSpec {
  version?: string;
  indexes?: AnveshIndexSpec[];
  spiderTargets?: AnveshSpiderTargetSpec[];
  circuits?: AnveshCircuitSpec;
}

export interface ConfigDiffAction {
  type: "create_index" | "update_index" | "delete_index" | "update_circuit" | "sync_spider_target";
  target: string;
  details: Record<string, unknown>;
}

export interface ConfigPlanResult {
  actions: ConfigDiffAction[];
  hasChanges: boolean;
}

export interface ConfigApplyResult {
  applied: ConfigDiffAction[];
  errors: Array<{ target: string; error: string }>;
  success: boolean;
}

export class ConfigReconciler {
  constructor(private readonly engine: AnveshEngine) {}

  /**
   * Generates a dry-run plan of actions required to reconcile the cluster with the desired config spec.
   */
  async plan(spec: AnveshConfigSpec, options?: { prune?: boolean }): Promise<ConfigPlanResult> {
    const actions: ConfigDiffAction[] = [];
    const currentIndexes = this.engine.listIndexes();
    const currentIndexMap = new Map(currentIndexes.map((idx) => [idx.name, idx]));
    const desiredIndexNames = new Set<string>();

    // 1. Reconcile Indexes
    if (spec.indexes) {
      for (const idxSpec of spec.indexes) {
        desiredIndexNames.add(idxSpec.name);
        const existing = currentIndexMap.get(idxSpec.name);

        if (!existing) {
          actions.push({
            type: "create_index",
            target: idxSpec.name,
            details: {
              mappings: idxSpec.mappings || {},
              settings: idxSpec.settings || {},
              aliases: idxSpec.aliases || [],
            },
          });
        } else {
          // Check for mapping or setting differences
          const mappingDiff: Record<string, FieldMapping> = {};
          if (idxSpec.mappings) {
            for (const [field, mapping] of Object.entries(idxSpec.mappings)) {
              const existingMapping = existing.mappings[field];
              if (!existingMapping || existingMapping.type !== mapping.type) {
                mappingDiff[field] = mapping;
              }
            }
          }

          const hasSettingsChange =
            idxSpec.settings &&
            JSON.stringify(idxSpec.settings) !== JSON.stringify(existing.settings);

          if (Object.keys(mappingDiff).length > 0 || hasSettingsChange) {
            actions.push({
              type: "update_index",
              target: idxSpec.name,
              details: {
                newMappings: mappingDiff,
                settings: idxSpec.settings,
              },
            });
          }
        }
      }
    }

    // Optional pruning for deleted indexes
    if (options?.prune) {
      for (const existing of currentIndexes) {
        if (!desiredIndexNames.has(existing.name)) {
          actions.push({
            type: "delete_index",
            target: existing.name,
            details: { docCount: existing.docCount },
          });
        }
      }
    }

    // 2. Reconcile Circuits
    if (spec.circuits) {
      const currentLimits = globalCircuits.getLimits();
      const circuitChanges: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(spec.circuits)) {
        if (v !== undefined && (currentLimits as any)[k] !== v) {
          circuitChanges[k] = v;
        }
      }
      if (Object.keys(circuitChanges).length > 0) {
        actions.push({
          type: "update_circuit",
          target: "cluster_circuits",
          details: circuitChanges,
        });
      }
    }

    // 3. Spider targets (passed through to orchestrator)
    if (spec.spiderTargets) {
      for (const target of spec.spiderTargets) {
        actions.push({
          type: "sync_spider_target",
          target: target.name,
          details: target as unknown as Record<string, unknown>,
        });
      }
    }

    return {
      actions,
      hasChanges: actions.length > 0,
    };
  }

  /**
   * Applies the plan directly to the live cluster.
   */
  async apply(spec: AnveshConfigSpec, options?: { prune?: boolean }): Promise<ConfigApplyResult> {
    const plan = await this.plan(spec, options);
    const applied: ConfigDiffAction[] = [];
    const errors: Array<{ target: string; error: string }> = [];

    for (const action of plan.actions) {
      try {
        switch (action.type) {
          case "create_index": {
            const mappings = action.details.mappings as Record<string, FieldMapping>;
            const settings = action.details.settings as IndexSettings;
            await this.engine.createIndex(action.target, mappings, settings);
            applied.push(action);
            break;
          }
          case "update_index": {
            const newMappings = action.details.newMappings as Record<string, FieldMapping>;
            const settings = action.details.settings as IndexSettings;
            const existing = this.engine.getIndex(action.target);
            if (existing) {
              const mergedMappings = { ...existing.mappings, ...newMappings };
              const mergedSettings = { ...existing.settings, ...settings };
              // create or update index
              this.engine.updateSettings(action.target, mergedSettings);
              this.engine.updateMappings(action.target, mergedMappings);
              applied.push(action);
            }
            break;
          }
          case "delete_index": {
            await this.engine.deleteIndex(action.target);
            applied.push(action);
            break;
          }
          case "update_circuit": {
            globalCircuits.setLimits(action.details as any);
            applied.push(action);
            break;
          }
          case "sync_spider_target": {
            // Managed by hub orchestrator / scheduler
            applied.push(action);
            break;
          }
        }
      } catch (err) {
        errors.push({
          target: action.target,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      applied,
      errors,
      success: errors.length === 0,
    };
  }

  /**
   * Exports the live cluster configuration into a declarative spec object.
   */
  export(): AnveshConfigSpec {
    const indexes = this.engine.listIndexes().map((idx) => ({
      name: idx.name,
      mappings: idx.mappings,
      settings: idx.settings,
    }));

    return {
      version: "1.0",
      indexes,
      circuits: globalCircuits.getLimits(),
    };
  }
}
