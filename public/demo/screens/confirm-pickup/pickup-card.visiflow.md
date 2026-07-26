---
visiflow: 2
kind: component
id: pickup-card
screenId: confirm-pickup
name: Pickup confirmation
type: Trip setup
tags: [pickup, location]
defaultState: active
visual:
  kind: container
  x: 20
  y: 170
  width: 350
  height: 180
  background: "#ffffff"
  color: "#202634"
  borderColor: "#d9deea"
  borderRadius: 18
  text: "Confirm pickup\n12 Market Street"
calls:
  - id: geocode-pickup
    name: Validate pickup address
    direction: outgoing
    peer: { kind: system, id: ride-marketplace }
    protocol: GraphQL
    method: POST
    endpoint: /graphql
    description: Resolves the rider-selected pickup address before dispatch.
    cadence: { kind: user-event, label: On pickup confirmation }
  - id: pickup-map-preview
    name: Load pickup map preview
    direction: outgoing
    peer: { kind: system, id: content-delivery }
    protocol: HTTP/2
    method: GET
    endpoint: /maps/pickup/preview
    description: Fetches the map preview surrounding the pickup point.
    cadence: { kind: lifecycle, label: When pickup confirmation opens }
---

## Pickup confirmation

Lets the rider validate the collection point before a driver is requested.
