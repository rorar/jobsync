export const automations = {
  en: {
    // AutomationWizard - Steps
    "automations.stepBasics": "Basics",
    "automations.stepSearch": "Search",
    "automations.stepResume": "Resume",
    "automations.stepMatching": "Matching",
    "automations.stepSchedule": "Schedule",
    "automations.stepReview": "Review",
    "automations.stepBasicsDesc": "Name your automation and choose a job board",
    "automations.stepSearchDesc": "Define your job search criteria",
    "automations.stepResumeDesc": "Select a resume for AI matching",
    "automations.stepMatchingDesc": "Set your minimum match threshold",
    "automations.stepScheduleDesc": "Choose when the automation should run",
    "automations.stepReviewDesc": "Review your automation settings",

    // AutomationWizard - Form labels, placeholders, descriptions
    "automations.automationName": "Automation Name",
    "automations.automationNamePlaceholder": "e.g. Frontend Jobs Berlin",
    "automations.automationNameDesc": "Give your automation a descriptive name",
    "automations.jobBoard": "Job Board",
    "automations.selectJobBoard": "Select a job board",
    "automations.jobBoardDesc": "Choose which job board to search",
    "automations.jsearch": "JSearch",
    "automations.eures": "EURES",
    "automations.arbeitsagentur": "Arbeitsagentur (DE)",
    "automations.searchKeywords": "Search Keywords",
    "automations.keywordsPlaceholder": "e.g. React Developer, Frontend Engineer",
    "automations.keywordsDesc": "Enter keywords to search for relevant jobs",
    "automations.location": "Location",
    "automations.locationPlaceholder": "e.g. Berlin, Germany",
    "automations.locationDesc": "Specify the job location or leave empty for remote",
    "automations.resumeForMatching": "Resume for Matching",
    "automations.selectResume": "Select a resume",
    "automations.resumeMatchDesc": "Choose a resume to match against job listings",
    "automations.noResumes": "No resumes available",
    "automations.matchThreshold": "Match Threshold",
    "automations.matchThresholdDesc": "Minimum match percentage to save a job",
    "automations.dailyRunTime": "Daily Run Time",
    "automations.selectTime": "Select a time",
    "automations.scheduleDesc": "The automation will run daily at the selected time",

    // AutomationWizard - Review section
    "automations.reviewName": "Name",
    "automations.reviewJobBoard": "Job Board",
    "automations.reviewKeywords": "Keywords",
    "automations.reviewLocation": "Location",
    "automations.reviewResume": "Resume",
    "automations.reviewMatchThreshold": "Match Threshold",
    "automations.reviewSchedule": "Schedule",
    "automations.notSelected": "Not selected",
    "automations.dailyAt": "Daily at",

    // AutomationWizard - Buttons and navigation
    "automations.editAutomation": "Edit Automation",
    "automations.createAutomation": "Create Automation",
    "automations.updateAutomation": "Update Automation",
    "automations.step": "Step",
    "automations.of": "of",
    "automations.back": "Back",
    "automations.next": "Next",

    // AutomationWizard - Toasts
    "automations.automationUpdated": "Automation Updated",
    "automations.automationCreated": "Automation Created",
    "automations.automationUpdatedDesc": "Your automation has been updated successfully",
    "automations.automationCreatedDesc": "Your automation has been created successfully",
    "automations.validationError": "Validation Error",
    "automations.somethingWentWrong": "Something went wrong",
    "automations.failedToSave": "Failed to save the automation",

    // AutomationContainer
    "automations.jobDiscovery": "Job Discovery",
    "automations.needResume": "You need to upload a resume before creating automations",
    "automations.goToProfile": "Go to Profile",

    // AutomationList - List items
    "automations.noAutomations": "No automations yet",
    "automations.noAutomationsDesc": "Create your first automation to start discovering jobs automatically",
    "automations.resumeMissing": "Resume missing",
    "automations.keywords": "Keywords",
    "automations.locationLabel": "Location",
    "automations.resumeLabel": "Resume",
    "automations.daily": "Daily",
    "automations.threshold": "Threshold",
    "automations.nextRun": "Next",
    "automations.lastRun": "Last",

    // AutomationList - Menu actions
    "automations.pause": "Pause",
    "automations.resume": "Resume",
    "automations.edit": "Edit",
    "automations.delete": "Delete",

    // AutomationList - Delete dialog
    "automations.deleteTitle": "Delete Automation",
    "automations.deleteDesc": "Are you sure you want to delete this automation? This action cannot be undone.",

    // AutomationList - Toasts
    "automations.deleting": "Deleting...",
    "automations.automationPaused": "Automation paused",
    "automations.automationResumed": "Automation resumed",
    "automations.automationDeleted": "Automation deleted",

    // AutomationDetailPage - Toasts & buttons
    "automations.runNow": "Run Now",
    "automations.runStarted": "Automation run started",
    "automations.savedNewJobs": "Saved {count} new jobs",
    "automations.runFailed": "Failed to run automation",
    "automations.loadFailed": "Failed to load automation details",
    "automations.deleteBlocked": "Cannot delete: automation is currently running",

    // AutomationList - Pause reasons
    "automations.pauseReasonModuleDeactivated": "Module was deactivated",
    "automations.pauseReasonAuthFailure": "Authentication failed — check credentials",
    "automations.pauseReasonConsecutiveFailures": "Paused after repeated failures",
    "automations.pauseReasonCbEscalation": "Service temporarily unavailable",

    // DiscoveredJobsList
    "automations.noDiscoveredJobs": "No discovered jobs",
    "automations.noDiscoveredJobsDesc": "Jobs will appear here once your automations find matches",
    "automations.discoveredJobs": "Discovered Jobs",
    "automations.discoveredJobsDesc": "Jobs found by your automations",
    "automations.job": "Job",
    "automations.company": "Company",
    "automations.locationHeader": "Location",
    "automations.match": "Match",
    "automations.status": "Status",
    "automations.discovered": "Discovered",
    "automations.actions": "Actions",
    "automations.jobAccepted": "Job accepted",
    "automations.jobAcceptedDesc": "The job has been added to your job list",
    "automations.jobDismissed": "Job dismissed",

    // LogsTab
    "automations.automationLogs": "Automation Logs",
    "automations.running": "Running",
    "automations.all": "All",
    "automations.info": "Info",
    "automations.success": "Success",
    "automations.warning": "Warning",
    "automations.errorLog": "Error",
    "automations.started": "Started",
    "automations.completed": "Completed",
    "automations.noLogs": "No logs available",
    "automations.noLogsFilter": "No logs match the selected filter",

    // MatchDetails
    "automations.matchSummary": "Match Summary",
    "automations.skillsAnalysis": "Skills Analysis",
    "automations.matchedSkills": "Matched Skills",
    "automations.missingSkills": "Missing Skills",
    "automations.transferableSkills": "Transferable Skills",
    "automations.requirementsAnalysis": "Requirements Analysis",
    "automations.metRequirements": "Met Requirements",
    "automations.missingRequirements": "Missing Requirements",
    "automations.tailoringTips": "Tailoring Tips",
    "automations.dealBreakers": "Deal Breakers",
    "automations.matchedWithResume": "Matched with resume",
    "automations.matchedOn": "Matched on",
    "automations.discoveredOn": "Discovered on",

    // RunHistoryList
    "automations.noRuns": "No runs yet",
    "automations.noRunsDesc": "Run history will appear here after your automation runs for the first time",
    "automations.runHistory": "Run History",
    "automations.runHistoryDesc": "History of automation runs and their results",
    "automations.statusHeader": "Status",
    "automations.startedHeader": "Started",
    "automations.duration": "Duration",
    "automations.searched": "Searched",
    "automations.new": "New",
    "automations.processed": "Processed",
    "automations.matched": "Matched",
    "automations.saved": "Saved",
    "automations.errorHeader": "Error",

    // EuresLocationCombobox
    "automations.maxLocations": "Max {max} locations reached",
    "automations.locationsSelected": "{count} location(s) selected",
    "automations.selectCountries": "Select countries or regions...",
    "automations.searchCountries": "Search countries or NUTS regions...",
    "automations.noLocations": "No locations found.",
    "automations.allOf": "All of {country}",
    "automations.jobs": "jobs",

    // EuresOccupationCombobox
    "automations.maxKeywords": "Max {max} keywords reached",
    "automations.keywordsSelected": "{count} keyword(s) selected",
    "automations.searchOccupations": "Search ESCO occupations or type keywords...",
    "automations.searchOccupationsPlaceholder": "Search occupations or type custom keyword...",
    "automations.customKeyword": "Custom keyword",
    "automations.escoOccupations": "ESCO Occupations",
    "automations.addKeyword": "Add \"{keyword}\"",
    "automations.enterKey": "Enter ↵",
    "automations.typeToSearch": "Type to search ESCO occupations...",
    "automations.couldNotLoad": "Could not load occupation details.",
    "automations.iscoGroup": "ISCO Group:",
    "automations.escoPortal": "ESCO Portal",
    "automations.euresJobs": "EURES Jobs",
    "automations.loadingOccupation": "Loading...",

    // EuresLocationCombobox - InfoTooltip
    "automations.tooltipCountryCodes": "Country Codes",
    "automations.tooltipCountryCodesDesc": "ISO 3166-1 alpha-2 codes (e.g., DE for Germany, AT for Austria). Selects all job vacancies in that country.",
    "automations.tooltipNutsRegions": "NUTS Region Codes",
    "automations.tooltipNutsDesc": "Nomenclature of Territorial Units for Statistics. Hierarchical codes for EU regions (e.g., DE1 = Baden-Württemberg). More specific than country codes.",
    "automations.tooltipNS": "NS: Not Specified",
    "automations.tooltipNSDesc": "Vacancies where the employer did not specify a region within the country.",

    // EuresOccupationCombobox - InfoTooltip
    "automations.tooltipEsco": "ESCO Occupations",
    "automations.tooltipEscoDesc": "Search the European Skills, Competences, Qualifications and Occupations taxonomy. Selected occupations are matched against EURES job vacancies.",
    "automations.tooltipCustom": "Custom Keywords",
    "automations.tooltipCustomDesc": "Type any keyword and press Enter to add it as a free-text search term. Useful for non-standard job titles.",
    "automations.tooltipIsco": "ISCO Groups",
    "automations.tooltipIscoDesc": "Click the eye icon on a chip to see the ISCO classification group, which includes related occupations for broader searches.",

    // U2: JSearch API Key Check
    "automations.jsearchApiKeyRequired": "API Key required — configure in Settings",
    "automations.configureApiKey": "Go to Settings → API Keys",
    "automations.noApiKeyNeeded": "No API key needed",

    // U3: Threshold Toggle
    "automations.enableAiScoring": "Enable AI Match Scoring",
    "automations.enableAiScoringDesc": "Use AI to score and filter discovered jobs against your resume",
    "automations.collectOnlyMode": "Collect only (no AI scoring)",
    "automations.collectOnlyDesc": "All discovered jobs will be collected without AI match scoring. You can review them manually.",
    "automations.disabled": "Disabled",

    // U4: Flexible Runtimes
    "automations.scheduleFrequency": "Run Frequency",
    "automations.selectFrequency": "Select frequency",
    "automations.scheduleFrequencyDesc": "How often the automation should search for new jobs",
    "automations.scheduleEvery6Hours": "Every 6 hours",
    "automations.scheduleEvery12Hours": "Every 12 hours",
    "automations.scheduleDaily": "Daily",
    "automations.scheduleEvery2Days": "Every 2 days",
    "automations.scheduleWeekly": "Weekly",
    "automations.preferredStartTime": "Preferred Start Time",

    // Resume Combobox
    "automations.searchResume": "Search resumes...",
    "automations.noResumeFound": "No resume found",

    // Create & Run Now
    "automations.createAndRun": "Create & Run Now",

    // Performance warning
    "automations.performanceWarning": "You have many automations. This may impact system performance. Make sure you have sufficient resources.",
    "automations.performanceWarningBanner": "You have {count} automations. Many automations may impact system performance. Make sure you have sufficient resources.",

    // Connector Params — Section header
    "automations.connectorParams": "Advanced Search Options",

    // Connector Params — Arbeitsagentur
    "automations.params.umkreis": "Radius (km)",
    "automations.params.veroeffentlichtseit": "Published within (days)",
    "automations.params.arbeitszeit": "Working time",
    "automations.params.befristung": "Contract type",
    "automations.paramOption.arbeitsagentur.arbeitszeit.vz": "Full-time",
    "automations.paramOption.arbeitsagentur.arbeitszeit.tz": "Part-time",
    "automations.paramOption.arbeitsagentur.arbeitszeit.snw": "Shift/night/weekend",
    "automations.paramOption.arbeitsagentur.arbeitszeit.mj": "Mini-job",
    "automations.paramOption.arbeitsagentur.arbeitszeit.ho": "Home office",
    "automations.paramOption.arbeitsagentur.befristung.1": "Permanent",
    "automations.paramOption.arbeitsagentur.befristung.2": "Temporary",

    // Connector Params — EURES: publicationPeriod
    "automations.params.publicationPeriod": "Published within",
    "automations.paramOption.eures.publicationPeriod.LAST_DAY": "Last day",
    "automations.paramOption.eures.publicationPeriod.LAST_THREE_DAYS": "Last 3 days",
    "automations.paramOption.eures.publicationPeriod.LAST_WEEK": "Last week",
    "automations.paramOption.eures.publicationPeriod.LAST_MONTH": "Last month",

    // Connector Params — EURES: experience level
    "automations.params.experienceLevel": "Experience level",
    "automations.paramOption.eures.requiredExperienceCodes.none_required": "No experience required",
    "automations.paramOption.eures.requiredExperienceCodes.up_to_1_year": "Up to 1 year",
    "automations.paramOption.eures.requiredExperienceCodes.between_1_and_2_years": "1-2 years",
    "automations.paramOption.eures.requiredExperienceCodes.between_2_and_5_years": "2-5 years",
    "automations.paramOption.eures.requiredExperienceCodes.more_than_5_years": "More than 5 years",

    // Connector Params — EURES: position offering
    "automations.params.positionOffering": "Position type",
    "automations.paramOption.eures.positionOfferingCodes.directhire": "Direct hire",
    "automations.paramOption.eures.positionOfferingCodes.contract": "Contract",
    "automations.paramOption.eures.positionOfferingCodes.temporary": "Temporary",
    "automations.paramOption.eures.positionOfferingCodes.internship": "Internship",
    "automations.paramOption.eures.positionOfferingCodes.apprenticeship": "Apprenticeship",
    "automations.paramOption.eures.positionOfferingCodes.selfemployed": "Self-employed",
    "automations.paramOption.eures.positionOfferingCodes.seasonal": "Seasonal",
    "automations.paramOption.eures.positionOfferingCodes.volunteer": "Volunteer",

    // Connector Params — EURES: working time
    "automations.params.workingTime": "Working time",
    "automations.paramOption.eures.positionScheduleCodes.fulltime": "Full-time",
    "automations.paramOption.eures.positionScheduleCodes.parttime": "Part-time",
    "automations.paramOption.eures.positionScheduleCodes.flextime": "Flextime",

    // Connector Params — EURES: education level
    "automations.params.educationLevel": "Education level",
    "automations.paramOption.eures.educationLevelCodes.basic": "Basic education",
    "automations.paramOption.eures.educationLevelCodes.medium": "Secondary education",
    "automations.paramOption.eures.educationLevelCodes.bachelor": "Bachelor's degree",
    "automations.paramOption.eures.educationLevelCodes.master": "Master's degree",
    "automations.paramOption.eures.educationLevelCodes.tertiary": "Tertiary education",
    "automations.paramOption.eures.educationLevelCodes.doctoral": "Doctoral degree",

    // Connector Params — EURES: sector
    "automations.params.sector": "Industry sector",

    // Connector Params — EURES: EURES flag
    "automations.params.euresFlag": "EURES flag",
    "automations.paramOption.eures.euresFlagCodes.WITH": "EURES vacancies only",
    "automations.paramOption.eures.euresFlagCodes.WITHOUT": "Non-EURES vacancies only",

    // Connector Params — EURES: required languages
    "automations.params.requiredLanguages": "Required languages",

    // Connector Params — EURES: keyword search scope
    "automations.params.keywordSearchScope": "Keyword search scope",
    "automations.paramOption.eures.specificSearchCode.EVERYWHERE": "Everywhere",
    "automations.paramOption.eures.specificSearchCode.TITLE": "Job title only",
    "automations.paramOption.eures.specificSearchCode.DESCRIPTION": "Description only",
    "automations.paramOption.eures.specificSearchCode.EMPLOYER": "Employer name only",

    // Connector Params — EURES: sort order
    "automations.params.sortOrder": "Sort order",
    "automations.paramOption.eures.sortSearch.BEST_MATCH": "Best match",
    "automations.paramOption.eures.sortSearch.MOST_RECENT": "Most recent",

    // Scheduler Coordination (ROADMAP 0.10)
    "automations.queued": "Queued",
    "automations.alreadyRunning": "This automation is already running",
    "automations.moduleBusy": "Module is busy with another automation",
    "automations.schedulerIdle": "Idle",
    "automations.schedulerRunning": "Scheduler running",
    "automations.runSourceScheduler": "Scheduled",
    "automations.runSourceManual": "Manual",
    "automations.sourceHeader": "Source",

    // SchedulerStatusBar (B1)
    "automations.schedulerPhaseRunning": "Running",
    "automations.schedulerPhaseCooldown": "Finishing...",
    "automations.schedulerStatus": "Scheduler Status",
    "automations.schedulerPhase": "Phase",
    "automations.schedulerActive": "Active",
    "automations.schedulerModule": "Module",
    "automations.schedulerQueueRemaining": "remaining",
    "automations.schedulerLastCompleted": "Last completed",
    "automations.schedulerNoAutomations": "No automations configured",

    // ConflictWarningDialog (B2)
    "automations.conflictBlocked": "Automation Already Running",
    "automations.conflictBlockedDesc": "This automation is already running. Please wait for it to complete.",
    "automations.conflictContention": "Module In Use",
    "automations.conflictContentionDesc": "The module is currently used by another automation. Results may be rate-limited.",
    "automations.conflictProceed": "Proceed Anyway",
    "automations.conflictCancel": "Cancel",
    "automations.conflictStartedAt": "Started",
    "automations.conflictSource": "Source",

    // RunProgressPanel (B3)
    "automations.runProgress": "Run Progress",
    "automations.phaseSearch": "Search",
    "automations.phaseDedup": "Dedup",
    "automations.phaseEnrich": "Enrich",
    "automations.phaseMatch": "Match",
    "automations.phaseSave": "Save",
    "automations.phaseFinalize": "Finalize",

    // Staging Queue live updates (B10)
    "automations.newItemsAvailable": "New items have arrived",
    "automations.showNewItems": "Show new items",

    // Detail page labels (A9 i18n) + B6 tooltip
    "automations.never": "Never",
    "automations.tabLogs": "Logs",
    "automations.total": "total",
    "automations.runNowPaused": "Cannot run while automation is paused",
    "automations.runNowResumeMissing": "Cannot run without a resume assigned",
    "automations.notFound": "Automation not found",
    "automations.statusRunning": "Running",
    "automations.statusCompleted": "Completed",
    "automations.statusFailed": "Failed",
    "automations.statusCompletedWithErrors": "Completed with errors",
    "automations.statusBlocked": "Blocked",
    "automations.statusRateLimited": "Rate limited",

    // AutomationList - Status & Module display
    "automations.statusActive": "Active",
    "automations.statusPaused": "Paused",
    "automations.moduleEures": "EURES",
    "automations.moduleArbeitsagentur": "Arbeitsagentur",
    "automations.moduleJsearch": "JSearch",

    // RunHistoryList - Blocked reasons
    "automations.blockedAlreadyRunning": "Already running",
    "automations.blockedModuleBusy": "Module busy",
    "automations.blockedModuleDeactivated": "Module deactivated",
    "automations.blockedAuthFailure": "Authentication failure",
    "automations.blockedConsecutiveFailures": "Consecutive failures",
    "automations.blockedCircuitBreaker": "Circuit breaker tripped",
    "automations.blockedResumeMissing": "Resume missing",
    "automations.blockedUnknown": "Blocked",
    // elapsed time
    "automations.elapsedHourMinSec": "{hour}h {min}m {sec}s",
    "automations.elapsedMinSec": "{min}m {sec}s",
    "automations.elapsedSec": "{sec}s",
    "automations.queuedCount": "{count} automations queued",
    // run history
    "automations.runHistoryError": "Failed to load run history",
    "automations.runHistoryRetry": "Retry",
    "automations.runEnded": "Run completed",
    // detail header a11y
    "automations.backToList": "Back to automations list",
    "automations.refresh": "Refresh",
  },
  de: {
    // AutomationWizard - Steps
    "automations.stepBasics": "Grundlagen",
    "automations.stepSearch": "Suche",
    "automations.stepResume": "Lebenslauf",
    "automations.stepMatching": "Abgleich",
    "automations.stepSchedule": "Zeitplan",
    "automations.stepReview": "Überprüfung",
    "automations.stepBasicsDesc": "Benennen Sie Ihre Automatisierung und wählen Sie eine Jobbörse",
    "automations.stepSearchDesc": "Definieren Sie Ihre Suchkriterien",
    "automations.stepResumeDesc": "Wählen Sie einen Lebenslauf für den KI-Abgleich",
    "automations.stepMatchingDesc": "Legen Sie Ihre Mindestübereinstimmung fest",
    "automations.stepScheduleDesc": "Wählen Sie, wann die Automatisierung laufen soll",
    "automations.stepReviewDesc": "Überprüfen Sie Ihre Automatisierungseinstellungen",

    // AutomationWizard - Form labels, placeholders, descriptions
    "automations.automationName": "Automatisierungsname",
    "automations.automationNamePlaceholder": "z.B. Frontend-Jobs Berlin",
    "automations.automationNameDesc": "Geben Sie Ihrer Automatisierung einen beschreibenden Namen",
    "automations.jobBoard": "Jobbörse",
    "automations.selectJobBoard": "Jobbörse auswählen",
    "automations.jobBoardDesc": "Wählen Sie die zu durchsuchende Jobbörse",
    "automations.jsearch": "JSearch",
    "automations.eures": "EURES",
    "automations.arbeitsagentur": "Arbeitsagentur (DE)",
    "automations.searchKeywords": "Suchbegriffe",
    "automations.keywordsPlaceholder": "z.B. React-Entwickler, Frontend-Ingenieur",
    "automations.keywordsDesc": "Geben Sie Suchbegriffe für relevante Stellen ein",
    "automations.location": "Standort",
    "automations.locationPlaceholder": "z.B. Berlin, Deutschland",
    "automations.locationDesc": "Geben Sie den Arbeitsort an oder lassen Sie das Feld für Remote-Stellen leer",
    "automations.resumeForMatching": "Lebenslauf für Abgleich",
    "automations.selectResume": "Lebenslauf auswählen",
    "automations.resumeMatchDesc": "Wählen Sie einen Lebenslauf zum Abgleich mit Stellenangeboten",
    "automations.noResumes": "Keine Lebensläufe verfügbar",
    "automations.matchThreshold": "Übereinstimmungsschwelle",
    "automations.matchThresholdDesc": "Mindestprozentsatz der Übereinstimmung zum Speichern einer Stelle",
    "automations.dailyRunTime": "Tägliche Laufzeit",
    "automations.selectTime": "Uhrzeit auswählen",
    "automations.scheduleDesc": "Die Automatisierung wird täglich zur ausgewählten Uhrzeit ausgeführt",

    // AutomationWizard - Review section
    "automations.reviewName": "Name",
    "automations.reviewJobBoard": "Jobbörse",
    "automations.reviewKeywords": "Suchbegriffe",
    "automations.reviewLocation": "Standort",
    "automations.reviewResume": "Lebenslauf",
    "automations.reviewMatchThreshold": "Übereinstimmungsschwelle",
    "automations.reviewSchedule": "Zeitplan",
    "automations.notSelected": "Nicht ausgewählt",
    "automations.dailyAt": "Täglich um",

    // AutomationWizard - Buttons and navigation
    "automations.editAutomation": "Automatisierung bearbeiten",
    "automations.createAutomation": "Automatisierung erstellen",
    "automations.updateAutomation": "Automatisierung aktualisieren",
    "automations.step": "Schritt",
    "automations.of": "von",
    "automations.back": "Zurück",
    "automations.next": "Weiter",

    // AutomationWizard - Toasts
    "automations.automationUpdated": "Automatisierung aktualisiert",
    "automations.automationCreated": "Automatisierung erstellt",
    "automations.automationUpdatedDesc": "Ihre Automatisierung wurde erfolgreich aktualisiert",
    "automations.automationCreatedDesc": "Ihre Automatisierung wurde erfolgreich erstellt",
    "automations.validationError": "Validierungsfehler",
    "automations.somethingWentWrong": "Etwas ist schiefgelaufen",
    "automations.failedToSave": "Automatisierung konnte nicht gespeichert werden",

    // AutomationContainer
    "automations.jobDiscovery": "Job-Entdeckung",
    "automations.needResume": "Sie müssen einen Lebenslauf hochladen, bevor Sie Automatisierungen erstellen können",
    "automations.goToProfile": "Zum Profil",

    // AutomationList - List items
    "automations.noAutomations": "Noch keine Automatisierungen",
    "automations.noAutomationsDesc": "Erstellen Sie Ihre erste Automatisierung, um automatisch Jobs zu entdecken",
    "automations.resumeMissing": "Lebenslauf fehlt",
    "automations.keywords": "Suchbegriffe",
    "automations.locationLabel": "Standort",
    "automations.resumeLabel": "Lebenslauf",
    "automations.daily": "Täglich",
    "automations.threshold": "Schwelle",
    "automations.nextRun": "Nächste",
    "automations.lastRun": "Letzte",

    // AutomationList - Menu actions
    "automations.pause": "Pausieren",
    "automations.resume": "Fortsetzen",
    "automations.edit": "Bearbeiten",
    "automations.delete": "Löschen",

    // AutomationList - Delete dialog
    "automations.deleteTitle": "Automatisierung löschen",
    "automations.deleteDesc": "Sind Sie sicher, dass Sie diese Automatisierung löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.",

    // AutomationList - Toasts
    "automations.deleting": "Wird gelöscht...",
    "automations.automationPaused": "Automatisierung pausiert",
    "automations.automationResumed": "Automatisierung fortgesetzt",
    "automations.automationDeleted": "Automatisierung gelöscht",

    // AutomationDetailPage - Toasts & buttons
    "automations.runNow": "Jetzt starten",
    "automations.runStarted": "Automationslauf gestartet",
    "automations.savedNewJobs": "{count} neue Stellen gespeichert",
    "automations.runFailed": "Automationslauf fehlgeschlagen",
    "automations.loadFailed": "Automationsdetails konnten nicht geladen werden",
    "automations.deleteBlocked": "Löschen nicht möglich: Automation läuft gerade",

    // AutomationList - Pause reasons
    "automations.pauseReasonModuleDeactivated": "Modul wurde deaktiviert",
    "automations.pauseReasonAuthFailure": "Authentifizierung fehlgeschlagen — Anmeldedaten pruefen",
    "automations.pauseReasonConsecutiveFailures": "Nach wiederholten Fehlern pausiert",
    "automations.pauseReasonCbEscalation": "Dienst voruebergehend nicht verfuegbar",

    // DiscoveredJobsList
    "automations.noDiscoveredJobs": "Keine entdeckten Stellen",
    "automations.noDiscoveredJobsDesc": "Stellen erscheinen hier, sobald Ihre Automatisierungen Treffer finden",
    "automations.discoveredJobs": "Entdeckte Stellen",
    "automations.discoveredJobsDesc": "Von Ihren Automatisierungen gefundene Stellen",
    "automations.job": "Stelle",
    "automations.company": "Unternehmen",
    "automations.locationHeader": "Standort",
    "automations.match": "Übereinstimmung",
    "automations.status": "Status",
    "automations.discovered": "Entdeckt",
    "automations.actions": "Aktionen",
    "automations.jobAccepted": "Stelle angenommen",
    "automations.jobAcceptedDesc": "Die Stelle wurde Ihrer Jobliste hinzugefügt",
    "automations.jobDismissed": "Stelle abgelehnt",

    // LogsTab
    "automations.automationLogs": "Automatisierungsprotokolle",
    "automations.running": "Läuft",
    "automations.all": "Alle",
    "automations.info": "Info",
    "automations.success": "Erfolg",
    "automations.warning": "Warnung",
    "automations.errorLog": "Fehler",
    "automations.started": "Gestartet",
    "automations.completed": "Abgeschlossen",
    "automations.noLogs": "Keine Protokolle verfügbar",
    "automations.noLogsFilter": "Keine Protokolle entsprechen dem ausgewählten Filter",

    // MatchDetails
    "automations.matchSummary": "Übereinstimmungsübersicht",
    "automations.skillsAnalysis": "Kompetenzanalyse",
    "automations.matchedSkills": "Übereinstimmende Fähigkeiten",
    "automations.missingSkills": "Fehlende Fähigkeiten",
    "automations.transferableSkills": "Übertragbare Fähigkeiten",
    "automations.requirementsAnalysis": "Anforderungsanalyse",
    "automations.metRequirements": "Erfüllte Anforderungen",
    "automations.missingRequirements": "Fehlende Anforderungen",
    "automations.tailoringTips": "Anpassungstipps",
    "automations.dealBreakers": "Ausschlusskriterien",
    "automations.matchedWithResume": "Abgeglichen mit Lebenslauf",
    "automations.matchedOn": "Abgeglichen am",
    "automations.discoveredOn": "Entdeckt am",

    // RunHistoryList
    "automations.noRuns": "Noch keine Durchläufe",
    "automations.noRunsDesc": "Der Verlauf wird hier angezeigt, nachdem Ihre Automatisierung zum ersten Mal gelaufen ist",
    "automations.runHistory": "Verlauf",
    "automations.runHistoryDesc": "Verlauf der Automatisierungsdurchläufe und deren Ergebnisse",
    "automations.statusHeader": "Status",
    "automations.startedHeader": "Gestartet",
    "automations.duration": "Dauer",
    "automations.searched": "Durchsucht",
    "automations.new": "Neu",
    "automations.processed": "Verarbeitet",
    "automations.matched": "Übereinstimmend",
    "automations.saved": "Gespeichert",
    "automations.errorHeader": "Fehler",

    // EuresLocationCombobox
    "automations.maxLocations": "Maximal {max} Standorte erreicht",
    "automations.locationsSelected": "{count} Standort(e) ausgewählt",
    "automations.selectCountries": "Länder oder Regionen auswählen...",
    "automations.searchCountries": "Länder oder NUTS-Regionen suchen...",
    "automations.noLocations": "Keine Standorte gefunden.",
    "automations.allOf": "Ganz {country}",
    "automations.jobs": "Jobs",

    // EuresOccupationCombobox
    "automations.maxKeywords": "Maximal {max} Suchbegriffe erreicht",
    "automations.keywordsSelected": "{count} Suchbegriff(e) ausgewählt",
    "automations.searchOccupations": "ESCO-Berufe suchen oder Suchbegriffe eingeben...",
    "automations.searchOccupationsPlaceholder": "Berufe suchen oder eigenen Suchbegriff eingeben...",
    "automations.customKeyword": "Eigener Suchbegriff",
    "automations.escoOccupations": "ESCO-Berufe",
    "automations.addKeyword": "\"{keyword}\" hinzufügen",
    "automations.enterKey": "Enter ↵",
    "automations.typeToSearch": "Tippen um ESCO-Berufe zu suchen...",
    "automations.couldNotLoad": "Berufsdetails konnten nicht geladen werden.",
    "automations.iscoGroup": "ISCO-Gruppe:",
    "automations.escoPortal": "ESCO-Portal",
    "automations.euresJobs": "EURES-Jobs",
    "automations.loadingOccupation": "Laden...",

    // EuresLocationCombobox - InfoTooltip
    "automations.tooltipCountryCodes": "Ländercodes",
    "automations.tooltipCountryCodesDesc": "ISO 3166-1 Alpha-2-Codes (z.B. DE für Deutschland, AT für Österreich). Wählt alle Stellenangebote in diesem Land aus.",
    "automations.tooltipNutsRegions": "NUTS-Regionscodes",
    "automations.tooltipNutsDesc": "Systematik der Gebietseinheiten für die Statistik. Hierarchische Codes für EU-Regionen (z.B. DE1 = Baden-Württemberg). Spezifischer als Ländercodes.",
    "automations.tooltipNS": "NS: Nicht angegeben",
    "automations.tooltipNSDesc": "Stellenangebote, bei denen der Arbeitgeber keine Region innerhalb des Landes angegeben hat.",

    // EuresOccupationCombobox - InfoTooltip
    "automations.tooltipEsco": "ESCO-Berufe",
    "automations.tooltipEscoDesc": "Durchsuchen Sie die Europäische Taxonomie für Fähigkeiten, Kompetenzen, Qualifikationen und Berufe. Ausgewählte Berufe werden mit EURES-Stellenangeboten abgeglichen.",
    "automations.tooltipCustom": "Eigene Suchbegriffe",
    "automations.tooltipCustomDesc": "Geben Sie ein beliebiges Stichwort ein und drücken Sie Enter, um es als Freitextsuchbegriff hinzuzufügen. Nützlich für nicht-standardisierte Berufsbezeichnungen.",
    "automations.tooltipIsco": "ISCO-Gruppen",
    "automations.tooltipIscoDesc": "Klicken Sie auf das Augensymbol auf einem Chip, um die ISCO-Klassifikationsgruppe zu sehen, die verwandte Berufe für breitere Suchen enthält.",

    // U2: JSearch API Key Check
    "automations.jsearchApiKeyRequired": "API-Schlüssel erforderlich — in Einstellungen konfigurieren",
    "automations.configureApiKey": "Zu Einstellungen → API-Schlüssel",
    "automations.noApiKeyNeeded": "Kein API-Schlüssel erforderlich",

    // U3: Threshold Toggle
    "automations.enableAiScoring": "KI-Bewertung aktivieren",
    "automations.enableAiScoringDesc": "KI verwenden, um gefundene Stellen mit Ihrem Lebenslauf abzugleichen und zu filtern",
    "automations.collectOnlyMode": "Nur sammeln (keine KI-Bewertung)",
    "automations.collectOnlyDesc": "Alle gefundenen Stellen werden ohne KI-Bewertung gesammelt. Sie können sie manuell prüfen.",
    "automations.disabled": "Deaktiviert",

    // U4: Flexible Runtimes
    "automations.scheduleFrequency": "Ausführungshäufigkeit",
    "automations.selectFrequency": "Häufigkeit auswählen",
    "automations.scheduleFrequencyDesc": "Wie oft die Automatisierung nach neuen Stellen suchen soll",
    "automations.scheduleEvery6Hours": "Alle 6 Stunden",
    "automations.scheduleEvery12Hours": "Alle 12 Stunden",
    "automations.scheduleDaily": "Täglich",
    "automations.scheduleEvery2Days": "Alle 2 Tage",
    "automations.scheduleWeekly": "Wöchentlich",
    "automations.preferredStartTime": "Bevorzugte Startzeit",

    // Resume Combobox
    "automations.searchResume": "Resumes suchen...",
    "automations.noResumeFound": "Kein Resume gefunden",

    // Create & Run Now
    "automations.createAndRun": "Erstellen & Jetzt starten",

    // Performance warning
    "automations.performanceWarning": "Du hast viele Automationen. Dies kann die Systemleistung beeintr\u00e4chtigen. Stelle sicher, dass gen\u00fcgend Systemressourcen zur Verf\u00fcgung stehen.",
    "automations.performanceWarningBanner": "Du hast {count} Automationen. Viele Automationen k\u00f6nnen die Systemleistung beeintr\u00e4chtigen. Stelle sicher, dass gen\u00fcgend Systemressourcen zur Verf\u00fcgung stehen.",

    // Connector Params — Section header
    "automations.connectorParams": "Erweiterte Suchoptionen",

    // Connector Params — Arbeitsagentur
    "automations.params.umkreis": "Umkreis (km)",
    "automations.params.veroeffentlichtseit": "Veröffentlicht innerhalb (Tage)",
    "automations.params.arbeitszeit": "Arbeitszeit",
    "automations.params.befristung": "Befristung",
    "automations.paramOption.arbeitsagentur.arbeitszeit.vz": "Vollzeit",
    "automations.paramOption.arbeitsagentur.arbeitszeit.tz": "Teilzeit",
    "automations.paramOption.arbeitsagentur.arbeitszeit.snw": "Schicht/Nacht/Wochenende",
    "automations.paramOption.arbeitsagentur.arbeitszeit.mj": "Minijob",
    "automations.paramOption.arbeitsagentur.arbeitszeit.ho": "Homeoffice",
    "automations.paramOption.arbeitsagentur.befristung.1": "Unbefristet",
    "automations.paramOption.arbeitsagentur.befristung.2": "Befristet",

    // Connector Params — EURES: publicationPeriod
    "automations.params.publicationPeriod": "Veröffentlicht innerhalb",
    "automations.paramOption.eures.publicationPeriod.LAST_DAY": "Letzter Tag",
    "automations.paramOption.eures.publicationPeriod.LAST_THREE_DAYS": "Letzte 3 Tage",
    "automations.paramOption.eures.publicationPeriod.LAST_WEEK": "Letzte Woche",
    "automations.paramOption.eures.publicationPeriod.LAST_MONTH": "Letzter Monat",

    // Connector Params — EURES: experience level
    "automations.params.experienceLevel": "Erfahrungsstufe",
    "automations.paramOption.eures.requiredExperienceCodes.none_required": "Keine Erfahrung erforderlich",
    "automations.paramOption.eures.requiredExperienceCodes.up_to_1_year": "Bis zu 1 Jahr",
    "automations.paramOption.eures.requiredExperienceCodes.between_1_and_2_years": "1-2 Jahre",
    "automations.paramOption.eures.requiredExperienceCodes.between_2_and_5_years": "2-5 Jahre",
    "automations.paramOption.eures.requiredExperienceCodes.more_than_5_years": "Mehr als 5 Jahre",

    // Connector Params — EURES: position offering
    "automations.params.positionOffering": "Stellenart",
    "automations.paramOption.eures.positionOfferingCodes.directhire": "Direktanstellung",
    "automations.paramOption.eures.positionOfferingCodes.contract": "Vertrag",
    "automations.paramOption.eures.positionOfferingCodes.temporary": "Befristet",
    "automations.paramOption.eures.positionOfferingCodes.internship": "Praktikum",
    "automations.paramOption.eures.positionOfferingCodes.apprenticeship": "Ausbildung",
    "automations.paramOption.eures.positionOfferingCodes.selfemployed": "Selbstständig",
    "automations.paramOption.eures.positionOfferingCodes.seasonal": "Saisonarbeit",
    "automations.paramOption.eures.positionOfferingCodes.volunteer": "Ehrenamt",

    // Connector Params — EURES: working time
    "automations.params.workingTime": "Arbeitszeit",
    "automations.paramOption.eures.positionScheduleCodes.fulltime": "Vollzeit",
    "automations.paramOption.eures.positionScheduleCodes.parttime": "Teilzeit",
    "automations.paramOption.eures.positionScheduleCodes.flextime": "Gleitzeit",

    // Connector Params — EURES: education level
    "automations.params.educationLevel": "Bildungsniveau",
    "automations.paramOption.eures.educationLevelCodes.basic": "Grundbildung",
    "automations.paramOption.eures.educationLevelCodes.medium": "Sekundärbildung",
    "automations.paramOption.eures.educationLevelCodes.bachelor": "Bachelor-Abschluss",
    "automations.paramOption.eures.educationLevelCodes.master": "Master-Abschluss",
    "automations.paramOption.eures.educationLevelCodes.tertiary": "Tertiärbildung",
    "automations.paramOption.eures.educationLevelCodes.doctoral": "Doktorgrad",

    // Connector Params — EURES: sector
    "automations.params.sector": "Branche",

    // Connector Params — EURES: EURES flag
    "automations.params.euresFlag": "EURES-Kennzeichnung",
    "automations.paramOption.eures.euresFlagCodes.WITH": "Nur EURES-Stellen",
    "automations.paramOption.eures.euresFlagCodes.WITHOUT": "Nur Nicht-EURES-Stellen",

    // Connector Params — EURES: required languages
    "automations.params.requiredLanguages": "Erforderliche Sprachen",

    // Connector Params — EURES: keyword search scope
    "automations.params.keywordSearchScope": "Suchbereich für Schlüsselwörter",
    "automations.paramOption.eures.specificSearchCode.EVERYWHERE": "Überall",
    "automations.paramOption.eures.specificSearchCode.TITLE": "Nur Stellentitel",
    "automations.paramOption.eures.specificSearchCode.DESCRIPTION": "Nur Beschreibung",
    "automations.paramOption.eures.specificSearchCode.EMPLOYER": "Nur Arbeitgeber",

    // Connector Params — EURES: sort order
    "automations.params.sortOrder": "Sortierung",
    "automations.paramOption.eures.sortSearch.BEST_MATCH": "Beste Übereinstimmung",
    "automations.paramOption.eures.sortSearch.MOST_RECENT": "Neueste zuerst",

    // Scheduler Coordination (ROADMAP 0.10)
    "automations.queued": "In Warteschlange",
    "automations.alreadyRunning": "Diese Automation läuft bereits",
    "automations.moduleBusy": "Modul wird von einer anderen Automation verwendet",
    "automations.schedulerIdle": "Bereit",
    "automations.schedulerRunning": "Scheduler aktiv",
    "automations.runSourceScheduler": "Geplant",
    "automations.runSourceManual": "Manuell",
    "automations.sourceHeader": "Quelle",

    // SchedulerStatusBar (B1)
    "automations.schedulerPhaseRunning": "Aktiv",
    "automations.schedulerPhaseCooldown": "Wird abgeschlossen...",
    "automations.schedulerStatus": "Scheduler-Status",
    "automations.schedulerPhase": "Phase",
    "automations.schedulerActive": "Aktiv",
    "automations.schedulerModule": "Modul",
    "automations.schedulerQueueRemaining": "ausstehend",
    "automations.schedulerLastCompleted": "Zuletzt abgeschlossen",
    "automations.schedulerNoAutomations": "Keine Automationen konfiguriert",

    // ConflictWarningDialog (B2)
    "automations.conflictBlocked": "Automation laeuft bereits",
    "automations.conflictBlockedDesc": "Diese Automation laeuft bereits. Bitte warten Sie, bis sie abgeschlossen ist.",
    "automations.conflictContention": "Modul wird verwendet",
    "automations.conflictContentionDesc": "Das Modul wird derzeit von einer anderen Automation verwendet. Ergebnisse koennten gedrosselt werden.",
    "automations.conflictProceed": "Trotzdem fortfahren",
    "automations.conflictCancel": "Abbrechen",
    "automations.conflictStartedAt": "Gestartet",
    "automations.conflictSource": "Quelle",

    // RunProgressPanel (B3)
    "automations.runProgress": "Fortschritt",
    "automations.phaseSearch": "Suche",
    "automations.phaseDedup": "Duplikate",
    "automations.phaseEnrich": "Anreichern",
    "automations.phaseMatch": "Abgleich",
    "automations.phaseSave": "Speichern",
    "automations.phaseFinalize": "Abschliessen",

    // Staging Queue live updates (B10)
    "automations.newItemsAvailable": "Neue Eintraege verfuegbar",
    "automations.showNewItems": "Neue Eintraege anzeigen",

    // Detail page labels (A9 i18n) + B6 tooltip
    "automations.never": "Nie",
    "automations.tabLogs": "Protokoll",
    "automations.total": "gesamt",
    "automations.runNowPaused": "Automation ist pausiert",
    "automations.runNowResumeMissing": "Kein Lebenslauf zugewiesen",
    "automations.notFound": "Automatisierung nicht gefunden",
    "automations.statusRunning": "Läuft",
    "automations.statusCompleted": "Abgeschlossen",
    "automations.statusFailed": "Fehlgeschlagen",
    "automations.statusCompletedWithErrors": "Mit Fehlern abgeschlossen",
    "automations.statusBlocked": "Blockiert",
    "automations.statusRateLimited": "Ratenbegrenzt",

    // AutomationList - Status & Module display
    "automations.statusActive": "Aktiv",
    "automations.statusPaused": "Pausiert",
    "automations.moduleEures": "EURES",
    "automations.moduleArbeitsagentur": "Arbeitsagentur",
    "automations.moduleJsearch": "JSearch",

    // RunHistoryList - Blocked reasons
    "automations.blockedAlreadyRunning": "Wird bereits ausgeführt",
    "automations.blockedModuleBusy": "Modul beschäftigt",
    "automations.blockedModuleDeactivated": "Modul deaktiviert",
    "automations.blockedAuthFailure": "Authentifizierungsfehler",
    "automations.blockedConsecutiveFailures": "Aufeinanderfolgende Fehler",
    "automations.blockedCircuitBreaker": "Sicherungsschalter ausgelöst",
    "automations.blockedResumeMissing": "Lebenslauf fehlt",
    "automations.blockedUnknown": "Blockiert",
    // elapsed time
    "automations.elapsedHourMinSec": "{hour} Std. {min} Min. {sec} Sek.",
    "automations.elapsedMinSec": "{min} Min. {sec} Sek.",
    "automations.elapsedSec": "{sec} Sek.",
    "automations.queuedCount": "{count} Automatisierungen in Warteschlange",
    // run history
    "automations.runHistoryError": "Ausführungsverlauf konnte nicht geladen werden",
    "automations.runHistoryRetry": "Erneut versuchen",
    "automations.runEnded": "Ausführung abgeschlossen",
    // detail header a11y
    "automations.backToList": "Zurück zur Automatisierungsliste",
    "automations.refresh": "Aktualisieren",
  },
  fr: {
    // AutomationWizard - Steps
    "automations.stepBasics": "Bases",
    "automations.stepSearch": "Recherche",
    "automations.stepResume": "CV",
    "automations.stepMatching": "Correspondance",
    "automations.stepSchedule": "Planification",
    "automations.stepReview": "Vérification",
    "automations.stepBasicsDesc": "Nommez votre automatisation et choisissez un site d'emploi",
    "automations.stepSearchDesc": "Définissez vos critères de recherche",
    "automations.stepResumeDesc": "Sélectionnez un CV pour la correspondance IA",
    "automations.stepMatchingDesc": "Définissez votre seuil de correspondance minimum",
    "automations.stepScheduleDesc": "Choisissez quand l'automatisation doit s'exécuter",
    "automations.stepReviewDesc": "Vérifiez les paramètres de votre automatisation",

    // AutomationWizard - Form labels, placeholders, descriptions
    "automations.automationName": "Nom de l'automatisation",
    "automations.automationNamePlaceholder": "ex. Emplois Frontend Berlin",
    "automations.automationNameDesc": "Donnez un nom descriptif à votre automatisation",
    "automations.jobBoard": "Site d'emploi",
    "automations.selectJobBoard": "Sélectionner un site d'emploi",
    "automations.jobBoardDesc": "Choisissez le site d'emploi à rechercher",
    "automations.jsearch": "JSearch",
    "automations.eures": "EURES",
    "automations.arbeitsagentur": "Arbeitsagentur (DE)",
    "automations.searchKeywords": "Mots-clés de recherche",
    "automations.keywordsPlaceholder": "ex. Développeur React, Ingénieur Frontend",
    "automations.keywordsDesc": "Entrez des mots-clés pour rechercher des emplois pertinents",
    "automations.location": "Lieu",
    "automations.locationPlaceholder": "ex. Paris, France",
    "automations.locationDesc": "Précisez le lieu de travail ou laissez vide pour le télétravail",
    "automations.resumeForMatching": "CV pour la correspondance",
    "automations.selectResume": "Sélectionner un CV",
    "automations.resumeMatchDesc": "Choisissez un CV à comparer avec les offres d'emploi",
    "automations.noResumes": "Aucun CV disponible",
    "automations.matchThreshold": "Seuil de correspondance",
    "automations.matchThresholdDesc": "Pourcentage minimum de correspondance pour sauvegarder une offre",
    "automations.dailyRunTime": "Heure d'exécution quotidienne",
    "automations.selectTime": "Sélectionner une heure",
    "automations.scheduleDesc": "L'automatisation s'exécutera quotidiennement à l'heure sélectionnée",

    // AutomationWizard - Review section
    "automations.reviewName": "Nom",
    "automations.reviewJobBoard": "Site d'emploi",
    "automations.reviewKeywords": "Mots-clés",
    "automations.reviewLocation": "Lieu",
    "automations.reviewResume": "CV",
    "automations.reviewMatchThreshold": "Seuil de correspondance",
    "automations.reviewSchedule": "Planification",
    "automations.notSelected": "Non sélectionné",
    "automations.dailyAt": "Quotidiennement à",

    // AutomationWizard - Buttons and navigation
    "automations.editAutomation": "Modifier l'automatisation",
    "automations.createAutomation": "Créer une automatisation",
    "automations.updateAutomation": "Mettre à jour l'automatisation",
    "automations.step": "Étape",
    "automations.of": "sur",
    "automations.back": "Retour",
    "automations.next": "Suivant",

    // AutomationWizard - Toasts
    "automations.automationUpdated": "Automatisation mise à jour",
    "automations.automationCreated": "Automatisation créée",
    "automations.automationUpdatedDesc": "Votre automatisation a été mise à jour avec succès",
    "automations.automationCreatedDesc": "Votre automatisation a été créée avec succès",
    "automations.validationError": "Erreur de validation",
    "automations.somethingWentWrong": "Une erreur est survenue",
    "automations.failedToSave": "Impossible de sauvegarder l'automatisation",

    // AutomationContainer
    "automations.jobDiscovery": "Découverte d'emplois",
    "automations.needResume": "Vous devez télécharger un CV avant de créer des automatisations",
    "automations.goToProfile": "Aller au profil",

    // AutomationList - List items
    "automations.noAutomations": "Aucune automatisation",
    "automations.noAutomationsDesc": "Créez votre première automatisation pour commencer à découvrir des emplois automatiquement",
    "automations.resumeMissing": "CV manquant",
    "automations.keywords": "Mots-clés",
    "automations.locationLabel": "Lieu",
    "automations.resumeLabel": "CV",
    "automations.daily": "Quotidien",
    "automations.threshold": "Seuil",
    "automations.nextRun": "Prochain",
    "automations.lastRun": "Dernier",

    // AutomationList - Menu actions
    "automations.pause": "Mettre en pause",
    "automations.resume": "Reprendre",
    "automations.edit": "Modifier",
    "automations.delete": "Supprimer",

    // AutomationList - Delete dialog
    "automations.deleteTitle": "Supprimer l'automatisation",
    "automations.deleteDesc": "Êtes-vous sûr de vouloir supprimer cette automatisation ? Cette action est irréversible.",

    // AutomationList - Toasts
    "automations.deleting": "Suppression en cours...",
    "automations.automationPaused": "Automatisation mise en pause",
    "automations.automationResumed": "Automatisation reprise",
    "automations.automationDeleted": "Automatisation supprimée",

    // AutomationDetailPage - Toasts & buttons
    "automations.runNow": "Lancer maintenant",
    "automations.runStarted": "Exécution de l'automatisation démarrée",
    "automations.savedNewJobs": "{count} nouvelles offres enregistrées",
    "automations.runFailed": "Échec de l'exécution de l'automatisation",
    "automations.loadFailed": "Impossible de charger les détails de l'automatisation",
    "automations.deleteBlocked": "Suppression impossible : automatisation en cours",

    // AutomationList - Pause reasons
    "automations.pauseReasonModuleDeactivated": "Le module a ete desactive",
    "automations.pauseReasonAuthFailure": "Echec de l'authentification — verifiez les identifiants",
    "automations.pauseReasonConsecutiveFailures": "Mise en pause apres des echecs repetes",
    "automations.pauseReasonCbEscalation": "Service temporairement indisponible",

    // DiscoveredJobsList
    "automations.noDiscoveredJobs": "Aucun emploi découvert",
    "automations.noDiscoveredJobsDesc": "Les emplois apparaîtront ici une fois que vos automatisations auront trouvé des correspondances",
    "automations.discoveredJobs": "Emplois découverts",
    "automations.discoveredJobsDesc": "Emplois trouvés par vos automatisations",
    "automations.job": "Emploi",
    "automations.company": "Entreprise",
    "automations.locationHeader": "Lieu",
    "automations.match": "Correspondance",
    "automations.status": "Statut",
    "automations.discovered": "Découvert",
    "automations.actions": "Actions",
    "automations.jobAccepted": "Emploi accepté",
    "automations.jobAcceptedDesc": "L'emploi a été ajouté à votre liste",
    "automations.jobDismissed": "Emploi rejeté",

    // LogsTab
    "automations.automationLogs": "Journaux d'automatisation",
    "automations.running": "En cours",
    "automations.all": "Tous",
    "automations.info": "Info",
    "automations.success": "Succès",
    "automations.warning": "Avertissement",
    "automations.errorLog": "Erreur",
    "automations.started": "Démarré",
    "automations.completed": "Terminé",
    "automations.noLogs": "Aucun journal disponible",
    "automations.noLogsFilter": "Aucun journal ne correspond au filtre sélectionné",

    // MatchDetails
    "automations.matchSummary": "Résumé de correspondance",
    "automations.skillsAnalysis": "Analyse des compétences",
    "automations.matchedSkills": "Compétences correspondantes",
    "automations.missingSkills": "Compétences manquantes",
    "automations.transferableSkills": "Compétences transférables",
    "automations.requirementsAnalysis": "Analyse des exigences",
    "automations.metRequirements": "Exigences satisfaites",
    "automations.missingRequirements": "Exigences manquantes",
    "automations.tailoringTips": "Conseils de personnalisation",
    "automations.dealBreakers": "Critères rédhibitoires",
    "automations.matchedWithResume": "Comparé avec le CV",
    "automations.matchedOn": "Comparé le",
    "automations.discoveredOn": "Découvert le",

    // RunHistoryList
    "automations.noRuns": "Aucune exécution",
    "automations.noRunsDesc": "L'historique apparaîtra ici après la première exécution de votre automatisation",
    "automations.runHistory": "Historique des exécutions",
    "automations.runHistoryDesc": "Historique des exécutions et leurs résultats",
    "automations.statusHeader": "Statut",
    "automations.startedHeader": "Démarré",
    "automations.duration": "Durée",
    "automations.searched": "Recherchés",
    "automations.new": "Nouveaux",
    "automations.processed": "Traités",
    "automations.matched": "Correspondants",
    "automations.saved": "Sauvegardés",
    "automations.errorHeader": "Erreur",

    // EuresLocationCombobox
    "automations.maxLocations": "Maximum {max} emplacements atteint",
    "automations.locationsSelected": "{count} emplacement(s) sélectionné(s)",
    "automations.selectCountries": "Sélectionner pays ou régions...",
    "automations.searchCountries": "Rechercher pays ou régions NUTS...",
    "automations.noLocations": "Aucun emplacement trouvé.",
    "automations.allOf": "Tout {country}",
    "automations.jobs": "emplois",

    // EuresOccupationCombobox
    "automations.maxKeywords": "Maximum {max} mots-clés atteint",
    "automations.keywordsSelected": "{count} mot(s)-clé(s) sélectionné(s)",
    "automations.searchOccupations": "Rechercher professions ESCO ou saisir mots-clés...",
    "automations.searchOccupationsPlaceholder": "Rechercher professions ou saisir mot-clé personnalisé...",
    "automations.customKeyword": "Mot-clé personnalisé",
    "automations.escoOccupations": "Professions ESCO",
    "automations.addKeyword": "Ajouter \"{keyword}\"",
    "automations.enterKey": "Entrée ↵",
    "automations.typeToSearch": "Tapez pour rechercher des professions ESCO...",
    "automations.couldNotLoad": "Impossible de charger les détails de la profession.",
    "automations.iscoGroup": "Groupe ISCO :",
    "automations.escoPortal": "Portail ESCO",
    "automations.euresJobs": "Emplois EURES",
    "automations.loadingOccupation": "Chargement...",

    // EuresLocationCombobox - InfoTooltip
    "automations.tooltipCountryCodes": "Codes pays",
    "automations.tooltipCountryCodesDesc": "Codes ISO 3166-1 alpha-2 (ex. DE pour l'Allemagne, AT pour l'Autriche). Sélectionne toutes les offres d'emploi dans ce pays.",
    "automations.tooltipNutsRegions": "Codes régions NUTS",
    "automations.tooltipNutsDesc": "Nomenclature des unités territoriales statistiques. Codes hiérarchiques pour les régions de l'UE (ex. DE1 = Bade-Wurtemberg). Plus spécifiques que les codes pays.",
    "automations.tooltipNS": "NS : Non spécifié",
    "automations.tooltipNSDesc": "Offres d'emploi où l'employeur n'a pas précisé de région dans le pays.",

    // EuresOccupationCombobox - InfoTooltip
    "automations.tooltipEsco": "Professions ESCO",
    "automations.tooltipEscoDesc": "Recherchez dans la taxonomie européenne des aptitudes, compétences, qualifications et professions. Les professions sélectionnées sont comparées aux offres d'emploi EURES.",
    "automations.tooltipCustom": "Mots-clés personnalisés",
    "automations.tooltipCustomDesc": "Saisissez un mot-clé et appuyez sur Entrée pour l'ajouter comme terme de recherche libre. Utile pour les intitulés de poste non standards.",
    "automations.tooltipIsco": "Groupes ISCO",
    "automations.tooltipIscoDesc": "Cliquez sur l'icône œil sur un badge pour voir le groupe de classification ISCO, qui inclut des professions connexes pour des recherches plus larges.",

    // U2: JSearch API Key Check
    "automations.jsearchApiKeyRequired": "Clé API requise — configurer dans les Paramètres",
    "automations.configureApiKey": "Aller dans Paramètres → Clés API",
    "automations.noApiKeyNeeded": "Aucune clé API requise",

    // U3: Threshold Toggle
    "automations.enableAiScoring": "Activer la notation IA",
    "automations.enableAiScoringDesc": "Utiliser l'IA pour noter et filtrer les emplois découverts par rapport à votre CV",
    "automations.collectOnlyMode": "Collecte uniquement (sans notation IA)",
    "automations.collectOnlyDesc": "Tous les emplois découverts seront collectés sans notation IA. Vous pourrez les examiner manuellement.",
    "automations.disabled": "Désactivé",

    // U4: Flexible Runtimes
    "automations.scheduleFrequency": "Fréquence d'exécution",
    "automations.selectFrequency": "Sélectionner la fréquence",
    "automations.scheduleFrequencyDesc": "À quelle fréquence l'automatisation doit rechercher de nouveaux emplois",
    "automations.scheduleEvery6Hours": "Toutes les 6 heures",
    "automations.scheduleEvery12Hours": "Toutes les 12 heures",
    "automations.scheduleDaily": "Quotidien",
    "automations.scheduleEvery2Days": "Tous les 2 jours",
    "automations.scheduleWeekly": "Hebdomadaire",
    "automations.preferredStartTime": "Heure de début préférée",

    // Resume Combobox
    "automations.searchResume": "Rechercher des CV...",
    "automations.noResumeFound": "Aucun CV trouvé",

    // Create & Run Now
    "automations.createAndRun": "Cr\u00e9er & Ex\u00e9cuter",

    // Performance warning
    "automations.performanceWarning": "Vous avez beaucoup d'automatisations. Cela peut affecter les performances du syst\u00e8me. Assurez-vous de disposer de ressources suffisantes.",
    "automations.performanceWarningBanner": "Vous avez {count} automatisations. De nombreuses automatisations peuvent affecter les performances du syst\u00e8me. Assurez-vous de disposer de ressources suffisantes.",

    // Connector Params — Section header
    "automations.connectorParams": "Options de recherche avancées",

    // Connector Params — Arbeitsagentur
    "automations.params.umkreis": "Rayon (km)",
    "automations.params.veroeffentlichtseit": "Publié dans les (jours)",
    "automations.params.arbeitszeit": "Temps de travail",
    "automations.params.befristung": "Type de contrat",
    "automations.paramOption.arbeitsagentur.arbeitszeit.vz": "Temps plein",
    "automations.paramOption.arbeitsagentur.arbeitszeit.tz": "Temps partiel",
    "automations.paramOption.arbeitsagentur.arbeitszeit.snw": "Travail posté/nuit/week-end",
    "automations.paramOption.arbeitsagentur.arbeitszeit.mj": "Mini-job",
    "automations.paramOption.arbeitsagentur.arbeitszeit.ho": "Télétravail",
    "automations.paramOption.arbeitsagentur.befristung.1": "Permanent",
    "automations.paramOption.arbeitsagentur.befristung.2": "Temporaire",

    // Connector Params — EURES: publicationPeriod
    "automations.params.publicationPeriod": "Publié dans les",
    "automations.paramOption.eures.publicationPeriod.LAST_DAY": "Dernier jour",
    "automations.paramOption.eures.publicationPeriod.LAST_THREE_DAYS": "3 derniers jours",
    "automations.paramOption.eures.publicationPeriod.LAST_WEEK": "Dernière semaine",
    "automations.paramOption.eures.publicationPeriod.LAST_MONTH": "Dernier mois",

    // Connector Params — EURES: experience level
    "automations.params.experienceLevel": "Niveau d'expérience",
    "automations.paramOption.eures.requiredExperienceCodes.none_required": "Aucune expérience requise",
    "automations.paramOption.eures.requiredExperienceCodes.up_to_1_year": "Jusqu'à 1 an",
    "automations.paramOption.eures.requiredExperienceCodes.between_1_and_2_years": "1-2 ans",
    "automations.paramOption.eures.requiredExperienceCodes.between_2_and_5_years": "2-5 ans",
    "automations.paramOption.eures.requiredExperienceCodes.more_than_5_years": "Plus de 5 ans",

    // Connector Params — EURES: position offering
    "automations.params.positionOffering": "Type de poste",
    "automations.paramOption.eures.positionOfferingCodes.directhire": "Embauche directe",
    "automations.paramOption.eures.positionOfferingCodes.contract": "Contrat",
    "automations.paramOption.eures.positionOfferingCodes.temporary": "Temporaire",
    "automations.paramOption.eures.positionOfferingCodes.internship": "Stage",
    "automations.paramOption.eures.positionOfferingCodes.apprenticeship": "Apprentissage",
    "automations.paramOption.eures.positionOfferingCodes.selfemployed": "Indépendant",
    "automations.paramOption.eures.positionOfferingCodes.seasonal": "Saisonnier",
    "automations.paramOption.eures.positionOfferingCodes.volunteer": "Bénévolat",

    // Connector Params — EURES: working time
    "automations.params.workingTime": "Temps de travail",
    "automations.paramOption.eures.positionScheduleCodes.fulltime": "Temps plein",
    "automations.paramOption.eures.positionScheduleCodes.parttime": "Temps partiel",
    "automations.paramOption.eures.positionScheduleCodes.flextime": "Horaires flexibles",

    // Connector Params — EURES: education level
    "automations.params.educationLevel": "Niveau d'éducation",
    "automations.paramOption.eures.educationLevelCodes.basic": "Éducation de base",
    "automations.paramOption.eures.educationLevelCodes.medium": "Éducation secondaire",
    "automations.paramOption.eures.educationLevelCodes.bachelor": "Licence",
    "automations.paramOption.eures.educationLevelCodes.master": "Master",
    "automations.paramOption.eures.educationLevelCodes.tertiary": "Éducation supérieure",
    "automations.paramOption.eures.educationLevelCodes.doctoral": "Doctorat",

    // Connector Params — EURES: sector
    "automations.params.sector": "Secteur d'activité",

    // Connector Params — EURES: EURES flag
    "automations.params.euresFlag": "Indicateur EURES",
    "automations.paramOption.eures.euresFlagCodes.WITH": "Offres EURES uniquement",
    "automations.paramOption.eures.euresFlagCodes.WITHOUT": "Offres non-EURES uniquement",

    // Connector Params — EURES: required languages
    "automations.params.requiredLanguages": "Langues requises",

    // Connector Params — EURES: keyword search scope
    "automations.params.keywordSearchScope": "Portée de recherche",
    "automations.paramOption.eures.specificSearchCode.EVERYWHERE": "Partout",
    "automations.paramOption.eures.specificSearchCode.TITLE": "Titre uniquement",
    "automations.paramOption.eures.specificSearchCode.DESCRIPTION": "Description uniquement",
    "automations.paramOption.eures.specificSearchCode.EMPLOYER": "Employeur uniquement",

    // Connector Params — EURES: sort order
    "automations.params.sortOrder": "Ordre de tri",
    "automations.paramOption.eures.sortSearch.BEST_MATCH": "Meilleure correspondance",
    "automations.paramOption.eures.sortSearch.MOST_RECENT": "Plus récent",

    // Scheduler Coordination (ROADMAP 0.10)
    "automations.queued": "En attente",
    "automations.alreadyRunning": "Cette automatisation est déjà en cours",
    "automations.moduleBusy": "Le module est utilisé par une autre automatisation",
    "automations.schedulerIdle": "Inactif",
    "automations.schedulerRunning": "Planificateur actif",
    "automations.runSourceScheduler": "Planifié",
    "automations.runSourceManual": "Manuel",
    "automations.sourceHeader": "Source",

    // SchedulerStatusBar (B1)
    "automations.schedulerPhaseRunning": "En cours",
    "automations.schedulerPhaseCooldown": "Finalisation...",
    "automations.schedulerStatus": "Statut du planificateur",
    "automations.schedulerPhase": "Phase",
    "automations.schedulerActive": "Actif",
    "automations.schedulerModule": "Module",
    "automations.schedulerQueueRemaining": "restant(s)",
    "automations.schedulerLastCompleted": "Dernier acheve",
    "automations.schedulerNoAutomations": "Aucune automatisation configuree",

    // ConflictWarningDialog (B2)
    "automations.conflictBlocked": "Automatisation deja en cours",
    "automations.conflictBlockedDesc": "Cette automatisation est deja en cours d'execution. Veuillez attendre qu'elle soit terminee.",
    "automations.conflictContention": "Module en cours d'utilisation",
    "automations.conflictContentionDesc": "Le module est actuellement utilise par une autre automatisation. Les resultats pourraient etre limites.",
    "automations.conflictProceed": "Continuer quand meme",
    "automations.conflictCancel": "Annuler",
    "automations.conflictStartedAt": "Demarre",
    "automations.conflictSource": "Source",

    // RunProgressPanel (B3)
    "automations.runProgress": "Progression",
    "automations.phaseSearch": "Recherche",
    "automations.phaseDedup": "Doublons",
    "automations.phaseEnrich": "Enrichir",
    "automations.phaseMatch": "Correspondance",
    "automations.phaseSave": "Sauvegarder",
    "automations.phaseFinalize": "Finaliser",

    // Staging Queue live updates (B10)
    "automations.newItemsAvailable": "Nouveaux elements disponibles",
    "automations.showNewItems": "Afficher les nouveaux",

    // Detail page labels (A9 i18n) + B6 tooltip
    "automations.never": "Jamais",
    "automations.tabLogs": "Journaux",
    "automations.total": "au total",
    "automations.runNowPaused": "Impossible de lancer une automatisation en pause",
    "automations.runNowResumeMissing": "Impossible de lancer sans CV",
    "automations.notFound": "Automatisation non trouvée",
    "automations.statusRunning": "En cours",
    "automations.statusCompleted": "Terminé",
    "automations.statusFailed": "Échoué",
    "automations.statusCompletedWithErrors": "Terminé avec des erreurs",
    "automations.statusBlocked": "Bloqué",
    "automations.statusRateLimited": "Débit limité",

    // AutomationList - Status & Module display
    "automations.statusActive": "Actif",
    "automations.statusPaused": "En pause",
    "automations.moduleEures": "EURES",
    "automations.moduleArbeitsagentur": "Arbeitsagentur",
    "automations.moduleJsearch": "JSearch",

    // RunHistoryList - Blocked reasons
    "automations.blockedAlreadyRunning": "Déjà en cours",
    "automations.blockedModuleBusy": "Module occupé",
    "automations.blockedModuleDeactivated": "Module désactivé",
    "automations.blockedAuthFailure": "Échec d'authentification",
    "automations.blockedConsecutiveFailures": "Échecs consécutifs",
    "automations.blockedCircuitBreaker": "Disjoncteur déclenché",
    "automations.blockedResumeMissing": "CV manquant",
    "automations.blockedUnknown": "Bloqué",
    // elapsed time
    "automations.elapsedHourMinSec": "{hour} h {min} min {sec} s",
    "automations.elapsedMinSec": "{min} min {sec} s",
    "automations.elapsedSec": "{sec} s",
    "automations.queuedCount": "{count} automatisations en attente",
    // run history
    "automations.runHistoryError": "Impossible de charger l'historique des exécutions",
    "automations.runHistoryRetry": "Réessayer",
    "automations.runEnded": "Exécution terminée",
    // detail header a11y
    "automations.backToList": "Retour à la liste des automatisations",
    "automations.refresh": "Actualiser",
  },
  es: {
    // AutomationWizard - Steps
    "automations.stepBasics": "Básicos",
    "automations.stepSearch": "Búsqueda",
    "automations.stepResume": "Currículum",
    "automations.stepMatching": "Coincidencia",
    "automations.stepSchedule": "Programación",
    "automations.stepReview": "Revisión",
    "automations.stepBasicsDesc": "Nombre su automatización y elija un portal de empleo",
    "automations.stepSearchDesc": "Defina sus criterios de búsqueda",
    "automations.stepResumeDesc": "Seleccione un currículum para la coincidencia con IA",
    "automations.stepMatchingDesc": "Establezca su umbral mínimo de coincidencia",
    "automations.stepScheduleDesc": "Elija cuándo debe ejecutarse la automatización",
    "automations.stepReviewDesc": "Revise la configuración de su automatización",

    // AutomationWizard - Form labels, placeholders, descriptions
    "automations.automationName": "Nombre de la automatización",
    "automations.automationNamePlaceholder": "ej. Empleos Frontend Berlín",
    "automations.automationNameDesc": "Dé un nombre descriptivo a su automatización",
    "automations.jobBoard": "Portal de empleo",
    "automations.selectJobBoard": "Seleccionar un portal de empleo",
    "automations.jobBoardDesc": "Elija qué portal de empleo buscar",
    "automations.jsearch": "JSearch",
    "automations.eures": "EURES",
    "automations.arbeitsagentur": "Arbeitsagentur (DE)",
    "automations.searchKeywords": "Palabras clave de búsqueda",
    "automations.keywordsPlaceholder": "ej. Desarrollador React, Ingeniero Frontend",
    "automations.keywordsDesc": "Ingrese palabras clave para buscar empleos relevantes",
    "automations.location": "Ubicación",
    "automations.locationPlaceholder": "ej. Madrid, España",
    "automations.locationDesc": "Especifique la ubicación del empleo o déjelo vacío para remoto",
    "automations.resumeForMatching": "Currículum para coincidencia",
    "automations.selectResume": "Seleccionar un currículum",
    "automations.resumeMatchDesc": "Elija un currículum para comparar con las ofertas de empleo",
    "automations.noResumes": "No hay currículums disponibles",
    "automations.matchThreshold": "Umbral de coincidencia",
    "automations.matchThresholdDesc": "Porcentaje mínimo de coincidencia para guardar un empleo",
    "automations.dailyRunTime": "Hora de ejecución diaria",
    "automations.selectTime": "Seleccionar una hora",
    "automations.scheduleDesc": "La automatización se ejecutará diariamente a la hora seleccionada",

    // AutomationWizard - Review section
    "automations.reviewName": "Nombre",
    "automations.reviewJobBoard": "Portal de empleo",
    "automations.reviewKeywords": "Palabras clave",
    "automations.reviewLocation": "Ubicación",
    "automations.reviewResume": "Currículum",
    "automations.reviewMatchThreshold": "Umbral de coincidencia",
    "automations.reviewSchedule": "Programación",
    "automations.notSelected": "No seleccionado",
    "automations.dailyAt": "Diariamente a las",

    // AutomationWizard - Buttons and navigation
    "automations.editAutomation": "Editar automatización",
    "automations.createAutomation": "Crear automatización",
    "automations.updateAutomation": "Actualizar automatización",
    "automations.step": "Paso",
    "automations.of": "de",
    "automations.back": "Atrás",
    "automations.next": "Siguiente",

    // AutomationWizard - Toasts
    "automations.automationUpdated": "Automatización actualizada",
    "automations.automationCreated": "Automatización creada",
    "automations.automationUpdatedDesc": "Su automatización se ha actualizado con éxito",
    "automations.automationCreatedDesc": "Su automatización se ha creado con éxito",
    "automations.validationError": "Error de validación",
    "automations.somethingWentWrong": "Algo salió mal",
    "automations.failedToSave": "No se pudo guardar la automatización",

    // AutomationContainer
    "automations.jobDiscovery": "Descubrimiento de empleos",
    "automations.needResume": "Necesita subir un currículum antes de crear automatizaciones",
    "automations.goToProfile": "Ir al perfil",

    // AutomationList - List items
    "automations.noAutomations": "Sin automatizaciones",
    "automations.noAutomationsDesc": "Cree su primera automatización para comenzar a descubrir empleos automáticamente",
    "automations.resumeMissing": "Currículum faltante",
    "automations.keywords": "Palabras clave",
    "automations.locationLabel": "Ubicación",
    "automations.resumeLabel": "Currículum",
    "automations.daily": "Diario",
    "automations.threshold": "Umbral",
    "automations.nextRun": "Siguiente",
    "automations.lastRun": "Anterior",

    // AutomationList - Menu actions
    "automations.pause": "Pausar",
    "automations.resume": "Reanudar",
    "automations.edit": "Editar",
    "automations.delete": "Eliminar",

    // AutomationList - Delete dialog
    "automations.deleteTitle": "Eliminar automatización",
    "automations.deleteDesc": "¿Está seguro de que desea eliminar esta automatización? Esta acción no se puede deshacer.",

    // AutomationList - Toasts
    "automations.deleting": "Eliminando...",
    "automations.automationPaused": "Automatización pausada",
    "automations.automationResumed": "Automatización reanudada",
    "automations.automationDeleted": "Automatización eliminada",

    // AutomationDetailPage - Toasts & buttons
    "automations.runNow": "Ejecutar ahora",
    "automations.runStarted": "Ejecución de automatización iniciada",
    "automations.savedNewJobs": "{count} nuevas ofertas guardadas",
    "automations.runFailed": "Error al ejecutar la automatización",
    "automations.loadFailed": "Error al cargar los detalles de la automatización",
    "automations.deleteBlocked": "No se puede eliminar: la automatización se está ejecutando",

    // AutomationList - Pause reasons
    "automations.pauseReasonModuleDeactivated": "El modulo fue desactivado",
    "automations.pauseReasonAuthFailure": "Error de autenticacion — verifique las credenciales",
    "automations.pauseReasonConsecutiveFailures": "Pausada tras fallos repetidos",
    "automations.pauseReasonCbEscalation": "Servicio temporalmente no disponible",

    // DiscoveredJobsList
    "automations.noDiscoveredJobs": "No hay empleos descubiertos",
    "automations.noDiscoveredJobsDesc": "Los empleos aparecerán aquí cuando sus automatizaciones encuentren coincidencias",
    "automations.discoveredJobs": "Empleos descubiertos",
    "automations.discoveredJobsDesc": "Empleos encontrados por sus automatizaciones",
    "automations.job": "Empleo",
    "automations.company": "Empresa",
    "automations.locationHeader": "Ubicación",
    "automations.match": "Coincidencia",
    "automations.status": "Estado",
    "automations.discovered": "Descubierto",
    "automations.actions": "Acciones",
    "automations.jobAccepted": "Empleo aceptado",
    "automations.jobAcceptedDesc": "El empleo se ha añadido a su lista",
    "automations.jobDismissed": "Empleo descartado",

    // LogsTab
    "automations.automationLogs": "Registros de automatización",
    "automations.running": "En ejecución",
    "automations.all": "Todos",
    "automations.info": "Info",
    "automations.success": "Éxito",
    "automations.warning": "Advertencia",
    "automations.errorLog": "Error",
    "automations.started": "Iniciado",
    "automations.completed": "Completado",
    "automations.noLogs": "No hay registros disponibles",
    "automations.noLogsFilter": "Ningún registro coincide con el filtro seleccionado",

    // MatchDetails
    "automations.matchSummary": "Resumen de coincidencia",
    "automations.skillsAnalysis": "Análisis de habilidades",
    "automations.matchedSkills": "Habilidades coincidentes",
    "automations.missingSkills": "Habilidades faltantes",
    "automations.transferableSkills": "Habilidades transferibles",
    "automations.requirementsAnalysis": "Análisis de requisitos",
    "automations.metRequirements": "Requisitos cumplidos",
    "automations.missingRequirements": "Requisitos faltantes",
    "automations.tailoringTips": "Consejos de personalización",
    "automations.dealBreakers": "Criterios excluyentes",
    "automations.matchedWithResume": "Comparado con el currículum",
    "automations.matchedOn": "Comparado el",
    "automations.discoveredOn": "Descubierto el",

    // RunHistoryList
    "automations.noRuns": "Sin ejecuciones",
    "automations.noRunsDesc": "El historial aparecerá aquí después de la primera ejecución de su automatización",
    "automations.runHistory": "Historial de ejecuciones",
    "automations.runHistoryDesc": "Historial de ejecuciones de automatización y sus resultados",
    "automations.statusHeader": "Estado",
    "automations.startedHeader": "Iniciado",
    "automations.duration": "Duración",
    "automations.searched": "Buscados",
    "automations.new": "Nuevos",
    "automations.processed": "Procesados",
    "automations.matched": "Coincidentes",
    "automations.saved": "Guardados",
    "automations.errorHeader": "Error",

    // EuresLocationCombobox
    "automations.maxLocations": "Máximo {max} ubicaciones alcanzado",
    "automations.locationsSelected": "{count} ubicación(es) seleccionada(s)",
    "automations.selectCountries": "Seleccionar países o regiones...",
    "automations.searchCountries": "Buscar países o regiones NUTS...",
    "automations.noLocations": "No se encontraron ubicaciones.",
    "automations.allOf": "Todo {country}",
    "automations.jobs": "empleos",

    // EuresOccupationCombobox
    "automations.maxKeywords": "Máximo {max} palabras clave alcanzado",
    "automations.keywordsSelected": "{count} palabra(s) clave seleccionada(s)",
    "automations.searchOccupations": "Buscar ocupaciones ESCO o escribir palabras clave...",
    "automations.searchOccupationsPlaceholder": "Buscar ocupaciones o escribir palabra clave personalizada...",
    "automations.customKeyword": "Palabra clave personalizada",
    "automations.escoOccupations": "Ocupaciones ESCO",
    "automations.addKeyword": "Agregar \"{keyword}\"",
    "automations.enterKey": "Enter ↵",
    "automations.typeToSearch": "Escriba para buscar ocupaciones ESCO...",
    "automations.couldNotLoad": "No se pudieron cargar los detalles de la ocupación.",
    "automations.iscoGroup": "Grupo ISCO:",
    "automations.escoPortal": "Portal ESCO",
    "automations.euresJobs": "Empleos EURES",
    "automations.loadingOccupation": "Cargando...",

    // EuresLocationCombobox - InfoTooltip
    "automations.tooltipCountryCodes": "Códigos de país",
    "automations.tooltipCountryCodesDesc": "Códigos ISO 3166-1 alfa-2 (ej. DE para Alemania, AT para Austria). Selecciona todas las ofertas de empleo en ese país.",
    "automations.tooltipNutsRegions": "Códigos de región NUTS",
    "automations.tooltipNutsDesc": "Nomenclatura de las Unidades Territoriales Estadísticas. Códigos jerárquicos para regiones de la UE (ej. DE1 = Baden-Württemberg). Más específicos que los códigos de país.",
    "automations.tooltipNS": "NS: No especificado",
    "automations.tooltipNSDesc": "Ofertas de empleo en las que el empleador no especificó una región dentro del país.",

    // EuresOccupationCombobox - InfoTooltip
    "automations.tooltipEsco": "Ocupaciones ESCO",
    "automations.tooltipEscoDesc": "Busque en la taxonomía europea de aptitudes, competencias, cualificaciones y ocupaciones. Las ocupaciones seleccionadas se comparan con las ofertas de empleo de EURES.",
    "automations.tooltipCustom": "Palabras clave personalizadas",
    "automations.tooltipCustomDesc": "Escriba cualquier palabra clave y presione Enter para agregarla como término de búsqueda libre. Útil para títulos de trabajo no estándar.",
    "automations.tooltipIsco": "Grupos ISCO",
    "automations.tooltipIscoDesc": "Haga clic en el icono de ojo en una etiqueta para ver el grupo de clasificación ISCO, que incluye ocupaciones relacionadas para búsquedas más amplias.",

    // U2: JSearch API Key Check
    "automations.jsearchApiKeyRequired": "Clave API requerida — configurar en Ajustes",
    "automations.configureApiKey": "Ir a Ajustes → Claves API",
    "automations.noApiKeyNeeded": "No se requiere clave API",

    // U3: Threshold Toggle
    "automations.enableAiScoring": "Activar puntuación IA",
    "automations.enableAiScoringDesc": "Usar IA para puntuar y filtrar empleos descubiertos contra su currículum",
    "automations.collectOnlyMode": "Solo recolectar (sin puntuación IA)",
    "automations.collectOnlyDesc": "Todos los empleos descubiertos se recolectarán sin puntuación IA. Puede revisarlos manualmente.",
    "automations.disabled": "Desactivado",

    // U4: Flexible Runtimes
    "automations.scheduleFrequency": "Frecuencia de ejecución",
    "automations.selectFrequency": "Seleccionar frecuencia",
    "automations.scheduleFrequencyDesc": "Con qué frecuencia la automatización debe buscar nuevos empleos",
    "automations.scheduleEvery6Hours": "Cada 6 horas",
    "automations.scheduleEvery12Hours": "Cada 12 horas",
    "automations.scheduleDaily": "Diario",
    "automations.scheduleEvery2Days": "Cada 2 días",
    "automations.scheduleWeekly": "Semanal",
    "automations.preferredStartTime": "Hora de inicio preferida",

    // Resume Combobox
    "automations.searchResume": "Buscar currículums...",
    "automations.noResumeFound": "Ningún CV encontrado",

    // Create & Run Now
    "automations.createAndRun": "Crear y Ejecutar",

    // Performance warning
    "automations.performanceWarning": "Tienes muchas automatizaciones. Esto puede afectar el rendimiento del sistema. Aseg\u00farate de tener suficientes recursos.",
    "automations.performanceWarningBanner": "Tienes {count} automatizaciones. Muchas automatizaciones pueden afectar el rendimiento del sistema. Aseg\u00farate de tener suficientes recursos.",

    // Connector Params — Section header
    "automations.connectorParams": "Opciones de búsqueda avanzadas",

    // Connector Params — Arbeitsagentur
    "automations.params.umkreis": "Radio (km)",
    "automations.params.veroeffentlichtseit": "Publicado en los últimos (días)",
    "automations.params.arbeitszeit": "Jornada laboral",
    "automations.params.befristung": "Tipo de contrato",
    "automations.paramOption.arbeitsagentur.arbeitszeit.vz": "Tiempo completo",
    "automations.paramOption.arbeitsagentur.arbeitszeit.tz": "Tiempo parcial",
    "automations.paramOption.arbeitsagentur.arbeitszeit.snw": "Turnos/noche/fin de semana",
    "automations.paramOption.arbeitsagentur.arbeitszeit.mj": "Minijob",
    "automations.paramOption.arbeitsagentur.arbeitszeit.ho": "Teletrabajo",
    "automations.paramOption.arbeitsagentur.befristung.1": "Indefinido",
    "automations.paramOption.arbeitsagentur.befristung.2": "Temporal",

    // Connector Params — EURES: publicationPeriod
    "automations.params.publicationPeriod": "Publicado en los últimos",
    "automations.paramOption.eures.publicationPeriod.LAST_DAY": "Último día",
    "automations.paramOption.eures.publicationPeriod.LAST_THREE_DAYS": "Últimos 3 días",
    "automations.paramOption.eures.publicationPeriod.LAST_WEEK": "Última semana",
    "automations.paramOption.eures.publicationPeriod.LAST_MONTH": "Último mes",

    // Connector Params — EURES: experience level
    "automations.params.experienceLevel": "Nivel de experiencia",
    "automations.paramOption.eures.requiredExperienceCodes.none_required": "Sin experiencia requerida",
    "automations.paramOption.eures.requiredExperienceCodes.up_to_1_year": "Hasta 1 año",
    "automations.paramOption.eures.requiredExperienceCodes.between_1_and_2_years": "1-2 años",
    "automations.paramOption.eures.requiredExperienceCodes.between_2_and_5_years": "2-5 años",
    "automations.paramOption.eures.requiredExperienceCodes.more_than_5_years": "Más de 5 años",

    // Connector Params — EURES: position offering
    "automations.params.positionOffering": "Tipo de puesto",
    "automations.paramOption.eures.positionOfferingCodes.directhire": "Contratación directa",
    "automations.paramOption.eures.positionOfferingCodes.contract": "Contrato",
    "automations.paramOption.eures.positionOfferingCodes.temporary": "Temporal",
    "automations.paramOption.eures.positionOfferingCodes.internship": "Prácticas",
    "automations.paramOption.eures.positionOfferingCodes.apprenticeship": "Aprendizaje",
    "automations.paramOption.eures.positionOfferingCodes.selfemployed": "Autónomo",
    "automations.paramOption.eures.positionOfferingCodes.seasonal": "Temporal de temporada",
    "automations.paramOption.eures.positionOfferingCodes.volunteer": "Voluntariado",

    // Connector Params — EURES: working time
    "automations.params.workingTime": "Jornada laboral",
    "automations.paramOption.eures.positionScheduleCodes.fulltime": "Tiempo completo",
    "automations.paramOption.eures.positionScheduleCodes.parttime": "Tiempo parcial",
    "automations.paramOption.eures.positionScheduleCodes.flextime": "Horario flexible",

    // Connector Params — EURES: education level
    "automations.params.educationLevel": "Nivel de educación",
    "automations.paramOption.eures.educationLevelCodes.basic": "Educación básica",
    "automations.paramOption.eures.educationLevelCodes.medium": "Educación secundaria",
    "automations.paramOption.eures.educationLevelCodes.bachelor": "Grado universitario",
    "automations.paramOption.eures.educationLevelCodes.master": "Máster",
    "automations.paramOption.eures.educationLevelCodes.tertiary": "Educación superior",
    "automations.paramOption.eures.educationLevelCodes.doctoral": "Doctorado",

    // Connector Params — EURES: sector
    "automations.params.sector": "Sector industrial",

    // Connector Params — EURES: EURES flag
    "automations.params.euresFlag": "Indicador EURES",
    "automations.paramOption.eures.euresFlagCodes.WITH": "Solo ofertas EURES",
    "automations.paramOption.eures.euresFlagCodes.WITHOUT": "Solo ofertas no EURES",

    // Connector Params — EURES: required languages
    "automations.params.requiredLanguages": "Idiomas requeridos",

    // Connector Params — EURES: keyword search scope
    "automations.params.keywordSearchScope": "Ámbito de búsqueda",
    "automations.paramOption.eures.specificSearchCode.EVERYWHERE": "En todas partes",
    "automations.paramOption.eures.specificSearchCode.TITLE": "Solo título",
    "automations.paramOption.eures.specificSearchCode.DESCRIPTION": "Solo descripción",
    "automations.paramOption.eures.specificSearchCode.EMPLOYER": "Solo empleador",

    // Connector Params — EURES: sort order
    "automations.params.sortOrder": "Orden de clasificación",
    "automations.paramOption.eures.sortSearch.BEST_MATCH": "Mejor coincidencia",
    "automations.paramOption.eures.sortSearch.MOST_RECENT": "Más reciente",

    // Scheduler Coordination (ROADMAP 0.10)
    "automations.queued": "En cola",
    "automations.alreadyRunning": "Esta automatización ya se está ejecutando",
    "automations.moduleBusy": "El módulo está siendo utilizado por otra automatización",
    "automations.schedulerIdle": "Inactivo",
    "automations.schedulerRunning": "Planificador activo",
    "automations.runSourceScheduler": "Programado",
    "automations.runSourceManual": "Manual",
    "automations.sourceHeader": "Fuente",

    // SchedulerStatusBar (B1)
    "automations.schedulerPhaseRunning": "En ejecucion",
    "automations.schedulerPhaseCooldown": "Finalizando...",
    "automations.schedulerStatus": "Estado del planificador",
    "automations.schedulerPhase": "Fase",
    "automations.schedulerActive": "Activo",
    "automations.schedulerModule": "Modulo",
    "automations.schedulerQueueRemaining": "restante(s)",
    "automations.schedulerLastCompleted": "Ultimo completado",
    "automations.schedulerNoAutomations": "No hay automatizaciones configuradas",

    // ConflictWarningDialog (B2)
    "automations.conflictBlocked": "Automatizacion ya en ejecucion",
    "automations.conflictBlockedDesc": "Esta automatizacion ya se esta ejecutando. Por favor, espere a que termine.",
    "automations.conflictContention": "Modulo en uso",
    "automations.conflictContentionDesc": "El modulo esta siendo utilizado por otra automatizacion. Los resultados podrian estar limitados.",
    "automations.conflictProceed": "Continuar de todos modos",
    "automations.conflictCancel": "Cancelar",
    "automations.conflictStartedAt": "Iniciado",
    "automations.conflictSource": "Fuente",

    // RunProgressPanel (B3)
    "automations.runProgress": "Progreso",
    "automations.phaseSearch": "Busqueda",
    "automations.phaseDedup": "Duplicados",
    "automations.phaseEnrich": "Enriquecer",
    "automations.phaseMatch": "Coincidencia",
    "automations.phaseSave": "Guardar",
    "automations.phaseFinalize": "Finalizar",

    // Staging Queue live updates (B10)
    "automations.newItemsAvailable": "Nuevos elementos disponibles",
    "automations.showNewItems": "Mostrar nuevos",

    // Detail page labels (A9 i18n) + B6 tooltip
    "automations.never": "Nunca",
    "automations.tabLogs": "Registros",
    "automations.total": "en total",
    "automations.runNowPaused": "No se puede ejecutar mientras está en pausa",
    "automations.runNowResumeMissing": "No se puede ejecutar sin currículum",
    "automations.notFound": "Automatización no encontrada",
    "automations.statusRunning": "En ejecución",
    "automations.statusCompleted": "Completada",
    "automations.statusFailed": "Fallida",
    "automations.statusCompletedWithErrors": "Completada con errores",
    "automations.statusBlocked": "Bloqueada",
    "automations.statusRateLimited": "Limitada por tasa",

    // AutomationList - Status & Module display
    "automations.statusActive": "Activo",
    "automations.statusPaused": "En pausa",
    "automations.moduleEures": "EURES",
    "automations.moduleArbeitsagentur": "Arbeitsagentur",
    "automations.moduleJsearch": "JSearch",

    // RunHistoryList - Blocked reasons
    "automations.blockedAlreadyRunning": "Ya en ejecución",
    "automations.blockedModuleBusy": "Módulo ocupado",
    "automations.blockedModuleDeactivated": "Módulo desactivado",
    "automations.blockedAuthFailure": "Error de autenticación",
    "automations.blockedConsecutiveFailures": "Fallos consecutivos",
    "automations.blockedCircuitBreaker": "Interruptor activado",
    "automations.blockedResumeMissing": "Currículum faltante",
    "automations.blockedUnknown": "Bloqueada",
    // elapsed time
    "automations.elapsedHourMinSec": "{hour} h {min} min {sec} s",
    "automations.elapsedMinSec": "{min} min {sec} s",
    "automations.elapsedSec": "{sec} s",
    "automations.queuedCount": "{count} automatizaciones en cola",
    // run history
    "automations.runHistoryError": "No se pudo cargar el historial de ejecuciones",
    "automations.runHistoryRetry": "Reintentar",
    "automations.runEnded": "Ejecución completada",
    // detail header a11y
    "automations.backToList": "Volver a la lista de automatizaciones",
    "automations.refresh": "Actualizar",
  },
} as const;
