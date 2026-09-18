/**
 * Run with:  npx tsx --test src/lib/futures-pnl.test.ts
 * Uses Node's built-in test runner. No extra dependencies.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialMarginUsd,
  krakenPerpSymbol,
  linearPnlUsd,
  parseFuturesSide,
  returnOnMargin,
  usdToEur,
} from './futures-pnl';

const near = (actual: number | null, expected: number, eps = 1e-6) => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) < eps, `expected ${expected}, got ${actual}`);
};

// The live position that exposed the bug (2026-09-18).
const XBT_LONG = { side: 'LONG' as const, size: 0.0194, entryPrice: 77623 };

describe('linearPnlUsd: four side/state combinations', () => {
  test('LONG open: marked against mark price, loss when mark < entry', () => {
    // Kraken UI showed -0.68 USD at mark 77,588
    near(linearPnlUsd({ ...XBT_LONG, price: 77588 }), -0.679, 1e-3);
  });

  test('LONG open: gain when mark > entry', () => {
    // Kraken UI showed +2.75 USD at mark 77,765
    near(linearPnlUsd({ ...XBT_LONG, price: 77765 }), 2.7548, 1e-3);
  });

  test('LONG closed: size × (exit − entry)', () => {
    near(linearPnlUsd({ side: 'LONG', size: 0.5, entryPrice: 2000, price: 2100 }), 50);
    near(linearPnlUsd({ side: 'LONG', size: 0.5, entryPrice: 2000, price: 1900 }), -50);
  });

  test('SHORT open: gain when mark < entry', () => {
    near(linearPnlUsd({ side: 'SHORT', size: 0.298, entryPrice: 2500, price: 2400 }), 29.8);
    near(linearPnlUsd({ side: 'SHORT', size: 0.298, entryPrice: 2500, price: 2600 }), -29.8);
  });

  test('SHORT closed: size × (entry − exit)', () => {
    near(linearPnlUsd({ side: 'SHORT', size: 550, entryPrice: 0.25, price: 0.2 }), 27.5);
    near(linearPnlUsd({ side: 'SHORT', size: 550, entryPrice: 0.25, price: 0.3 }), -27.5);
  });

  test('LONG and SHORT are exact mirrors', () => {
    const long = linearPnlUsd({ side: 'LONG', size: 1.5, entryPrice: 100, price: 93.7 });
    const short = linearPnlUsd({ side: 'SHORT', size: 1.5, entryPrice: 100, price: 93.7 });
    near(long, -(short as number));
  });
});

describe('regression: a missing price is never treated as 0', () => {
  for (const price of [0, null, undefined, NaN, -1, Infinity]) {
    test(`price=${String(price)} returns null, not -notional`, () => {
      assert.equal(linearPnlUsd({ ...XBT_LONG, price }), null);
    });
  }

  test('unknown side returns null instead of defaulting to a direction', () => {
    assert.equal(linearPnlUsd({ side: null, size: 1, entryPrice: 100, price: 110 }), null);
    assert.equal(linearPnlUsd({ side: undefined, size: 1, entryPrice: 100, price: 110 }), null);
  });

  test('bad size / entry returns null', () => {
    assert.equal(linearPnlUsd({ side: 'LONG', size: 0, entryPrice: 100, price: 110 }), null);
    assert.equal(linearPnlUsd({ side: 'LONG', size: 1, entryPrice: undefined, price: 110 }), null);
  });
});

describe('parseFuturesSide', () => {
  test('accepts Kraken lowercase and app uppercase', () => {
    assert.equal(parseFuturesSide('long'), 'LONG');
    assert.equal(parseFuturesSide('short'), 'SHORT');
    assert.equal(parseFuturesSide('LONG'), 'LONG');
    assert.equal(parseFuturesSide(' Short '), 'SHORT');
  });
  test('never defaults', () => {
    for (const bad of [undefined, null, '', 'buy', 'sell', 1]) {
      assert.equal(parseFuturesSide(bad), null);
    }
  });
});

describe('krakenPerpSymbol', () => {
  test('XBT (what the sync stores) and BTC both resolve to PF_XBTUSD', () => {
    assert.equal(krakenPerpSymbol('XBT'), 'PF_XBTUSD');
    assert.equal(krakenPerpSymbol('BTC'), 'PF_XBTUSD');
    assert.equal(krakenPerpSymbol('xbt-perp'), 'PF_XBTUSD');
  });
  test('existing assets are unchanged', () => {
    assert.equal(krakenPerpSymbol('ETH'), 'PF_ETHUSD');
    assert.equal(krakenPerpSymbol('ADA'), 'PF_ADAUSD');
    assert.equal(krakenPerpSymbol('ETH/USD Perp'), 'PF_ETHUSD');
  });
  test('rejects junk', () => {
    assert.equal(krakenPerpSymbol(''), null);
    assert.equal(krakenPerpSymbol(null), null);
    assert.equal(krakenPerpSymbol('../etc'), null);
  });
});

describe('return on margin (Kraken "Return on Equity")', () => {
  test('initial margin = entry notional / leverage (Kraken showed 301.17 USD)', () => {
    near(initialMarginUsd({ ...XBT_LONG, leverage: 5 }), 301.177, 1e-2);
  });

  test('denominator is margin, not notional (Kraken showed +0.91%)', () => {
    const pnlUsd = linearPnlUsd({ ...XBT_LONG, price: 77765 });
    near(returnOnMargin({ pnlUsd, ...XBT_LONG, leverage: 5 }), 0.00915, 1e-4);
  });

  test('matches Kraken at the loss reading too (-0.23%)', () => {
    const pnlUsd = linearPnlUsd({ ...XBT_LONG, price: 77588 });
    near(returnOnMargin({ pnlUsd, ...XBT_LONG, leverage: 5 }), -0.00225, 1e-4);
  });

  test('at 5x a 1% price move is a 5% return, for both sides', () => {
    const long = linearPnlUsd({ side: 'LONG', size: 2, entryPrice: 100, price: 101 });
    near(returnOnMargin({ pnlUsd: long, size: 2, entryPrice: 100, leverage: 5 }), 0.05);
    const short = linearPnlUsd({ side: 'SHORT', size: 2, entryPrice: 100, price: 101 });
    near(returnOnMargin({ pnlUsd: short, size: 2, entryPrice: 100, leverage: 5 }), -0.05);
  });

  test('unknown leverage or PnL yields null, never a guess', () => {
    assert.equal(returnOnMargin({ pnlUsd: 1, ...XBT_LONG, leverage: undefined }), null);
    assert.equal(returnOnMargin({ pnlUsd: 1, ...XBT_LONG, leverage: 0 }), null);
    assert.equal(returnOnMargin({ pnlUsd: null, ...XBT_LONG, leverage: 5 }), null);
  });
});

describe('usdToEur', () => {
  test('converts with the stored EUR-per-USD rate', () => {
    near(usdToEur(-0.679, 0.871), -0.591409);
  });
  test('null in, null out; bad rate is null', () => {
    assert.equal(usdToEur(null, 0.87), null);
    assert.equal(usdToEur(10, 0), null);
    assert.equal(usdToEur(10, undefined), null);
  });
});
