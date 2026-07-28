export const LEGAL_VERSION = "2026-07-27";
export const LEGAL_EFFECTIVE_DATE = "2026-07-27";

export const defaultLegalOperator = Object.freeze({
  controllerName: "Thomas Bush",
  projectName: "BitCraft Claim Monitor",
  privacyEmail: "privacy@timbersteeltrade.com",
  controllerCountry: "United Kingdom",
  governingLaw: "England and Wales",
  minimumAge: 18,
  status: "BitCraft Claim Monitor is operated by Thomas Bush.",
});

const providerDefinitions = Object.freeze([
  {
    key: "vps",
    name: "Application VPS provider",
    role: "Application, SQLite database, log, and encrypted-backup hosting",
    data: "Public game-data cache, shared plans, security logs, administrator records, and operational files.",
    location: "Configured production hosting location.",
  },
  {
    key: "discord",
    name: "Discord",
    role: "Administrator OAuth identity provider only",
    data: "Approved administrator Discord ID and profile details. Ordinary visitors do not sign in with Discord.",
    location: "International processing under Discord's terms and privacy policy.",
  },
  {
    key: "bitjita",
    name: "BitJita",
    role: "Public BitCraft game-data API",
    data: "Public game, claim, character, inventory, market, region, empire, and activity information.",
    location: "As described by BitJita.",
  },
  {
    key: "github",
    name: "GitHub",
    role: "Public source-code, issue, release, and deployment-workflow provider",
    data: "Repository activity and technical deployment metadata.",
    location: "International processing under GitHub's privacy statement.",
  },
  {
    key: "email",
    name: "Email provider",
    role: "Privacy and support correspondence",
    data: "Email addresses, message content, attachments, and correspondence records.",
    location: "As described by the configured email provider.",
  },
]);

const retentionRules = Object.freeze([
  { key: "activity-history", label: "Activity and claim snapshots", rule: "90 days by default", days: 90 },
  { key: "market-trades", label: "Confirmed market trades", rule: "365 days by default", days: 365 },
  { key: "current-state", label: "Current public game-data state", rule: "Until replaced by a newer state" },
  { key: "shared-plans", label: "Shared craft plans", rule: "Until archived or deleted by the creator or an administrator" },
  { key: "plan-reports", label: "Shared-plan abuse reports", rule: "Until reviewed and no longer operationally required" },
  { key: "admin-sessions", label: "Administrator sessions", rule: "7 days", days: 7 },
  { key: "admin-audit", label: "Administrator audit history", rule: "12 months by default", months: 12 },
  { key: "analytics-events", label: "Optional analytics events", rule: "90 days", days: 90 },
  { key: "full-ip", label: "Full IP address in security logs", rule: "7 days", days: 7 },
  { key: "security-anonymised", label: "Hashed or anonymised security records", rule: "180 days", days: 180 },
  { key: "server-health", label: "Server-health diagnostics", rule: "7 days", days: 7 },
  { key: "privacy-correspondence", label: "Privacy correspondence", rule: "24 months unless a dispute or legal duty requires longer", months: 24 },
  { key: "daily-backups", label: "Daily encrypted backups", rule: "7 recovery points", maximumRows: 7 },
  { key: "migration-backups", label: "Migration backups", rule: "3 recovery points", maximumRows: 3 },
  { key: "manual-backups", label: "Manual backups", rule: "3 recovery points", maximumRows: 3 },
]);

function configuredValue(env, key, fallback) {
  return env?.[key] === undefined ? fallback : String(env[key]).trim();
}

