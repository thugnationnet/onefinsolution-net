import { readFileSync, writeFileSync } from 'node:fs';

const path = 'lib/stripe-fulfillment.ts';
let src = readFileSync(path, 'utf8');

// Normalize working copy to LF for matching, then write LF (project can re-normalize)
const working = src.replace(/\r\n/g, '\n');

const from = `  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    try {
      await applySoftwareStorefrontRefund(charge);
      const user = await owner(charge.customer);
      const amount =
        typeof charge.amount_refunded === 'number'
          ? \`\${(charge.amount_refunded / 100).toFixed(2)} \${String(charge.currency || 'usd').toUpperCase()}\`
          : null;
      await queueBillingNotice(
        \`charge-refunded:\${charge.id}:\${charge.amount_refunded || 0}\`,
        user,
        amount ? \`Refund processed - \${amount}\` : 'Refund processed',
        \`A refund was issued to your original payment method\${amount ? \` (\${amount})\` : ''}. It may take several business days to appear. View billing at \${sitePath('/dashboard/billing')}.\`,
      );
    } catch {
      /* charge may not map to a known customer */
    }
  }`;

const to = `  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    // Software ledger first. Failures must surface so Stripe retries.
    await applySoftwareStorefrontRefund(charge);
    try {
      const user = await owner(charge.customer);
      const amount =
        typeof charge.amount_refunded === 'number'
          ? \`\${(charge.amount_refunded / 100).toFixed(2)} \${String(charge.currency || 'usd').toUpperCase()}\`
          : null;
      await queueBillingNotice(
        \`charge-refunded:\${charge.id}:\${charge.amount_refunded || 0}\`,
        user,
        amount ? \`Refund processed - \${amount}\` : 'Refund processed',
        \`A refund was issued to your original payment method\${amount ? \` (\${amount})\` : ''}. It may take several business days to appear. View billing at \${sitePath('/dashboard/billing')}.\`,
      );
    } catch {
      /* charge may not map to a known customer for billing notice */
    }
  }`;

if (!working.includes("await applySoftwareStorefrontRefund(charge)")) {
  console.error('missing refund call');
  process.exit(1);
}

if (working.includes('// Software ledger first. Failures must surface so Stripe retries.')) {
  console.log('already fixed');
  process.exit(0);
}

if (!working.includes(from)) {
  // looser: just move await outside try via regex
  const re =
    /\} else if \(event\.type === 'charge\.refunded'\) \{\n    const charge = event\.data\.object as Stripe\.Charge;\n    try \{\n      await applySoftwareStorefrontRefund\(charge\);\n      const user = await owner\(charge\.customer\);/;
  if (!re.test(working)) {
    const i = working.indexOf('charge.refunded');
    console.error('block not found', JSON.stringify(working.slice(i, i + 250)));
    process.exit(1);
  }
  const next = working.replace(
    re,
    `} else if (event.type === 'charge.refunded') {\n    const charge = event.data.object as Stripe.Charge;\n    // Software ledger first. Failures must surface so Stripe retries.\n    await applySoftwareStorefrontRefund(charge);\n    try {\n      const user = await owner(charge.customer);`,
  );
  writeFileSync(path, next);
  console.log('fixed via regex');
  process.exit(0);
}

writeFileSync(path, working.replace(from, to));
console.log('fixed via exact');
