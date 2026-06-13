/**
 * Welle 4 — Custom JobStatus management UI + grouped status picker.
 * Own namespace (`jobStatus.*`), NOT folded into jobs.ts or settings.ts.
 * Backend error keys live in core (`errors.*`); these are UI-facing strings.
 */
export const jobStatus = {
  en: {
    "jobStatus.title": "Job Statuses",
    "jobStatus.description":
      "Customize the statuses your jobs move through. Each status belongs to a stage that decides its colour, whether it counts as an application, and how it orders on the Kanban board.",
    "jobStatus.sidebarStatuses": "Job Statuses",
    "jobStatus.manageStatuses": "Manage statuses",

    // Stage (category) names
    "jobStatus.stage.lead": "Lead",
    "jobStatus.stage.applied": "Applied",
    "jobStatus.stage.interviewing": "Interviewing",
    "jobStatus.stage.offer": "Offer",
    "jobStatus.stage.won": "Won",
    "jobStatus.stage.lost": "Lost",
    "jobStatus.stage.archived": "Archived",
    "jobStatus.stage": "Stage",
    "jobStatus.selectStage": "Select a stage",

    // Add
    "jobStatus.addStatus": "Add status",
    "jobStatus.statusName": "Status name",
    "jobStatus.statusNamePlaceholder": "e.g. Phone Screen",

    // Row affordances
    "jobStatus.default": "Default",
    "jobStatus.setDefault": "Set as default",
    "jobStatus.moveUp": "Move up",
    "jobStatus.moveDown": "Move down",
    "jobStatus.dragHandle": "Reorder {label}",
    "jobStatus.editStatus": "Edit {label}",
    "jobStatus.deleteStatus": "Delete {label}",
    "jobStatus.jobCount": "{count} jobs",
    "jobStatus.noStatusesInStage": "No statuses in this stage",
    "jobStatus.cannotDeleteDefault": "Set a different default status before deleting this one",
    "jobStatus.cannotDeleteLast": "You must keep at least one status",

    // Edit dialog
    "jobStatus.editTitle": "Edit status",
    "jobStatus.editDescription": "Rename this status or move it to a different stage.",
    "jobStatus.impactWarning":
      "Moving “{label}” to {stage} will mark {count} jobs as submitted applications.",

    // Delete dialogs
    "jobStatus.deleteTitle": "Delete status?",
    "jobStatus.deleteConfirm": "This status is not used by any job and will be removed.",
    "jobStatus.deleteInUseTitle": "Move jobs and delete",
    "jobStatus.deleteInUseDescription":
      "“{label}” is used by {count} jobs. Choose a status to move them to, then delete.",
    "jobStatus.reassignTo": "Move jobs to",
    "jobStatus.selectReassign": "Select a status",
    "jobStatus.moveAndDelete": "Move and delete",

    // Soft cap
    "jobStatus.softCapWarning":
      "You have {count} statuses. More than {max} can make the Kanban board crowded.",

    // Toasts / live region
    "jobStatus.created": "Status added",
    "jobStatus.renamed": "Status updated",
    "jobStatus.reordered": "Status reordered",
    "jobStatus.defaultSet": "Default status updated",
    "jobStatus.deleted": "Status deleted",
    "jobStatus.loadFailed": "Failed to load statuses",
    "jobStatus.retry": "Retry",
    "jobStatus.empty": "No statuses yet",

    // Picker (combobox in the job form)
    "jobStatus.selectStatus": "Select a status",
    "jobStatus.searchStatus": "Search statuses",
    "jobStatus.marksApplied": "Marks as applied",
    "jobStatus.appliedIndicator": "This status counts as a submitted application",
    "jobStatus.selectedAnnouncement": "Selected {label}",
    "jobStatus.selectedAppliedAnnouncement": "Selected {label} — marks as applied",
  },
  de: {
    "jobStatus.title": "Job-Status",
    "jobStatus.description":
      "Passe die Status an, die deine Jobs durchlaufen. Jeder Status gehört zu einer Phase, die seine Farbe bestimmt, ob er als Bewerbung zählt und wie er im Kanban-Board sortiert wird.",
    "jobStatus.sidebarStatuses": "Job-Status",
    "jobStatus.manageStatuses": "Status verwalten",

    "jobStatus.stage.lead": "Vormerkung",
    "jobStatus.stage.applied": "Beworben",
    "jobStatus.stage.interviewing": "Im Gespräch",
    "jobStatus.stage.offer": "Angebot",
    "jobStatus.stage.won": "Zusage",
    "jobStatus.stage.lost": "Absage",
    "jobStatus.stage.archived": "Archiviert",
    "jobStatus.stage": "Phase",
    "jobStatus.selectStage": "Phase auswählen",

    "jobStatus.addStatus": "Status hinzufügen",
    "jobStatus.statusName": "Statusname",
    "jobStatus.statusNamePlaceholder": "z.B. Telefoninterview",

    "jobStatus.default": "Standard",
    "jobStatus.setDefault": "Als Standard festlegen",
    "jobStatus.moveUp": "Nach oben",
    "jobStatus.moveDown": "Nach unten",
    "jobStatus.dragHandle": "{label} umsortieren",
    "jobStatus.editStatus": "{label} bearbeiten",
    "jobStatus.deleteStatus": "{label} löschen",
    "jobStatus.jobCount": "{count} Jobs",
    "jobStatus.noStatusesInStage": "Keine Status in dieser Phase",
    "jobStatus.cannotDeleteDefault": "Lege einen anderen Standardstatus fest, bevor du diesen löschst",
    "jobStatus.cannotDeleteLast": "Es muss mindestens ein Status erhalten bleiben",

    "jobStatus.editTitle": "Status bearbeiten",
    "jobStatus.editDescription": "Benenne diesen Status um oder verschiebe ihn in eine andere Phase.",
    "jobStatus.impactWarning":
      "Wenn du „{label}“ nach {stage} verschiebst, werden {count} Jobs als eingereichte Bewerbungen markiert.",

    "jobStatus.deleteTitle": "Status löschen?",
    "jobStatus.deleteConfirm": "Dieser Status wird von keinem Job verwendet und wird entfernt.",
    "jobStatus.deleteInUseTitle": "Jobs verschieben und löschen",
    "jobStatus.deleteInUseDescription":
      "„{label}“ wird von {count} Jobs verwendet. Wähle einen Status, auf den sie verschoben werden, und lösche dann.",
    "jobStatus.reassignTo": "Jobs verschieben nach",
    "jobStatus.selectReassign": "Status auswählen",
    "jobStatus.moveAndDelete": "Verschieben und löschen",

    "jobStatus.softCapWarning":
      "Du hast {count} Status. Mehr als {max} können das Kanban-Board unübersichtlich machen.",

    "jobStatus.created": "Status hinzugefügt",
    "jobStatus.renamed": "Status aktualisiert",
    "jobStatus.reordered": "Status umsortiert",
    "jobStatus.defaultSet": "Standardstatus aktualisiert",
    "jobStatus.deleted": "Status gelöscht",
    "jobStatus.loadFailed": "Status konnten nicht geladen werden",
    "jobStatus.retry": "Erneut versuchen",
    "jobStatus.empty": "Noch keine Status",

    "jobStatus.selectStatus": "Status auswählen",
    "jobStatus.searchStatus": "Status suchen",
    "jobStatus.marksApplied": "Zählt als Bewerbung",
    "jobStatus.appliedIndicator": "Dieser Status zählt als eingereichte Bewerbung",
    "jobStatus.selectedAnnouncement": "{label} ausgewählt",
    "jobStatus.selectedAppliedAnnouncement": "{label} ausgewählt — zählt als Bewerbung",
  },
  fr: {
    "jobStatus.title": "Statuts d'offre",
    "jobStatus.description":
      "Personnalisez les statuts par lesquels passent vos offres. Chaque statut appartient à une étape qui détermine sa couleur, s'il compte comme une candidature et son ordre sur le tableau Kanban.",
    "jobStatus.sidebarStatuses": "Statuts d'offre",
    "jobStatus.manageStatuses": "Gérer les statuts",

    "jobStatus.stage.lead": "Repérée",
    "jobStatus.stage.applied": "Postulée",
    "jobStatus.stage.interviewing": "En entretien",
    "jobStatus.stage.offer": "Offre",
    "jobStatus.stage.won": "Acceptée",
    "jobStatus.stage.lost": "Refusée",
    "jobStatus.stage.archived": "Archivée",
    "jobStatus.stage": "Étape",
    "jobStatus.selectStage": "Sélectionner une étape",

    "jobStatus.addStatus": "Ajouter un statut",
    "jobStatus.statusName": "Nom du statut",
    "jobStatus.statusNamePlaceholder": "ex. Entretien téléphonique",

    "jobStatus.default": "Par défaut",
    "jobStatus.setDefault": "Définir par défaut",
    "jobStatus.moveUp": "Monter",
    "jobStatus.moveDown": "Descendre",
    "jobStatus.dragHandle": "Réordonner {label}",
    "jobStatus.editStatus": "Modifier {label}",
    "jobStatus.deleteStatus": "Supprimer {label}",
    "jobStatus.jobCount": "{count} offres",
    "jobStatus.noStatusesInStage": "Aucun statut dans cette étape",
    "jobStatus.cannotDeleteDefault": "Définissez un autre statut par défaut avant de supprimer celui-ci",
    "jobStatus.cannotDeleteLast": "Vous devez conserver au moins un statut",

    "jobStatus.editTitle": "Modifier le statut",
    "jobStatus.editDescription": "Renommez ce statut ou déplacez-le vers une autre étape.",
    "jobStatus.impactWarning":
      "Déplacer « {label} » vers {stage} marquera {count} offres comme candidatures envoyées.",

    "jobStatus.deleteTitle": "Supprimer le statut ?",
    "jobStatus.deleteConfirm": "Ce statut n'est utilisé par aucune offre et sera supprimé.",
    "jobStatus.deleteInUseTitle": "Déplacer les offres et supprimer",
    "jobStatus.deleteInUseDescription":
      "« {label} » est utilisé par {count} offres. Choisissez un statut vers lequel les déplacer, puis supprimez.",
    "jobStatus.reassignTo": "Déplacer les offres vers",
    "jobStatus.selectReassign": "Sélectionner un statut",
    "jobStatus.moveAndDelete": "Déplacer et supprimer",

    "jobStatus.softCapWarning":
      "Vous avez {count} statuts. Plus de {max} peut surcharger le tableau Kanban.",

    "jobStatus.created": "Statut ajouté",
    "jobStatus.renamed": "Statut mis à jour",
    "jobStatus.reordered": "Statut réordonné",
    "jobStatus.defaultSet": "Statut par défaut mis à jour",
    "jobStatus.deleted": "Statut supprimé",
    "jobStatus.loadFailed": "Échec du chargement des statuts",
    "jobStatus.retry": "Réessayer",
    "jobStatus.empty": "Aucun statut pour l'instant",

    "jobStatus.selectStatus": "Sélectionner un statut",
    "jobStatus.searchStatus": "Rechercher des statuts",
    "jobStatus.marksApplied": "Compte comme candidature",
    "jobStatus.appliedIndicator": "Ce statut compte comme une candidature envoyée",
    "jobStatus.selectedAnnouncement": "{label} sélectionné",
    "jobStatus.selectedAppliedAnnouncement": "{label} sélectionné — compte comme candidature",
  },
  es: {
    "jobStatus.title": "Estados de empleo",
    "jobStatus.description":
      "Personaliza los estados por los que pasan tus empleos. Cada estado pertenece a una etapa que decide su color, si cuenta como solicitud y cómo se ordena en el tablero Kanban.",
    "jobStatus.sidebarStatuses": "Estados de empleo",
    "jobStatus.manageStatuses": "Gestionar estados",

    "jobStatus.stage.lead": "Guardado",
    "jobStatus.stage.applied": "Solicitado",
    "jobStatus.stage.interviewing": "En entrevista",
    "jobStatus.stage.offer": "Oferta",
    "jobStatus.stage.won": "Aceptado",
    "jobStatus.stage.lost": "Rechazado",
    "jobStatus.stage.archived": "Archivado",
    "jobStatus.stage": "Etapa",
    "jobStatus.selectStage": "Selecciona una etapa",

    "jobStatus.addStatus": "Añadir estado",
    "jobStatus.statusName": "Nombre del estado",
    "jobStatus.statusNamePlaceholder": "ej. Entrevista telefónica",

    "jobStatus.default": "Predeterminado",
    "jobStatus.setDefault": "Establecer como predeterminado",
    "jobStatus.moveUp": "Subir",
    "jobStatus.moveDown": "Bajar",
    "jobStatus.dragHandle": "Reordenar {label}",
    "jobStatus.editStatus": "Editar {label}",
    "jobStatus.deleteStatus": "Eliminar {label}",
    "jobStatus.jobCount": "{count} empleos",
    "jobStatus.noStatusesInStage": "No hay estados en esta etapa",
    "jobStatus.cannotDeleteDefault": "Establece otro estado predeterminado antes de eliminar este",
    "jobStatus.cannotDeleteLast": "Debes conservar al menos un estado",

    "jobStatus.editTitle": "Editar estado",
    "jobStatus.editDescription": "Renombra este estado o muévelo a otra etapa.",
    "jobStatus.impactWarning":
      "Mover «{label}» a {stage} marcará {count} empleos como solicitudes enviadas.",

    "jobStatus.deleteTitle": "¿Eliminar estado?",
    "jobStatus.deleteConfirm": "Este estado no lo usa ningún empleo y se eliminará.",
    "jobStatus.deleteInUseTitle": "Mover empleos y eliminar",
    "jobStatus.deleteInUseDescription":
      "«{label}» lo usan {count} empleos. Elige un estado al que moverlos y luego elimina.",
    "jobStatus.reassignTo": "Mover empleos a",
    "jobStatus.selectReassign": "Selecciona un estado",
    "jobStatus.moveAndDelete": "Mover y eliminar",

    "jobStatus.softCapWarning":
      "Tienes {count} estados. Más de {max} puede saturar el tablero Kanban.",

    "jobStatus.created": "Estado añadido",
    "jobStatus.renamed": "Estado actualizado",
    "jobStatus.reordered": "Estado reordenado",
    "jobStatus.defaultSet": "Estado predeterminado actualizado",
    "jobStatus.deleted": "Estado eliminado",
    "jobStatus.loadFailed": "Error al cargar los estados",
    "jobStatus.retry": "Reintentar",
    "jobStatus.empty": "Aún no hay estados",

    "jobStatus.selectStatus": "Selecciona un estado",
    "jobStatus.searchStatus": "Buscar estados",
    "jobStatus.marksApplied": "Cuenta como solicitud",
    "jobStatus.appliedIndicator": "Este estado cuenta como una solicitud enviada",
    "jobStatus.selectedAnnouncement": "{label} seleccionado",
    "jobStatus.selectedAppliedAnnouncement": "{label} seleccionado — cuenta como solicitud",
  },
} as const;