function validatedOperator(env) {
  const operator = {
    controllerName: configuredValue(env, "LEGAL_CONTROLLER_NAME", defaultLegalOperator.controllerName),
    projectName: configuredValue(env, "LEGAL_PROJECT_NAME", defaultLegalOperator.projectName),
    privacyEmail: configuredValue(env, "LEGAL_PRIVACY_EMAIL", defaultLegalOperator.privacyEmail),
    controllerCountry: configuredValue(env, "LEGAL_CONTROLLER_COUNTRY", defaultLegalOperator.controllerCountry),
    governingLaw: configuredValue(env, "LEGAL_GOVERNING_LAW", defaultLegalOperator.governingLaw),
    minimumAge: Number(configuredValue(env, "LEGAL_MINIMUM_AGE", defaultLegalOperator.minimumAge)),
  };
  if (!operator.controllerName) throw new Error("Legal controller name is required");
  if (!operator.projectName) throw new Error("Legal project name is required");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(operator.privacyEmail)) throw new Error("A valid legal privacy email is required");
  if (!operator.controllerCountry) throw new Error("Legal controller country is required");
  if (!operator.governingLaw) throw new Error("Legal governing law is required");
  if (!Number.isInteger(operator.minimumAge) || operator.minimumAge < 18 || operator.minimumAge > 120) {
    throw new Error("Legal minimum age must be an integer of at least 18");
  }
  return Object.freeze({ ...operator, status: `${operator.projectName} is operated by ${operator.controllerName}.` });
}

function termsSections(operator) {
  const project = operator.projectName;
  return [
    {
      id: "operator",
      title: "Operator and status",
      paragraphs: [
        operator.status,
        `${project} is an unofficial community application and is not affiliated with Clockwork Labs, BitCraft, BitJita, Discord, or GitHub.`,
      ],
    },
    {
      id: "eligibility",
      title: "Eligibility",
      paragraphs: [`You must be at least ${operator.minimumAge} years old and comply with laws and platform rules that apply to you.`],
    },
    {
      id: "anonymous-use",
      title: "Anonymous use and browser storage",
      paragraphs: [
        "Ordinary visitors do not create an account. Claim choice, themes, filters, notifications, selected shared plans, edit keys, and Market watches are stored in the browser.",
        "Clearing browser data can permanently remove local preferences and plan edit keys. The operator cannot recover a lost edit key.",
      ],
    },
    {
      id: "shared-plans",
      title: "Shared craft plans",
      paragraphs: [
        "Shared plans are publicly readable within their claim. Anyone holding the private edit key can change or archive the plan, so keep that key confidential.",
        "Do not place personal, unlawful, abusive, deceptive, or infringing content in a plan or report. Plans may be rate-limited, archived, moderated, or deleted to protect the service.",
      ],
    },
    {
      id: "game-data",
      title: "Public game data and estimates",
      paragraphs: [
        "BitJita and BitCraft information may be delayed, incomplete, unavailable, or inaccurate. Calculations and estimates are operational aids and are not guaranteed facts.",
      ],
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      paragraphs: ["Use the service lawfully without harming people, the application, or connected providers."],
      bullets: [
        "Do not bypass controls, overload, probe, scrape abusively, or disrupt the service.",
        "Do not misuse another person's identifiers, plan edit key, or personal information.",
        "Do not submit false abuse reports or unlawful, malicious, deceptive, or infringing content.",
      ],
    },
    {
      id: "administration",
      title: "Administration and availability",
      paragraphs: [
        "Discord OAuth is used only for approved administrators. Administrative access may be revoked for security or operational reasons.",
        "The service may change, pause, or end and is not guaranteed to be uninterrupted. Do not rely on it as the sole source for important in-game decisions.",
      ],
    },
    {
      id: "intellectual-property",
      title: "Intellectual property and third parties",
      paragraphs: [
        `The ${project} source and notices remain subject to their published licence. BitCraft, BitJita, Discord, provider names, game assets, and third-party content belong to their respective owners.`,
      ],
    },
    {
      id: "liability",
      title: "Fair liability terms",
      paragraphs: [
        "To the extent permitted by law, the operator is not responsible for loss caused solely by misuse, third-party conduct, unavailable public data, or matters genuinely outside reasonable control.",
        "Nothing excludes liability that cannot lawfully be excluded, including fraud, deliberate wrongdoing, data-protection duties, or mandatory consumer rights.",
      ],
    },
    {
      id: "contact-and-law",
      title: "Contact, changes, and governing law",
      paragraphs: [
        `Contact ${operator.privacyEmail} with questions or complaints. Material changes receive a new version and effective date.`,
        `These Terms are governed by the law of ${operator.governingLaw}, without removing mandatory rights available where you live.`,
      ],
    },
  ];
}

