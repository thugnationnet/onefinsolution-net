import { readFileSync, writeFileSync } from 'node:fs';

function patch(path, transform) {
  const before = readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log('NOCHANGE', path);
    return false;
  }
  writeFileSync(path, after);
  console.log('PATCHED', path, before.length, '->', after.length);
  return true;
}

// --- stripe-fulfillment: import + call refund helper ---
patch('lib/stripe-fulfillment.ts', (src) => {
  let out = src;
  if (!out.includes("from './software-refund'") && !out.includes('from "./software-refund"')) {
    // Try several import insertion points
    if (out.includes("from './subscription-catalog'")) {
      out = out.replace(
        /from '\.\/subscription-catalog';/,
        "from './subscription-catalog';\nimport { applySoftwareStorefrontRefund } from './software-refund';",
      );
    } else if (out.includes('from "./subscription-catalog"')) {
      out = out.replace(
        /from "\.\/subscription-catalog";/,
        'from "./subscription-catalog";\nimport { applySoftwareStorefrontRefund } from "./software-refund";',
      );
    } else {
      out = "import { applySoftwareStorefrontRefund } from './software-refund';\n" + out;
    }
  }
  if (!out.includes('applySoftwareStorefrontRefund(charge)')) {
    // Insert after charge assignment inside charge.refunded branch
    out = out.replace(
      /(event\.type === ['"]charge\.refunded['"][\s\S]*?const charge = event\.data\.object as Stripe\.Charge;\s*)/,
      '$1// Software ledger first (payment_intent linked). Non-software charges no-op safely.\n    await applySoftwareStorefrontRefund(charge);\n    ',
    );
  }
  return out;
});

// --- subscription-enrollment: block custom self-serve ---
patch('lib/subscription-enrollment.ts', (src) => {
  if (src.includes("key === 'custom'") || src.includes('key==="custom"') || src.includes("key==='custom'")) {
    return src;
  }
  // Insert at start of prepareEnrollment body
  return src.replace(
    /(export async function prepareEnrollment\([^)]*\)\s*\{)/,
    `$1\n  // Custom is schema-supported for ops/manual billing only — not self-serve Stripe Checkout.\n  if (typeof arguments[1] === 'string' && arguments[1] === 'custom') {\n    throw new Error('Custom plans are arranged with our team. Choose a standard plan or contact support.');\n  }\n  if (typeof key !== 'undefined' && key === 'custom') {\n    throw new Error('Custom plans are arranged with our team. Choose a standard plan or contact support.');\n  }\n`,
  );
});

// --- software account deposit labels ---
patch('app/software/account/page.tsx', (src) => {
  let out = src;
  // Replace partially_paid label variants
  out = out.replace(/'Partially paid'/g, "'Deposit / balance due'");
  out = out.replace(/"Partially paid"/g, '"Deposit / balance due"');
  out = out.replace(/'Fully paid'/g, "'Paid in full'");
  out = out.replace(/"Fully paid"/g, '"Paid in full"');
  // If paymentLabel block uses status only, leave as-is after label renames
  return out;
});

// --- workspace isolation copy strengthen ---
patch('components/workspace-application.tsx', (src) => {
  if (src.includes('Subscription cards are never used')) return src;
  // Insert near CREDIT RELOADS heading
  return src.replace(
    /(<p className="workspace-eyebrow">CREDIT RELOADS<\/p>)/,
    `$1\n              <p className="workspace-muted-copy" style={{marginTop:4}}>Uses a Workspace-only card. Subscription cards are never used for credits or auto-reload.</p>`,
  );
});

console.log('apply done');
