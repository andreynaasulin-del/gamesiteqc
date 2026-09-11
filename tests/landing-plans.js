import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  plans,
  anchorPrice,
  formatCredits,
  PLAN_DISCOUNT,
  PLANS_URL,
} from "../src/landing/plans.js";

// The two credit figures are a product decision, not styling. Anyone
// touching this file has to break a test to change them.
test("Monthly is 1,000 credits and Monthly Pro is 5,000", () => {
  const byId = Object.fromEntries(plans.map((plan) => [plan.id, plan]));
  assert.equal(byId.monthly.credits, 1000);
  assert.equal(byId["monthly-pro"].credits, 5000);
  assert.equal(byId.yearly.credits, 5000);
  // The credit figure is stated once, in the credits well. A perk that
  // repeats a number is a second place for it to go stale — and a perk that
  // states a DIFFERENT number is worse than no card.
  for (const plan of plans) {
    for (const feature of plan.features) {
      assert.doesNotMatch(feature, /\d[\d,]*\s*credits/i, `${plan.id}: "${feature}" restates credits`);
    }
  }
});

test("every plan states access for every model family", async () => {
  const { MODEL_CATALOG } = await import("../src/landing/plans.js");
  for (const plan of plans) {
    for (const entry of MODEL_CATALOG) {
      assert.ok(entry.id in plan.models, `${plan.id} has no row for ${entry.id}`);
      const access = plan.models[entry.id];
      if (access !== null) {
        assert.match(access.state, /^(full|capped)$/, `${plan.id}/${entry.id}`);
        if (access.state === "capped") assert.ok(access.limit, `${plan.id}/${entry.id}: capped needs a limit`);
      }
    }
  }
  // The featured tier must open everything the entry tier locks —
  // otherwise "From Pro" on a locked row is a lie.
  const byId = Object.fromEntries(plans.map((plan) => [plan.id, plan]));
  for (const entry of MODEL_CATALOG) {
    if (byId.monthly.models[entry.id] === null) {
      assert.ok(byId["monthly-pro"].models[entry.id], `${entry.id} locked on Monthly but not open on Pro`);
    }
  }
});

test("no free tier is offered on the landing", () => {
  for (const plan of plans) {
    assert.ok(plan.price > 0, `${plan.id} must have a real price`);
    assert.doesNotMatch(plan.name, /free/i);
  }
});

test("struck-through anchor is derived from one discount constant", () => {
  assert.equal(PLAN_DISCOUNT, 0.5);
  assert.equal(anchorPrice(9), 18);
  assert.equal(anchorPrice(29), 58);
  assert.equal(anchorPrice(180), 360);
  // An anchor must always be above the price, never equal to it.
  for (const plan of plans) {
    assert.ok(anchorPrice(plan.price) > plan.price, plan.id);
  }
});

test("credit figures are grouped for reading, and every plan is complete", () => {
  assert.equal(formatCredits(1000), "1,000");
  assert.equal(formatCredits(5000), "5,000");
  for (const plan of plans) {
    for (const field of ["id", "name", "per", "unit", "pitch", "billing", "cta"]) {
      assert.ok(plan[field], `${plan.id} missing ${field}`);
    }
    assert.ok(plan.features.length >= 3, `${plan.id} needs 3+ features`);
  }
  // Exactly one featured tier: two "best" cards is no recommendation at all.
  assert.equal(plans.filter((plan) => plan.featured).length, 1);
  assert.match(PLANS_URL, /^https:\/\/quadcode\.ai\//);
});

// The offer is presented in exactly one place. Two pricing surfaces is how a
// product ends up advertising $9 on one page and $12 on another.
test("the games landing is the only surface that shows the offer", () => {
  const pages = ["index.html", "play.html", "rocket.html", "strike.html"];
  const priced = pages.filter((page) =>
    /id="plan-list"|class="plan-card/.test(readFileSync(page, "utf8")),
  );
  assert.deepEqual(priced, ["index.html"]);

  const landing = readFileSync("index.html", "utf8");
  assert.equal(landing.match(/id="pricing"/g).length, 1);
  assert.equal(landing.match(/id="plan-list"/g).length, 1);
  // Prices are rendered from plans.js, never typed into markup — a hand-written
  // "$9" in HTML is a number nobody will remember to update.
  for (const plan of plans) {
    assert.doesNotMatch(
      landing,
      new RegExp(`\\$${plan.price}\\b`),
      `$${plan.price} is hardcoded in index.html`,
    );
  }
});
