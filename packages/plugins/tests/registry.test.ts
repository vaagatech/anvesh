import { describe, it, expect } from "vitest";
import { createPluginRegistry, type AnveshPlugin } from "../src/index.js";

const echoPlugin: AnveshPlugin = {
  name: "echo",
  version: "1.0.0",
  description: "Echo tool for tests",
  kind: "utility",
  tools: [
    {
      name: "echo.say",
      description: "Echo a string back",
      parameters: {
        type: "object",
        properties: { text: { type: "string", description: "Text to echo" } },
        required: ["text"],
      },
      execute: (args) => ({ echoed: String(args.text ?? "") }),
    },
  ],
  hooks: {
    correctSummary: (message) => message.replace(/\s+/g, " ").trim(),
  },
};

describe("PluginRegistry", () => {
  it("registers plugins and lists tools like an LLM catalog", () => {
    const reg = createPluginRegistry({ host: "test" });
    reg.register(echoPlugin);
    expect(reg.listPlugins()).toHaveLength(1);
    expect(reg.listTools()[0]?.name).toBe("echo.say");
    expect(reg.listTools()[0]?.parameters.properties.text).toBeDefined();
  });

  it("invokes tools by name", async () => {
    const reg = createPluginRegistry({ host: "test" });
    reg.register(echoPlugin);
    const res = await reg.invoke("echo.say", { text: "hello" });
    expect(res.ok).toBe(true);
    expect(res.result).toEqual({ echoed: "hello" });
  });

  it("runs correctSummary hooks", async () => {
    const reg = createPluginRegistry({ host: "test" });
    reg.register(echoPlugin);
    const out = await reg.correctSummary("  hi   there  ");
    expect(out).toBe("hi there");
  });
});
