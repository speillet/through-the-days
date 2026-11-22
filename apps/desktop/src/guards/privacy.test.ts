// Guard: private content stays on this Mac (product-guardrails: Private defaults).
// The interface has no network code or remote assets, the native window may only
// talk to its own IPC bridge, and no capability grants filesystem, HTTP or shell access.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROOT, SRC_ROOT, displayPath, firstPartySources, listFiles, read, withoutComments } from './sources';

const TAURI_ROOT = join(APP_ROOT, 'src-tauri');

const NETWORK_APIS = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection)\b/;
const REMOTE_URL = /\b(?:https?|wss?|ftp):\/\/(?!www\.w3\.org\/)/i;
const NETWORK_PLUGINS = /(?:@tauri-apps\/plugin-|tauri-plugin-)(?:http|fs|shell|websocket|upload)\b/;
const ANALYTICS =
  /^(?:@sentry\/|posthog|mixpanel|@segment\/|@amplitude\/|firebase|@vercel\/analytics|@datadog\/|react-ga|@google-analytics\/)/;
const FORBIDDEN_PERMISSIONS = /^(?:fs|http|shell|websocket|upload):/;

describe('no network access from the interface', () => {
  it('has no network APIs, network plugins or remote URLs in first-party source', () => {
    const problems: string[] = [];
    for (const path of firstPartySources()) {
      for (const segment of withoutComments(read(path))) {
        const found =
          segment.text.match(NETWORK_APIS)?.[0] ??
          segment.text.match(REMOTE_URL)?.[0] ??
          segment.text.match(NETWORK_PLUGINS)?.[0];
        if (found) problems.push(`${displayPath(path)}:${segment.line} uses “${found}”`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('loads no remote fonts, stylesheets, images or scripts', () => {
    const problems: string[] = [];
    const remote = /(?:url\(\s*['"]?|@import\s+['"]|(?:src|href)\s*=\s*['"])\s*(?:[a-z]+:)?\/\//i;
    for (const path of [...listFiles(SRC_ROOT).filter((file) => file.endsWith('.css')), join(APP_ROOT, 'index.html')]) {
      read(path)
        .split('\n')
        .forEach((line, index) => {
          if (remote.test(line)) problems.push(`${displayPath(path)}:${index + 1}`);
        });
    }
    expect(problems).toEqual([]);
  });

  it('depends on no network plugin or analytics package', () => {
    const manifest = JSON.parse(read(join(APP_ROOT, 'package.json'))) as Record<
      string,
      Record<string, string> | undefined
    >;
    const packages = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    expect(packages.filter((name) => NETWORK_PLUGINS.test(name) || ANALYTICS.test(name))).toEqual([]);
    const cargo = read(join(TAURI_ROOT, 'Cargo.toml'));
    expect(cargo.match(new RegExp(NETWORK_PLUGINS.source, 'g')) ?? []).toEqual([]);
  });
});

interface TauriConfig {
  app?: { security?: { csp?: string | Record<string, string | string[]> | null; devCsp?: unknown } };
}

/** Directive name to its sources, from either form Tauri accepts. */
function parseCsp(csp: string | Record<string, string | string[]>): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  if (typeof csp === 'string') {
    for (const part of csp.split(';')) {
      const [name, ...sources] = part.trim().split(/\s+/);
      if (name) directives.set(name, sources);
    }
  } else {
    for (const [name, value] of Object.entries(csp)) {
      directives.set(name, Array.isArray(value) ? value : value.split(/\s+/).filter(Boolean));
    }
  }
  return directives;
}

const LOCAL_SOURCES = new Set([
  "'self'",
  "'none'",
  "'unsafe-inline'",
  'data:',
  'blob:',
  'ipc:',
  'http://ipc.localhost',
  'asset:',
  'http://asset.localhost',
]);

describe('native window security', () => {
  const config = JSON.parse(read(join(TAURI_ROOT, 'tauri.conf.json'))) as TauriConfig;
  const csp = config.app?.security?.csp;

  it('sets a content security policy whose connections go only to the IPC bridge', () => {
    expect(csp, 'tauri.conf.json must set app.security.csp').toBeTruthy();
    const directives = parseCsp(csp as string | Record<string, string | string[]>);
    expect(directives.get('default-src')).toEqual(["'self'"]);
    expect(
      directives.get('connect-src')?.every((source) => source === 'ipc:' || source === 'http://ipc.localhost'),
    ).toBe(true);
    for (const [name, sources] of directives) {
      for (const source of sources) {
        expect(LOCAL_SOURCES.has(source), `${name} allows ${source}`).toBe(true);
      }
    }
  });

  it('grants no filesystem, HTTP or shell permission and no remote page access', () => {
    const problems: string[] = [];
    const directory = join(TAURI_ROOT, 'capabilities');
    for (const name of readdirSync(directory).filter((file) => file.endsWith('.json'))) {
      const capability = JSON.parse(read(join(directory, name))) as {
        permissions?: (string | { identifier: string })[];
        remote?: unknown;
      };
      if (capability.remote) problems.push(`${name} lets remote pages call the app`);
      for (const permission of capability.permissions ?? []) {
        const identifier = typeof permission === 'string' ? permission : permission.identifier;
        if (FORBIDDEN_PERMISSIONS.test(identifier)) problems.push(`${name} grants ${identifier}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
