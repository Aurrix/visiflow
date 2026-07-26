---
visiflow: 2
kind: component
id: driver-card
screenId: driver-arrival
name: Driver arrival card
type: Driver tracking
tags: [driver, arrival]
defaultState: active
visual:
  kind: container
  x: 20
  y: 480
  width: 350
  height: 170
  background: "#1d2534"
  color: "#ffffff"
  borderColor: "#3d4a62"
  borderRadius: 18
  text: "Avery is arriving\nSilver hatchback · 3 min"
calls:
  - id: driver-arrival-channel
    name: Subscribe to arrival updates
    direction: outgoing
    peer: { kind: system, id: notification-hub }
    protocol: WebSocket
    method: SUBSCRIBE
    endpoint: /v2/drivers/arrival
    description: Subscribes to the assigned driver's live arrival events.
    cadence: { kind: lifecycle, label: When driver arrival opens }
  - id: driver-contact-token
    name: Create masked contact token
    direction: outgoing
    peer: { kind: system, id: identity-service }
    protocol: HTTPS
    method: POST
    endpoint: /v1/contact-tokens
    description: Creates a time-limited masked contact route for rider and driver.
    cadence: { kind: user-event, label: On contact driver }
---

## Driver arrival

Shows the assigned driver and subscribes to the final approach updates.
