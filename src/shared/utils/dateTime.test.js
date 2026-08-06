import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatEasyPrintDateTime,
  getEasyPrintTimestamp,
  parseEasyPrintDateTime,
} from './dateTime.js';

test('interpreta o LocalDateTime sem fuso retornado pela API como UTC', () => {
  assert.equal(
    getEasyPrintTimestamp('2026-08-06T01:19:00'),
    Date.parse('2026-08-06T01:19:00Z'),
  );
  assert.equal(parseEasyPrintDateTime('valor-invalido'), null);
});

test('exibe o horario da API no fuso de Sao Paulo', () => {
  assert.equal(formatEasyPrintDateTime('2026-08-06T01:19:00'), '05/08, 22:19');
  assert.equal(formatEasyPrintDateTime('2026-08-06T01:19:00-03:00'), '06/08, 01:19');
});
