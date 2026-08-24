import { describe, it, expect } from "vitest";
import { componentBehaviors, validateBehaviorsAgainstCatalog } from "../domain/componentBehavior";

describe("Component Behaviors", () => {
  it("defines behaviors that exactly match catalog component terminal definitions with zero drift", () => {
    const result = validateBehaviorsAgainstCatalog();
    if (!result.valid) {
      console.error("Behavior validation errors:", result.errors);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("contains relay internal dependency rules with trigger and ground conditions", () => {
    const relaySpdt = componentBehaviors["relay.spdt"];
    expect(relaySpdt).toBeDefined();
    expect(relaySpdt.internalDependencies?.["87"]).toEqual([
      {
        upstreamTerminal: "30",
        condition: { triggerTerminal: "86", groundTerminal: "85" },
      },
    ]);
  });
});
