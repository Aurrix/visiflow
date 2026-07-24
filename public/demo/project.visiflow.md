---
visiflow: 2
kind: project
app:
  id: orbit-demo
  name: Orbit Demo
  platform: iOS and Android
  device: ios
  initialScreenId: login
  accent: "#7c8cff"
screens:
  - id: login
    name: Login
    group: Customer journey
    order: 1
    width: 390
    height: 844
    background: "#f5f5f5"
    showSystemUi: false
  - id: offers
    name: Offers
    parentId: login
    order: 1
    width: 390
    height: 844
    background: "#f5f5f5"
    showSystemUi: false
tasks:
  - id: session-maintenance
    name: Maintain application session
    type: Session worker
    description: Refreshes the customer session independently of the visible screen.
    scope:
      kind: app
    trigger:
      kind: recurring
      label: Every 15 minutes
      intervalMs: 900000
    defaultState: active
  - id: analytics-delivery
    name: Deliver analytics batch
    type: Event worker
    description: Publishes privacy-filtered application events in app-wide batches.
    scope:
      kind: app
    trigger:
      kind: recurring
      label: Every 5 minutes
      intervalMs: 300000
    defaultState: active
  - id: realtime-notifications
    name: Receive live notifications
    type: Push listener
    description: Maintains the app-wide channel used for secure notification delivery.
    scope:
      kind: app
    trigger:
      kind: push
      label: On secure message
    defaultState: active
  - id: device-trust
    name: Verify device trust
    type: Security worker
    description: Evaluates device posture while the login screen is active.
    scope:
      kind: screen
      screenId: login
    trigger:
      kind: lifecycle
      label: When the login screen opens
    defaultState: active
  - id: refresh-offers
    name: Refresh available offers
    type: Data refresh
    description: Loads current coupon eligibility when the offers screen becomes visible.
    scope:
      kind: screen
      screenId: offers
    trigger:
      kind: lifecycle
      label: When the offers screen opens
    defaultState: active
  - id: prefetch-offer-assets
    name: Prefetch offer artwork
    type: Content worker
    description: Warms localized offer artwork before the next campaign refresh.
    scope:
      kind: screen
      screenId: offers
    trigger:
      kind: scheduled
      label: Every 6 hours
      intervalMs: 21600000
    defaultState: active
systems:
  - id: identity-service
    name: Customer Identity
    type: OIDC service
    description: Authenticates customers and issues application sessions.
    color: "#7c8cff"
    icon: ID
    placement: right
  - id: offers-service
    name: Offers Platform
    type: GraphQL API
    description: Supplies available coupons and personalized offers.
    color: "#55d99d"
    icon: "%"
    placement: right
  - id: risk-engine
    name: Device Risk Engine
    type: gRPC service
    description: Evaluates device integrity and account risk signals.
    color: "#ff9f68"
    icon: RX
    placement: left
  - id: event-stream
    name: Analytics Stream
    type: Kafka cluster
    description: Receives batched product and reliability events.
    color: "#e3b85c"
    icon: K
    placement: left
  - id: notification-hub
    name: Notification Hub
    type: Realtime gateway
    description: Delivers secure account and offer notifications.
    color: "#5dc9e8"
    icon: WS
    placement: right
  - id: content-delivery
    name: Campaign CDN
    type: Edge cache
    description: Serves localized artwork and campaign media.
    color: "#c68cff"
    icon: CDN
    placement: left
scenarios:
  - id: normal
    name: Normal operation
    screenId: login
    componentStates: {}
    taskStates: {}
  - id: signed-out
    name: Signed out
    screenId: login
    componentStates:
      login-card: active
    taskStates:
      session-maintenance: inactive
      realtime-notifications: inactive
  - id: offers-degraded
    name: Offers degraded
    screenId: offers
    componentStates:
      coupons-card: inactive
    taskStates:
      refresh-offers: inactive
      prefetch-offer-assets: inactive
initialScenarioId: normal
componentFiles:
  - screens/login/login-card.visiflow.md
  - screens/offers/coupons-card.visiflow.md
connections:
  - id: refresh-session
    name: Refresh application session
    source: { kind: task, id: session-maintenance }
    target: { kind: system, id: identity-service }
    protocol: HTTPS
    method: POST
    endpoint: /oauth/refresh
    description: Exchanges the refresh token for a renewed application session.
  - id: fetch-offers
    name: Fetch available offers
    source: { kind: task, id: refresh-offers }
    target: { kind: system, id: offers-service }
    protocol: GraphQL
    method: POST
    endpoint: /graphql
    description: Queries current coupon eligibility and personalized offers.
  - id: evaluate-device
    name: Evaluate device posture
    source: { kind: task, id: device-trust }
    target: { kind: system, id: risk-engine }
    protocol: gRPC
    method: Check
    endpoint: risk.v1.DeviceTrust/Evaluate
    description: Sends attestation evidence to the device risk engine.
  - id: publish-analytics
    name: Publish analytics batch
    source: { kind: task, id: analytics-delivery }
    target: { kind: system, id: event-stream }
    protocol: Kafka
    method: PRODUCE
    endpoint: app.events.v2
    description: Publishes a privacy-filtered event batch.
  - id: receive-notification
    name: Receive live notification
    source: { kind: system, id: notification-hub }
    target: { kind: task, id: realtime-notifications }
    protocol: WebSocket
    method: MESSAGE
    endpoint: /v2/notifications
    description: Delivers encrypted application notifications.
  - id: prefetch-campaign-media
    name: Prefetch campaign media
    source: { kind: task, id: prefetch-offer-assets }
    target: { kind: system, id: content-delivery }
    protocol: HTTP/2
    method: GET
    endpoint: /campaigns/current/assets
    description: Warms the current campaign artwork in the application cache.
---

# Orbit request map

This external Markdown project demonstrates **component-owned calls**, app-wide and screen-scoped background tasks, Internal, HTTPS, GraphQL, gRPC, Kafka, WebSocket, and HTTP/2 paths, relative image assets, multiple screens, and rendered documentation without embedding configuration in the application HTML.
