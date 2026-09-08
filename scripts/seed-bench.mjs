#!/usr/bin/env node
/*
 * Put fake clients on the test bench, so the tables that only have rows when
 * something is connected actually have rows to look at.
 *
 *   node scripts/seed-bench.mjs            # 8 devices
 *   node scripts/seed-bench.mjs 20         # 20 of them
 *   node scripts/seed-bench.mjs --clear    # back to an empty bench
 *
 * Everything is written inside the container and nowhere else — the lease file
 * lives in its own /tmp. The host's network is never touched.
 *
 * What this fills:
 *   Dashboard      the LAN "Devices" panel (it tags rows .cbi-rowstyle-1/-2
 *                  itself, so the zebra striping shows up there)
 *   Status         DHCP leases on Overview
 *   Network > DHCP the lease list
 *
 * One file is enough for all three: luci-rpc's getHostHints reads the leases
 * too, so the MAC/IP hints come along without a separate ARP table. Seeding the
 * neighbour table directly is not an option anyway — the image's `ip` is
 * busybox, whose `neigh` does show and flush but not add, and there is no `arp`
 * binary at all.
 *
 * What this cannot fill: the wireless association list. That needs a radio, and
 * the container has none — mac80211_hwsim is a kernel module, not something a
 * container can conjure.
 */
import { execFileSync } from 'node:child_process';
import { CONTAINER } from './lib/bench.mjs';

const LEASES = '/tmp/dhcp.leases';

const argv = process.argv.slice(2);
const clear = argv.includes('--clear');
const count = Number(argv.find((a) => /^\d+$/.test(a)) ?? 8);

/* Run a command inside the container. */
const sh = (script) => {
	try {
		return execFileSync('docker', ['exec', CONTAINER, 'sh', '-c', script],
			{ encoding: 'utf8' });
	} catch (e) {
		console.error(`\nthe container "${CONTAINER}" did not take the command.\n` +
			'Is the bench up? `npm run bench`');
		process.exit(1);
	}
};

/*
 * Names and vendor MAC prefixes picked to exercise the layout rather than to be
 * realistic: a long hostname next to a short one, and a couple with none at all
 * (dnsmasq writes "*", and LuCI renders those as "?") — that is the row that
 * used to break the alignment.
 */
const DEVICES = [
	['nas-livingroom', 'b8:27:eb'],
	['pixel-8', 'f0:18:98'],
	['macbook-pro-14-work', '3c:22:fb'],
	['*', '00:1a:2b'],
	['esp32-sensor-balcony', '24:6f:28'],
	['hue-bridge', 'ec:b5:fa'],
	['printer', '00:80:77'],
	['*', 'dc:a6:32'],
	['appletv-bedroom', 'a8:5c:2c'],
	['switch-8port-office', '54:af:97'],
	['thinkpad-x1-carbon-gen11', '98:5f:d3'],
	['roborock-s8', '78:11:dc'],
];

if (clear) {
	sh(`: > ${LEASES}`);
	console.log(`cleared ${LEASES} in ${CONTAINER}`);
	console.log('reload the page to see it empty again');
	process.exit(0);
}

if (!count || count < 1) {
	console.error('usage: node scripts/seed-bench.mjs [count] [--clear]');
	process.exit(1);
}

/* dnsmasq's lease file: <expiry epoch> <mac> <ip> <hostname> <clientid>,
   "*" standing in for a hostname or client id it never learned. */
const now = Math.floor(Date.now() / 1000);
const rows = [];
for (let i = 0; i < count; i++) {
	const [name, prefix] = DEVICES[i % DEVICES.length];
	/* keep the MAC unique once the list wraps */
	const tail = [(i + 0x11).toString(16).padStart(2, '0'),
	              (i * 7 + 0x2a).toString(16).padStart(2, '0'),
	              (i * 13 + 0x5c).toString(16).padStart(2, '0')].join(':');
	const mac = `${prefix}:${tail}`;
	const ip = `192.168.1.${100 + i}`;
	const host = i >= DEVICES.length && name !== '*' ? `${name}-${i}` : name;
	const expiry = now + 43200 - i * 137;          // staggered, ~12h out
	rows.push({ mac, ip, host, expiry });
}

const leaseFile = rows.map((r) => `${r.expiry} ${r.mac} ${r.ip} ${r.host} *`).join('\n');

/* The heredoc keeps it to one exec, and quoting the delimiter stops the shell
   expanding the "*" that stands for a missing hostname. */
sh(`cat > ${LEASES} <<'EOF'\n${leaseFile}\nEOF`);

const leases = sh(`ubus call luci-rpc getDHCPLeases | grep -c '"macaddr"' || true`).trim();
const hints = sh(`ubus call luci-rpc getHostHints | grep -c 'ipaddrs' || true`).trim();

console.log(`seeded ${CONTAINER}:`);
console.log(`  ${LEASES}   ${rows.length} leases (ubus reports ${leases})`);
console.log(`  host hints        ${hints}`);
console.log(`  subnet            192.168.1.100-${100 + rows.length - 1}`);
console.log('\nreload the Dashboard, Status > Overview, or Network > DHCP.');
console.log('nothing was written outside the container; `--clear` undoes it.');
