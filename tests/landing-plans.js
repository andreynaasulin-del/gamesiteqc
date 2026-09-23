import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  plans,
  anchorPrice,
  planAnchor,
  planDiscount,
  formatCredits,
  monthlyEquivalent,
  yearlySavings,
  PLAN_DISCOUNT,
  PLANS_URL,
} from "../src/landing/plans.js";

// Pro and Pro yearly are ONE product bought on two terms. The recommended
// column is the monthly Pro term (centre of the table, the tier every
// "From Pro" cell points at); the yearly column earns its place with a
// lower per-month price and a stated saving, not a band.
test("the two Pro terms are the same product, and monthly Pro is recommended", () => {
  const byId = Object.fromEntries(plans.map((plan) => [plan.id, plan]));
  const pro = byId["monthly-pro"];
  const yearly = byId.yearly;

  // Same product: same credits, same model access, row for row.
  assert.equal(pro.credits, yearly.credits);
  assert.deepEqual(pro.models, yearly.models);
  // ...and named as one product, so the columns cannot read as two tiers.
  assert.match(yearly.name, new RegExp(`^${pro.name}\\b`));

  // Two terms: the yearly one must cost less per month, or it has no reason
  // to exist; the recommendation sits on the monthly Pro term.
  assert.ok(
    monthlyEquivalent(yearly) < monthlyEquivalent(pro),
    `yearly ($${monthlyEquivalent(yearly)}/mo) must undercut monthly ($${monthlyEquivalent(pro)}/mo)`,
  );
  assert.deepEqual(
    plans.filter((plan) => plan.featured).map((plan) => plan.id),
    ["monthly-pro"],
  );

  // The saving is arithmetic, not a marketing figure.
  assert.equal(yearlySavings(yearly), pro.price * 12 - yearly.price);
  // Both terms are struck at the same discount, so the two crossed-out
  // rates cannot tell different stories about the same offer.
  assert.equal(planDiscount(yearly), planDiscount(pro));
  assert.equal(anchorPrice(yearly.price) / yearly.price, anchorPrice(pro.price) / pro.price);
});

// The launch discount is a Pro offer. The entry tier is sold at list, so
// its column carries no struck price — and the two Pro columns must.
test("only the Pro terms carry a struck regular rate", () => {
  const byId = Object.fromEntries(plans.map((plan) => [plan.id, plan]));
  assert.equal(planAnchor(byId.monthly), null);
  assert.equal(planAnchor(byId["monthly-pro"]), anchorPrice(byId["monthly-pro"].price));
  assert.equal(planAnchor(byId.yearly), anchorPrice(byId.yearly.price));
  // The heading may not promise a discount on every plan when one is at list.
  const landing = readFileSync("index.html", "utf8");
  assert.doesNotMatch(landing, /Every plan is\s+half/i);
});

// The two credit figures are a product decision, not styling. Anyone
// touching this file has to break a test to change them.
test("Monthly is 1,000 credits and both Pro terms are 5,000", () => {
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

// Three columns sitting side by side is the one place inconsistent
// punctuation is impossible to miss: the yearly line shipped without its
// final period because its sentence was hardcoded in the renderer while the
// other two came from this file. Both facts are now locked — the copy lives
// here, and the renderer only splices the saving into it.
test("the billing line comes from plans.js and every column ends its sentence", () => {
  const app = readFileSync("src/landing/app.js", "utf8");

  // No column may have its billing sentence written in the renderer.
  assert.match(
    app,
    /const base = escapeHtml\(plan\.billing\)/,
    "the billing sentence must be read from plans.js, not typed in app.js",
  );
  assert.doesNotMatch(
    app,
    /"Billed |`Billed /,
    "a billing sentence is hardcoded in app.js",
  );

  for (const plan of plans) {
    // The renderer strips one trailing period and re-adds it after the
    // saving, so a string carrying two would print "..Pro.." .
    assert.doesNotMatch(plan.billing, /\.\s*\.$/, `${plan.id}: double period`);
    // Long enough to be a sentence, short enough to stay on one line next
    // to a $168 saving at the 316px column width.
    assert.ok(
      plan.billing.length <= 48,
      `${plan.id}: billing is ${plan.billing.length} chars and will wrap the row for all three columns`,
    );
  }

  // The saving names a plan, and it must be the plan the arithmetic used.
  const byId = Object.fromEntries(plans.map((plan) => [plan.id, plan]));
  for (const plan of plans) {
    if (!yearlySavings(plan)) continue;
    assert.ok(byId[plan.comparedTo], `${plan.id}: comparedTo points at nothing`);
    assert.equal(byId[plan.comparedTo].per, "month", `${plan.id}: the reference term must be monthly`);
  }
});

// ARIA table roles require a role="row" inside a role="table". This grid has
// neither — the DOM is one element per PLAN holding that plan's whole
// column, and `display: contents` removes the wrapper boxes. Cells with no
// owning row are dropped from the accessibility tree, so the roles were
// decoration that failed validation. Each cell states its own full sentence
// instead; this test stops the roles coming back.
test("the pricing grid claims no table semantics it cannot honour", () => {
  const app = readFileSync("src/landing/app.js", "utf8");
  const landing = readFileSync("index.html", "utf8");
  for (const role of ["cell", "row", "table", "columnheader", "rowheader", "rowgroup"]) {
    for (const [name, source] of [["app.js", app], ["index.html", landing]]) {
      assert.doesNotMatch(
        source,
        new RegExp(`role="${role}"`),
        `${name}: role="${role}" needs a table/row ancestor the rate grid does not have`,
      );
    }
  }
  // What replaces them: the cell's sr-only text names the plan, so it reads
  // correctly with no row or column context to reconstruct.
  assert.match(
    app,
    /const sr = `\$\{plan\.name\} — \$\{label\}: \$\{verdict\}\.`/,
    "cell sr-only text must be a complete sentence naming its plan",
  );
});
