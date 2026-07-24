---
visiflow: 2
kind: component
id: login-card
screenId: login
name: Login card
type: Authentication
tags:
  - login
  - identity
defaultState: active
visual:
  kind: image
  x: 0
  y: 0
  width: 390
  height: 844
  src: assets/components/login-card.png
  imageFit: contain
  imagePosition: center
  background: "#ffffff"
calls:
  - id: authenticate-user
    name: Authenticate user
    direction: outgoing
    peer:
      kind: system
      id: identity-service
    protocol: HTTPS
    method: POST
    endpoint: /oauth/token
    description: Exchanges the submitted credentials for an application session.
    cadence:
      kind: user-event
      label: On login submit
  - id: start-device-trust
    name: Start device trust check
    direction: outgoing
    peer:
      kind: task
      id: device-trust
    protocol: Internal
    description: Signals the login-scoped device trust worker.
---

## Login and session establishment

Collects customer credentials and starts the authentication flow. The component remains interactive while its request metadata is rendered in the component catalog and request map.
