---
visiflow: 2
kind: component
id: coupons-card
screenId: offers
name: Coupons card
type: Loyalty
tags:
  - offers
  - coupons
defaultState: active
visual:
  kind: image
  x: 3
  y: 190
  width: 385
  height: 187
  src: assets/components/coupons.png
  imageFit: contain
calls:
  - id: start-offers-refresh
    name: Start offers refresh
    direction: outgoing
    peer:
      kind: task
      id: refresh-offers
    protocol: Internal
    description: Signals the screen-scoped offer refresh task.
  - id: start-asset-prefetch
    name: Start offer artwork prefetch
    direction: outgoing
    peer:
      kind: task
      id: prefetch-offer-assets
    protocol: Internal
    description: Signals the screen-scoped campaign media worker.
---

## Available offers

Shows coupons returned by the loyalty platform and documents when their availability is refreshed.
