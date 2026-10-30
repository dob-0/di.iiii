// S9a: Art-Net broadcast never goes onto a network that carries a LaserCube.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const { broadcastPlan, broadcastAddresses } = createRequire(import.meta.url)('./artnet.js');

const nic = (address, netmask) => [{ family: 'IPv4', internal: false, address, netmask }];
const ifs = {
  wlan0: nic('192.168.4.20', '255.255.255.0'),
  enp0s20u2u4: nic('10.42.1.1', '255.255.255.0'),
  lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1', netmask: '255.0.0.0' }],
};

describe('broadcastPlan', () => {
  it('leaves out the network of a cube and says why', () => {
    const p = broadcastPlan({ interfaces: ifs, cubeIps: ['10.42.1.196'] });
    expect(p.use).toContain('192.168.4.255');
    expect(p.use).not.toContain('10.42.1.255');
    expect(p.excluded).toEqual([{ broadcast: '10.42.1.255', iface: 'enp0s20u2u4', network: '10.42.1.0', reason: 'laser network' }]);
  });
  it('drops 255.255.255.255 while another network is left', () => {
    expect(broadcastPlan({ interfaces: ifs, cubeIps: ['10.42.1.196'] }).use).not.toContain('255.255.255.255');
  });
  it('keeps 255.255.255.255 when no interface is left', () => {
    const only = { enp0s20u2u4: ifs.enp0s20u2u4 };
    const p = broadcastPlan({ interfaces: only, cubeIps: ['10.42.1.196'] });
    expect(p.use).toEqual(['255.255.255.255']);
    expect(p.excluded).toHaveLength(1);
  });
  it('no cubes: every network and the limited broadcast, as before', () => {
    const p = broadcastPlan({ interfaces: ifs, cubeIps: [] });
    expect(p.use).toEqual(['192.168.4.255', '10.42.1.255', '255.255.255.255']);
    expect(p.excluded).toEqual([]);
    expect(broadcastAddresses({ interfaces: ifs })).toEqual(p.use);
  });
  it('a cube on no local network excludes nothing', () => {
    const p = broadcastPlan({ interfaces: ifs, cubeIps: ['172.16.0.9'] });
    expect(p.excluded).toEqual([]);
    expect(p.use).toContain('255.255.255.255');
  });
  it('broadcastAll restores every network', () => {
    const p = broadcastPlan({ interfaces: ifs, cubeIps: ['10.42.1.196'], all: true });
    expect(p.use).toEqual(['192.168.4.255', '10.42.1.255', '255.255.255.255']);
    expect(p.excluded).toEqual([]);
  });
  it('uses the interface mask: a /16 holds the cube, a /24 beside it does not', () => {
    const wide = { a: nic('10.42.1.1', '255.255.0.0') };
    expect(broadcastPlan({ interfaces: wide, cubeIps: ['10.42.9.9'] }).excluded[0].broadcast).toBe('10.42.255.255');
    const narrow = { a: nic('10.42.1.1', '255.255.255.0'), b: nic('192.168.1.5', '255.255.255.0') };
    const p = broadcastPlan({ interfaces: narrow, cubeIps: ['10.42.9.9'] });
    expect(p.excluded).toEqual([]);
    expect(p.use).toContain('10.42.1.255');
  });
  it('ignores junk cube addresses', () => {
    expect(broadcastPlan({ interfaces: ifs, cubeIps: ['', 'cube', null, 7] }).excluded).toEqual([]);
  });
});
