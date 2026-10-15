import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('software checkout enforces the USD amount range and catalog allowlist', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { getSoftwarePurchaseItem, parseSoftwarePaymentAmount } from './lib/software-purchase.ts';
    import { STOREFRONT_TEMPLATES } from './app/software/src/data/templatesData.ts';
    import { softwareCatalog } from './app/software/src/data/catalog.ts';

    assert.equal(parseSoftwarePaymentAmount('4.99', 4900), null);
    assert.equal(parseSoftwarePaymentAmount('5', 4900), 500);
    assert.equal(parseSoftwarePaymentAmount('5.5', 4900), 550);
    assert.equal(parseSoftwarePaymentAmount('49.00', 4900), 4900);
    assert.equal(parseSoftwarePaymentAmount('49.01', 4900), null);
    assert.equal(parseSoftwarePaymentAmount('-5', 4900), null);
    assert.equal(parseSoftwarePaymentAmount('5e2', 4900), null);
    assert.equal(parseSoftwarePaymentAmount('5.999', 4900), null);
    assert.equal(getSoftwarePurchaseItem('template', STOREFRONT_TEMPLATES[0].id)?.priceCents, 4900);
    assert.equal(getSoftwarePurchaseItem('software', softwareCatalog[0].id)?.priceCents, 4900);
    assert.equal(getSoftwarePurchaseItem('software', 'not-a-product'), null);
    assert.equal(getSoftwarePurchaseItem('invalid', softwareCatalog[0].id), null);
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
