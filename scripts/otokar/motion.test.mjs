import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTrapezoidalProfile, createCoordinatedMove } from '../../client/src/components/otokarMotion.js';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
test('long Z travel uses the supplied acceleration, cruise and deceleration', () => {
  const p = computeTrapezoidalProfile(16000, 275, 500, 275);
  near(p.tAccel, 500 / 275);
  near(p.tCruise, (16000 - 500 * 500 / 275) / 500);
  near(p.velocityAt(p.tAccel + 1), 500);
  near(p.positionAt(p.duration), 16000);
  near(p.velocityAt(p.duration), 0);
});
test('short negative move is triangular and handles asymmetric rates', () => {
  const p = computeTrapezoidalProfile(-100, 100, 250, 50);
  near(p.tCruise, 0);
  near(p.peakSpeed, Math.sqrt(200 / (1 / 100 + 1 / 50)));
  let previous = 0;
  for (let t = 0; t < p.duration; t += 0.001) {
    const position = p.positionAt(t);
    assert.ok(position <= previous + 1e-8 && position >= -100);
    assert.ok(Math.abs(p.velocityAt(t)) <= p.peakSpeed + 1e-8);
    previous = position;
  }
  near(p.positionAt(p.duration + 10), -100);
});
test('profile is continuous across phase boundaries and handles zero distance', () => {
  for (const d of [0, 1, 1000, 16000]) {
    const p = computeTrapezoidalProfile(d, 275, 500, 175);
    for (const boundary of [p.tAccel, p.tAccel + p.tCruise, p.duration]) {
      near(p.positionAt(boundary - 1e-8), p.positionAt(boundary + 1e-8), 1e-4);
      near(p.velocityAt(boundary - 1e-8), p.velocityAt(boundary + 1e-8), 1e-4);
    }
    near(p.positionAt(p.duration), d);
  }
});
test('coordinated axes reach their targets without exceeding table rates', () => {
  const spec = { accel: 100, speed: 150, maxSpeed: 250, decel: 100 };
  const move = createCoordinatedMove([0, 50], [1000, -50], [spec, spec]);
  const result = [];
  move.sample(move.duration, result);
  near(result[0], 1000); near(result[1], -50);
  const previous = [0, 50];
  for (let t = 0.01; t < move.duration; t += 0.01) {
    move.sample(t, result);
    result.forEach((value, i) => assert.ok(Math.abs(value - previous[i]) / 0.01 <= 150.00001));
    previous.splice(0, 2, ...result);
  }
});
