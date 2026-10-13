// Herstelronde 1, bevinding 2: op http://<lan-ip> (geen secure context) ontbreekt crypto.randomUUID. De
// sync-module maakt opdracht-ID's dan met crypto.getRandomValues, nooit met Math.random.
import { webcrypto } from 'node:crypto';
import { uuidV4 } from '../../sync/thuisplanner-sync.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

it('zonder randomUUID: geldige v4-UUID uit getRandomValues, uniek, zonder Math.random', () => {
  const zonderSecureContext = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  const random = vi.spyOn(Math, 'random');
  const ids = Array.from({ length: 2000 }, () => uuidV4(zonderSecureContext as unknown as Crypto));
  expect(ids.every(id => V4.test(id))).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
  expect(random).not.toHaveBeenCalled();
  random.mockRestore();
});

it('met randomUUID (secure context): die wordt gebruikt', () => {
  expect(uuidV4({ randomUUID: () => 'x', getRandomValues: () => { throw new Error('niet nodig'); } } as unknown as Crypto)).toBe('x');
});

it('zonder enige cryptografische willekeur: een duidelijke fout, geen zwakke ID', () => {
  expect(() => uuidV4({} as Crypto)).toThrow(/getRandomValues/);
});
