# Handoff

## State
I reviewed a Gemini CRM chat (mostly wrong — ignored our DDD/Connector architecture). Established 3 CRM reference repos cloned to `/home/pascal/projekte/`: `atomic-crm/`, `kommo-crm-ui-kit/`, `twenty/`. Created `project_crm_planning.md` memory with architecture decisions. Distilled + weeded `specs/reference-atomic-crm.allium` (0 errors, 12 divergences resolved). Distilled + weeded `specs/reference-kommo-ui-kit.allium` (pure UI primitives, no domain — serves as component catalogue).

## Next
1. Distill Twenty CRM spec: `allium:distill` focused on `packages/twenty-server/src/modules/{timeline,workflow,messaging,calendar,person,company,opportunity,note,task}/`. Save to `specs/reference-twenty-crm.allium`. Then `allium:weed` against codebase.
2. After all 3 reference specs done: create JobSync's own `specs/crm.allium` using `allium:elicit` — informed by the three reference specs + Roadmap Sektion 5.
3. S2 (UX Journeys) / S3 (CRM Core) staged prompts still open — see `project_next_session_planning.md`.

## Context
- Twenty is 21K files / 479MB — focus ONLY on the server modules listed above, ignore frontend/infra/monorepo tooling.
- CRM is NOT a Connector/Module in our architecture — it's Core Domain (Roadmap Sektion 5). Memory file `project_crm_planning.md` has the full decision record.
- Use `/allium:distill` skill (not manual), then `/allium:weed` for verification, then `allium check` + `allium analyse` CLI.
