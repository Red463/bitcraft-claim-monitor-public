import assert from "node:assert/strict";
import test from "node:test";

import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION, legalPolicyForEnvironment } from "../src/legal/legalPolicy.mjs";
import { legalPolicyDigests } from "../src/server/legalPolicyDigest.mjs";

test("default policy identifies the public application and operator", () => {
  const policy = legalPolicyForEnvironment({});
  assert.equal(policy.version, LEGAL_VERSION);
  assert.equal(policy.effectiveDate, LEGAL_EFFECTIVE_DATE);
  assert.equal(policy.operator.controllerName, "Thomas Bush");
  assert.equal(policy.operator.projectName, "BitCraft Claim Monitor");
  assert.equal(policy.operator.privacyEmail, "privacy@timbersteeltrade.com");
  assert.equal(policy.operator.minimumAge, 18);
  assert.equal(policy.operator.status, "BitCraft Claim Monitor is operated by Thomas Bush.");
});

test("policy describes anonymous browsing, local preferences, shared plans, and admin-only Discord", () => {
  const policy = legalPolicyForEnvironment({});
  const published = JSON.stringify(policy);
  for (const subject of ["Anonymous use", "browser storage", "Shared craft plans", "Administrator OAuth identity provider only"]) {
    assert.match(published, new RegExp(subject, "i"));
  }
  assert.doesNotMatch(published, /character linking|ordinary app account|Discord bot|guild moderation/i);
  assert.equal(policy.retention.find((rule) => rule.key === "activity-history").days, 90);
  assert.equal(policy.retention.find((rule) => rule.key === "market-trades").days, 365);
});

test("deployment overrides affect the published policy and stable digests", () => {
  const first = legalPolicyForEnvironment({
    LEGAL_CONTROLLER_NAME: "Example Operator",
    LEGAL_PROJECT_NAME: "Example Monitor",
    LEGAL_PRIVACY_EMAIL: "privacy@example.com",
    LEGAL_CONTROLLER_COUNTRY: "United Kingdom",
    LEGAL_GOVERNING_LAW: "Scotland",
    LEGAL_MINIMUM_AGE: "21",
  });
  const second = legalPolicyForEnvironment({ ...first, LEGAL_PROJECT_NAME: "Different Monitor" });
  assert.equal(first.operator.projectName, "Example Monitor");
  assert.equal(first.operator.minimumAge, 21);
  assert.notDeepEqual(legalPolicyDigests(first), legalPolicyDigests(second));
});

test("production refuses an unconfirmed legal identity", () => {
  assert.throws(() => legalPolicyForEnvironment({ NODE_ENV: "production" }), /LEGAL_CONFIGURATION_CONFIRMED=true/);
  assert.doesNotThrow(() => legalPolicyForEnvironment({ NODE_ENV: "production", LEGAL_CONFIGURATION_CONFIRMED: "true" }));
});

test("invalid legal configuration fails closed", () => {
  assert.throws(() => legalPolicyForEnvironment({ LEGAL_PRIVACY_EMAIL: "invalid" }), /valid legal privacy email/);
  assert.throws(() => legalPolicyForEnvironment({ LEGAL_MINIMUM_AGE: "17" }), /at least 18/);
});
