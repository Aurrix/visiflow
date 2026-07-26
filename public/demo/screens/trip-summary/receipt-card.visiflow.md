---
visiflow: 2
kind: component
id: receipt-card
screenId: trip-summary
name: Trip receipt
type: Payment summary
tags: [payment, receipt]
defaultState: active
visual:
  kind: container
  x: 20
  y: 190
  width: 350
  height: 240
  background: "#ffffff"
  color: "#202634"
  borderColor: "#d9deea"
  borderRadius: 18
  text: "Trip complete\n€18.40 · Visa ending 4242"
calls:
  - id: load-trip-receipt
    name: Load final receipt
    direction: outgoing
    peer: { kind: system, id: ride-marketplace }
    protocol: GraphQL
    method: POST
    endpoint: /graphql
    description: Loads the final fare, route breakdown, and receipt identifiers.
    cadence: { kind: lifecycle, label: When trip summary opens }
  - id: payment-method-details
    name: Load payment method
    direction: outgoing
    peer: { kind: system, id: payments-service }
    protocol: HTTPS
    method: GET
    endpoint: /v1/payment-methods/default
    description: Retrieves the masked payment method shown on the receipt.
    cadence: { kind: lifecycle, label: When trip summary opens }
---

## Trip summary

Displays the final fare and payment details after the ride has completed.
