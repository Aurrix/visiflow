---
visiflow: 2
kind: project
app:
  id: ride-demo
  name: Ride demo
  platform: iOS and Android
  device: ios
  initialScreenId: choose-ride
  accent: "#7c8cff"
screens:
  - id: choose-ride
    name: Choose ride
    group: Rider journey
    order: 1
    width: 390
    height: 844
    background: "#f5f5f5"
    showSystemUi: false
  - id: trip-progress
    name: Trip progress
    parentId: choose-ride
    order: 1
    width: 390
    height: 844
    background: "#f5f5f5"
    showSystemUi: false
tasks:
  - id: rider-session
    name: Maintain rider session
    type: Session worker
    description: Refreshes the rider session independently of the visible screen.
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
  - id: trip-status
    name: Receive trip status
    type: Realtime listener
    description: Maintains the channel for driver and trip-status updates.
    scope:
      kind: app
    trigger:
      kind: push
      label: On secure message
    defaultState: active
  - id: fare-estimate
    name: Estimate trip fares
    type: Pricing worker
    description: Preloads live fare estimates when ride choices open.
    scope:
      kind: screen
      screenId: choose-ride
    trigger:
      kind: lifecycle
      label: When ride choices open
    defaultState: active
  - id: refresh-routes
    name: Refresh route options
    type: Data refresh
    description: Loads current route and ETA options when trip progress opens.
    scope:
      kind: screen
      screenId: trip-progress
    trigger:
      kind: lifecycle
      label: When trip progress opens
    defaultState: active
  - id: prefetch-map-tiles
    name: Prefetch map tiles
    type: Map worker
    description: Warms nearby map tiles before the route refresh.
    scope:
      kind: screen
      screenId: trip-progress
    trigger:
      kind: scheduled
      label: Every 6 hours
      intervalMs: 21600000
    defaultState: active
systems:
  - id: identity-service
    name: Rider Identity
    type: OIDC service
    description: Authenticates riders and issues application sessions.
    color: "#7c8cff"
    icon: ID
    placement: right
  - id: ride-marketplace
    name: Ride Marketplace
    type: GraphQL API
    description: Supplies available vehicles, fares, and route options.
    color: "#55d99d"
    icon: "%"
    placement: right
  - id: risk-engine
    name: Driver matching engine
    type: gRPC service
    description: Matches nearby drivers and evaluates live trip availability.
    color: "#ff9f68"
    icon: RX
    placement: left
  - id: event-stream
    name: Trip analytics stream
    type: Kafka cluster
    description: Receives privacy-filtered trip and rider events.
    color: "#e3b85c"
    icon: K
    placement: left
  - id: notification-hub
    name: Driver update hub
    type: Realtime gateway
    description: Delivers driver arrival and trip-status notifications.
    color: "#5dc9e8"
    icon: WS
    placement: right
  - id: content-delivery
    name: Map tile CDN
    type: Edge cache
    description: Serves map, route, and vehicle imagery.
    color: "#c68cff"
    icon: CDN
    placement: left
scenarios:
  - id: normal
    name: Normal operation
    screenId: choose-ride
    componentStates: {}
    taskStates: {}
  - id: rider-ready
    name: Rider ready
    screenId: choose-ride
    componentStates:
      ride-card: active
    taskStates:
      rider-session: inactive
      trip-status: inactive
  - id: route-delayed
    name: Route delayed
    screenId: trip-progress
    componentStates:
      route-card: inactive
    taskStates:
      refresh-routes: inactive
      prefetch-map-tiles: inactive
initialScenarioId: normal
componentFiles:
  - screens/login/login-card.visiflow.md
  - screens/offers/coupons-card.visiflow.md
  - screens/offers/new-component.visiflow.md
connections:
  - id: refresh-rider-session
    name: Refresh rider session
    source:
      kind: task
      id: rider-session
    target:
      kind: system
      id: identity-service
    protocol: HTTPS
    method: POST
    endpoint: /oauth/refresh
    description: Exchanges the rider refresh token for a renewed application session.
  - id: fetch-ride-options
    name: Fetch ride options
    source:
      kind: task
      id: refresh-routes
    target:
      kind: system
      id: ride-marketplace
    protocol: GraphQL
    method: POST
    endpoint: /graphql
    description: Queries available vehicles, fares, and trip ETAs.
  - id: match-driver
    name: Match nearby driver
    source:
      kind: task
      id: fare-estimate
    target:
      kind: system
      id: risk-engine
    protocol: gRPC
    method: Check
    endpoint: matching.v1.Driver/Find
    description: Requests nearby drivers and current trip availability.
  - id: publish-analytics
    name: Publish trip analytics batch
    source:
      kind: task
      id: analytics-delivery
    target:
      kind: system
      id: event-stream
    protocol: Kafka
    method: PRODUCE
    endpoint: trips.events.v1
    description: Publishes a privacy-filtered trip event batch.
  - id: receive-trip-update
    name: Receive trip update
    source:
      kind: system
      id: notification-hub
    target:
      kind: task
      id: trip-status
    protocol: WebSocket
    method: MESSAGE
    endpoint: /v2/trips/updates
    description: Delivers encrypted driver and trip updates.
  - id: prefetch-map-tiles
    name: Prefetch map tiles
    source:
      kind: task
      id: prefetch-map-tiles
    target:
      kind: system
      id: content-delivery
    protocol: HTTP/2
    method: GET
    endpoint: /maps/nearby/tiles
    description: Warms nearby map tiles in the application cache.
textureLayers:
  - id: uber-overview
    name: Uber overview
    src: assets/uber_overview.png
    x: 29
    y: 32
    width: 996
    height: 656
    order: 0
---

# Ride request map

This ride-hailing sample models **ride selection**, driver matching, route updates, trip analytics, map assets, and component-owned calls without embedding configuration in the application HTML.
