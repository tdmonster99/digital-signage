import assert from 'node:assert/strict';
import monitor from '../api/screen-monitor.js';

const { buildOfflineIncident } = monitor._test || {};

function incidentFor(screen) {
  return buildOfflineIncident(screen, 'screen_1', '2026-06-27T16:10:42.000Z');
}

assert.equal(typeof buildOfflineIncident, 'function', 'screen-monitor exposes testable diagnostic helpers');

{
  const incident = incidentFor({
    lastSeen: '2026-06-27T15:58:11.000Z',
    lastHeartbeat: {
      at: '2026-06-27T15:58:11.000Z',
      reason: 'asset_error',
      browserOnline: true,
      visibilityState: 'visible',
      offlineCacheMode: false,
      diagnosticTimeline: [
        { at: '2026-06-27T15:58:05.000Z', eventType: 'asset_error', source: 'resource', target: 'VIDEO', url: 'https://app.zigns.io/display.html', browserOnline: true },
        { at: '2026-06-27T15:58:11.000Z', eventType: 'asset_error', source: 'resource', target: 'VIDEO', url: 'https://app.zigns.io/display.html', browserOnline: true },
      ],
    },
  });

  assert.equal(incident.probableCause, 'abrupt_session_or_network_interruption');
  assert.equal(incident.finalEventReceived, false);
  assert.match(incident.summary, /asset errors were recorded/i);
}

{
  const incident = incidentFor({
    lastSeen: '2026-06-27T15:58:11.000Z',
    lastHeartbeat: {
      at: '2026-06-27T15:58:11.000Z',
      reason: 'network_probe_failed',
      browserOnline: true,
      networkProbe: {
        ok: false,
        status: 200,
        looksCaptive: true,
        message: 'Probe returned unexpected content',
        checkedAt: '2026-06-27T15:58:10.000Z',
      },
      diagnosticTimeline: [
        {
          at: '2026-06-27T15:58:10.000Z',
          eventType: 'network_probe_failed',
          source: 'connectivity_probe',
          reason: 'unexpected_probe_response',
          message: 'Probe returned unexpected content',
          browserOnline: true,
          networkProbe: { ok: false, looksCaptive: true, status: 200 },
        },
      ],
    },
  });

  assert.equal(incident.probableCause, 'network_probe_captive_or_blocked');
  assert.equal(incident.finalEventReceived, true);
  assert.match(incident.summary, /captive portal|blocked/i);
}

console.log('offline diagnostics tests passed');
