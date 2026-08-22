import { describe, expect, it } from "vitest";
import {
  normalizeProjection,
  projectDocument,
} from "../src/projection.js";

describe("MongoDB-style field projection engine", () => {
  const sampleDoc = {
    id: "doc-101",
    fields: {
      title: "Anvesh Search Engine",
      description: "Ultra-fast search with vector support",
      body: "Very long body text with full document contents...",
      price: 99.99,
      inStock: true,
      specs: {
        cpu: "M3 Max",
        ram: "64GB",
        storage: {
          type: "NVMe",
          size: "2TB",
        },
      },
      tags: ["search", "fast", "vector"],
    },
    meta: {
      author: {
        name: "Karthik",
        role: "Lead Architect",
        contact: {
          email: "karthik@example.com",
          slack: "@karthik",
        },
      },
      sourceSystem: "ERP",
      internalAuditId: "AUD-9921",
    },
    updatedAt: "2026-08-22T07:00:00Z",
  };

  it("returns the full document when no projection is specified", () => {
    const res = projectDocument(sampleDoc);
    expect(res).toEqual(sampleDoc);
  });

  describe("Inclusion Projection", () => {
    it("projects fields using MongoDB object syntax { title: 1, price: 1 }", () => {
      const res = projectDocument(sampleDoc, { title: 1, price: 1 });
      expect(res.id).toBe("doc-101");
      expect(res.fields).toEqual({
        title: "Anvesh Search Engine",
        price: 99.99,
      });
      expect(res.meta).toBeUndefined();
    });

    it("projects fields using boolean object syntax { title: true, inStock: true }", () => {
      const res = projectDocument(sampleDoc, { title: true, inStock: true });
      expect(res.fields).toEqual({
        title: "Anvesh Search Engine",
        inStock: true,
      });
      expect(res.meta).toBeUndefined();
    });

    it("projects fields using array syntax ['title', 'price']", () => {
      const res = projectDocument(sampleDoc, ["title", "price"]);
      expect(res.fields).toEqual({
        title: "Anvesh Search Engine",
        price: 99.99,
      });
    });

    it("projects fields using comma-separated string 'title, price'", () => {
      const res = projectDocument(sampleDoc, "title, price");
      expect(res.fields).toEqual({
        title: "Anvesh Search Engine",
        price: 99.99,
      });
    });

    it("supports 'fields.fieldName' prefix explicitly in projection", () => {
      const res = projectDocument(sampleDoc, { "fields.title": 1, "fields.inStock": 1 });
      expect(res.fields).toEqual({
        title: "Anvesh Search Engine",
        inStock: true,
      });
    });
  });

  describe("Nested Field & Dot Notation Projection", () => {
    it("projects nested fields in fields and meta", () => {
      const res = projectDocument(sampleDoc, {
        title: 1,
        "specs.ram": 1,
        "specs.storage.type": 1,
        "meta.author.name": 1,
      });

      expect(res.fields).toEqual({
        title: "Anvesh Search Engine",
        specs: {
          ram: "64GB",
          storage: {
            type: "NVMe",
          },
        },
      });
      expect(res.meta).toEqual({
        author: {
          name: "Karthik",
        },
      });
    });

    it("includes entire meta subdocument when 'meta: 1' is specified", () => {
      const res = projectDocument(sampleDoc, { title: 1, meta: 1 });
      expect(res.fields).toEqual({ title: "Anvesh Search Engine" });
      expect(res.meta).toEqual(sampleDoc.meta);
    });
  });

  describe("Exclusion Projection", () => {
    it("excludes specified fields with { body: 0, description: 0 }", () => {
      const res = projectDocument(sampleDoc, { body: 0, description: 0 });
      expect(res.fields.title).toBe("Anvesh Search Engine");
      expect(res.fields.price).toBe(99.99);
      expect(res.fields.body).toBeUndefined();
      expect(res.fields.description).toBeUndefined();
      expect(res.meta).toEqual(sampleDoc.meta);
    });

    it("excludes nested fields with { 'meta.internalAuditId': 0, 'specs.storage': 0 }", () => {
      const res = projectDocument(sampleDoc, {
        "meta.internalAuditId": 0,
        "specs.storage": 0,
      });
      expect(res.meta.sourceSystem).toBe("ERP");
      expect(res.meta.author.name).toBe("Karthik");
      expect((res.meta as any).internalAuditId).toBeUndefined();
      expect(res.fields.specs.ram).toBe("64GB");
      expect((res.fields.specs as any).storage).toBeUndefined();
    });

    it("excludes fields with prefix '-' in string or array", () => {
      const res = projectDocument(sampleDoc, ["-body", "-description"]);
      expect(res.fields.title).toBe("Anvesh Search Engine");
      expect(res.fields.body).toBeUndefined();
      expect(res.fields.description).toBeUndefined();
    });
  });

  describe("Document ID (_id / id) Handling", () => {
    it("preserves document ID by default during inclusion projection", () => {
      const res = projectDocument(sampleDoc, { title: 1 });
      expect(res.id).toBe("doc-101");
    });

    it("removes document ID when { id: 0 } is specified", () => {
      const res = projectDocument(sampleDoc, { title: 1, id: 0 });
      expect(res.id).toBeUndefined();
      expect(res.fields).toEqual({ title: "Anvesh Search Engine" });
    });

    it("removes document ID when { _id: 0 } is specified (MongoDB convention)", () => {
      const res = projectDocument(sampleDoc, { title: 1, _id: 0 });
      expect(res.id).toBeUndefined();
      expect(res.fields).toEqual({ title: "Anvesh Search Engine" });
    });

    it("removes document ID when '-id' or '-_id' is in array", () => {
      const res = projectDocument(sampleDoc, ["title", "-_id"]);
      expect(res.id).toBeUndefined();
      expect(res.fields).toEqual({ title: "Anvesh Search Engine" });
    });
  });

  describe("Elasticsearch _source and Glob Wildcard Support", () => {
    it("supports glob patterns like 'spec*'", () => {
      const res = projectDocument(sampleDoc, { "spec*": 1 });
      expect(res.fields.specs).toEqual(sampleDoc.fields.specs);
      expect(res.fields.title).toBeUndefined();
    });

    it("supports _source object { includes, excludes }", () => {
      const res = projectDocument(sampleDoc, {
        includes: ["title", "specs.*"],
        excludes: ["specs.storage"],
      });
      expect(res.fields.title).toBe("Anvesh Search Engine");
      expect(res.fields.specs.cpu).toBe("M3 Max");
      expect(res.fields.specs.ram).toBe("64GB");
      expect((res.fields.specs as any).storage).toBeUndefined();
    });

    it("returns minimal source when projection is false (_source: false)", () => {
      const res = projectDocument(sampleDoc, false);
      expect(res.id).toBe("doc-101");
      expect(res.fields).toEqual({});
      expect(res.meta).toBeUndefined();
    });
  });
});
