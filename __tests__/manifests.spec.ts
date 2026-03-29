import { euresManifest } from "@/lib/connector/job-discovery/modules/eures/manifest";
import { arbeitsagenturManifest } from "@/lib/connector/job-discovery/modules/arbeitsagentur/manifest";
import { jsearchManifest } from "@/lib/connector/job-discovery/modules/jsearch/manifest";
import { ollamaManifest } from "@/lib/connector/ai-provider/modules/ollama/manifest";
import { openaiManifest } from "@/lib/connector/ai-provider/modules/openai/manifest";
import { deepseekManifest } from "@/lib/connector/ai-provider/modules/deepseek/manifest";
import {
  ConnectorType,
  CredentialType,
  type ModuleManifest,
  type AiManifest,
} from "@/lib/connector/manifest";

const allManifests: ModuleManifest[] = [
  euresManifest,
  arbeitsagenturManifest,
  jsearchManifest,
  ollamaManifest,
  openaiManifest,
  deepseekManifest,
];

const jobDiscoveryManifests = [euresManifest, arbeitsagenturManifest, jsearchManifest];
const aiManifests: AiManifest[] = [ollamaManifest, openaiManifest, deepseekManifest];

describe("Module Manifests", () => {
  describe.each(allManifests.map((m) => [m.id, m] as const))(
    "%s manifest",
    (_id, manifest) => {
      it("should have a non-empty id", () => {
        expect(typeof manifest.id).toBe("string");
        expect(manifest.id.length).toBeGreaterThan(0);
      });

      it("should have a non-empty name", () => {
        expect(typeof manifest.name).toBe("string");
        expect(manifest.name.length).toBeGreaterThan(0);
      });

      it("should have a valid ConnectorType", () => {
        expect(Object.values(ConnectorType)).toContain(manifest.connectorType);
      });

      it("should have a valid credential.type", () => {
        expect(Object.values(CredentialType)).toContain(manifest.credential.type);
      });

      it("should have a non-empty credential.moduleId", () => {
        expect(typeof manifest.credential.moduleId).toBe("string");
        expect(manifest.credential.moduleId.length).toBeGreaterThan(0);
      });
    },
  );

  describe("Job Discovery manifests", () => {
    it.each(jobDiscoveryManifests.map((m) => [m.id, m] as const))(
      "%s should have connectorType JOB_DISCOVERY",
      (_id, manifest) => {
        expect(manifest.connectorType).toBe(ConnectorType.JOB_DISCOVERY);
      },
    );
  });

  describe("AI Provider manifests", () => {
    it.each(aiManifests.map((m) => [m.id, m] as const))(
      "%s should have connectorType AI_PROVIDER",
      (_id, manifest) => {
        expect(manifest.connectorType).toBe(ConnectorType.AI_PROVIDER);
      },
    );

    it.each(aiManifests.map((m) => [m.id, m] as const))(
      "%s should have a modelSelection config",
      (_id, manifest) => {
        expect(manifest.modelSelection).toBeDefined();
        expect(typeof manifest.modelSelection).toBe("object");
      },
    );

    it.each(aiManifests.map((m) => [m.id, m] as const))(
      "%s should have a defaultModel in modelSelection",
      (_id, manifest) => {
        expect(manifest.modelSelection.defaultModel).toBeDefined();
        expect(typeof manifest.modelSelection.defaultModel).toBe("string");
        expect(manifest.modelSelection.defaultModel!.length).toBeGreaterThan(0);
      },
    );
  });

  describe("Unique IDs", () => {
    it("should have unique IDs across all manifests", () => {
      const ids = allManifests.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("Manifest count", () => {
    it("should have exactly 6 manifests total", () => {
      expect(allManifests).toHaveLength(6);
    });

    it("should have 3 job discovery manifests", () => {
      expect(jobDiscoveryManifests).toHaveLength(3);
    });

    it("should have 3 AI provider manifests", () => {
      expect(aiManifests).toHaveLength(3);
    });
  });
});
