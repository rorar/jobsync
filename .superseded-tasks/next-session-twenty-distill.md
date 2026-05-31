# Nächste Session: Twenty CRM Distillation

Lies zuerst CLAUDE.md, Memories (~/.claude/projects/-home-pascal/memory/MEMORY.md und ~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md), und .remember/remember.md ein.

Dann: Verwende /allium:distill um eine Allium Spec aus der Twenty CRM Codebase unter /home/pascal/projekte/twenty/ zu erstellen. Fokussiere NUR auf die Server-Module: packages/twenty-server/src/modules/{timeline,workflow,messaging,calendar,person,company,opportunity,note,task}/. Speichere als specs/reference-twenty-crm.allium. Danach /allium:weed über die vollständige Twenty Codebase. Danach allium check + allium analyse CLI.

Kontext: Siehe project_crm_planning.md — Twenty ist eine von 3 CRM-Referenzen (Atomic CRM + Kommo sind bereits fertig distilliert). Wir bauen KEIN Twenty nach — wir nutzen es als Referenz für fortgeschrittene CRM-Patterns (Timeline, Workflows, Email, Calendar) für JobSync Roadmap Sektion 5.