function privacySections(operator) {
  return [
    {
      id: "controller",
      title: "Controller",
      paragraphs: [`${operator.controllerName}, based in ${operator.controllerCountry}, is the controller. Contact: ${operator.privacyEmail}.`],
    },
    {
      id: "data-we-process",
      title: "Data we process",
      paragraphs: [
        "The service processes public BitJita game data, claim-interest heartbeats, shared-plan content and reports, security and request logs, optional analytics, administrator Discord identity and sessions, audit records, and privacy correspondence.",
        "Ordinary visitor preferences and Market watches remain in browser storage and are not synchronized to an account.",
      ],
    },
    {
      id: "purposes-and-bases",
      title: "Purposes and lawful bases",
      paragraphs: [
        "Legitimate interests support delivery of requested public pages, active-use history collection, service security, abuse prevention, diagnostics, plan moderation, and proportionate administration. Consent is used for optional analytics and can be withdrawn.",
        "Contract applies where an administrator accepts protected access duties or a visitor submits a shared plan for publication. Legal obligation applies where records must be handled for law, rights requests, or disputes.",
      ],
    },
    {
      id: "cookies-and-storage",
      title: "Cookies and browser storage",
      paragraphs: [
        "Necessary browser storage remembers claim and local preferences. Secure HttpOnly cookies are used only for administrator sessions and OAuth state. Optional analytics storage is controlled separately.",
      ],
    },
    {
      id: "sharing-and-transfers",
      title: "Providers and international processing",
      paragraphs: [
        "Data is shared only as required with the providers listed below, for security or legal compliance, or at your direction. Discord is used only for administrator authentication.",
        "Some providers may process data internationally under their own safeguards and applicable transfer mechanisms.",
      ],
    },
    {
      id: "retention",
      title: "Retention and backups",
      paragraphs: [
        "Data is retained according to the table below. Current game-data records are replaced by newer state; history and confirmed trades use configurable defaults of 90 and 365 days.",
        "Backups expire by recovery class. Restoring a backup never automatically rolls back live SQLite data after the application has accepted newer writes.",
      ],
    },
    {
      id: "rights",
      title: "Your rights",
      paragraphs: [
        `Depending on applicable law, you may request access, correction, deletion, restriction, portability, or object to processing, and may withdraw analytics consent. Email ${operator.privacyEmail}; requests are normally answered within one month.`,
        "There is no solely automated decision-making that produces legal or similarly significant effects.",
      ],
    },
    {
      id: "security",
      title: "Security",
      paragraphs: [
        "Controls include data minimisation, same-origin and CSRF checks, secure administrator cookies, OAuth state validation, rate limits, audit logging, restricted services, encrypted backups, and tested recovery procedures. No internet service can promise absolute security.",
      ],
    },
    {
      id: "complaints",
      title: "Complaints and changes",
      paragraphs: [
        `Contact ${operator.privacyEmail} first if you can. You may also complain to the UK Information Commissioner's Office or your available data-protection authority. Material policy changes receive a new version and effective date.`,
      ],
    },
  ];
}

export function legalPolicyForEnvironment(env = {}) {
  if (String(env?.NODE_ENV ?? "").toLowerCase() === "production" && String(env?.LEGAL_CONFIGURATION_CONFIRMED ?? "").toLowerCase() !== "true") {
    throw new Error("Production requires LEGAL_CONFIGURATION_CONFIRMED=true after reviewing the published legal identity");
  }
  const operator = validatedOperator(env);
  return Object.freeze({
    version: LEGAL_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    operator,
    supportUrl: "https://buymeacoffee.com/tom.bush",
    providers: providerDefinitions.map((provider) => ({ ...provider })),
    retention: retentionRules.map((rule) => ({ ...rule })),
    terms: { title: "Terms of Service", sections: termsSections(operator) },
    privacy: { title: "Privacy Policy", sections: privacySections(operator) },
    notice: "These documents describe this service and are not legal advice to users or other operators.",
  });
}
