---
visiflow: 2
kind: component
id: safety-card
screenId: safety-center
name: Safety help card
type: Safety action
tags: [safety, support]
defaultState: active
visual:
  kind: container
  x: 20
  y: 205
  width: 350
  height: 220
  background: "#fff5f5"
  color: "#57232a"
  borderColor: "#f0b8bc"
  borderRadius: 18
  text: "Safety toolkit\nGet help or share trip status"
calls:
  - id: create-safety-report
    name: Create safety report
    direction: outgoing
    peer: { kind: system, id: safety-service }
    protocol: HTTPS
    method: POST
    endpoint: /v1/safety/cases
    description: Creates a rider safety case with the current trip context.
    cadence: { kind: user-event, label: On request help }
  - id: share-trip-status
    name: Share trip status
    direction: outgoing
    peer: { kind: system, id: notification-hub }
    protocol: HTTPS
    method: POST
    endpoint: /v1/trips/share
    description: Sends a secure live-trip link to the rider's chosen contact.
    cadence: { kind: user-event, label: On share trip }
---

## Safety center

Provides fast safety actions and a secure way to share live trip progress.
