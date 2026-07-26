import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import { testConfig } from './test-fixture'

const inlinePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8xOAAAAAElFTkSuQmCC'

describe('VisiFlow', () => {
  it('switches between map and catalog and focuses a component', () => {
    render(<App result={{ ok: true, data: testConfig }} />)
    expect(screen.getByLabelText('Application map')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /components/i }))
    expect(screen.getByRole('heading', { name: 'Component catalog' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /show in app/i }))
    expect(screen.getByLabelText('Pay button details')).toBeInTheDocument()
    expect(screen.getByText('/payments')).toBeInTheDocument()
  })

  it('uses inline inventory toolbars instead of the floating sidebar in overview views', () => {
    render(<App result={{ ok: true, data: testConfig }} />)
    fireEvent.click(screen.getByRole('button', { name: /components/i }))
    expect(screen.queryByLabelText('View filters')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search components')).toBeInTheDocument()
    expect(screen.getByLabelText('Scenario')).toBeInTheDocument()
    expect(screen.getByLabelText('Screen')).toBeInTheDocument()
    expect(screen.getByLabelText('Cadence')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Protocol filters' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /systems/i }))
    expect(screen.queryByLabelText('View filters')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search external systems')).toBeInTheDocument()
    expect(screen.getByLabelText('Cadence')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Protocol filters' })).toBeInTheDocument()
  })

  it('keeps collapsed view controls on the left and filters canvas nodes by search', () => {
    const { container } = render(<App result={{ ok: true, data: testConfig }} />)
    const filters = screen.getByLabelText('View filters')
    expect(filters).toHaveClass('collapsed')
    expect(screen.queryByLabelText('Scenario')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand view filters' }))
    expect(filters).toHaveClass('expanded')
    expect(filters).toContainElement(screen.getByLabelText('Scenario'))
    expect(filters).toContainElement(screen.getByRole('navigation', { name: 'Screens' }))
    expect(filters).toContainElement(screen.getByRole('button', { name: 'HTTPS' }))
    expect(filters).toContainElement(screen.getByText('Cadence'))
    expect(container.querySelector('.context-bar')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Selection details')).toContainElement(screen.getByLabelText('Application context'))
    expect(screen.getByRole('heading', { name: 'Select a node' })).toBeInTheDocument()

    const searchInput = screen.getByLabelText('Filter canvas items')
    fireEvent.change(searchInput, { target: { value: 'Payment API' } })
    expect(screen.queryByRole('button', { name: /Pay button, active/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Payment API/i })).toBeInTheDocument()

    fireEvent.change(searchInput, { target: { value: 'Pay button' } })
    expect(screen.getByRole('button', { name: /Pay button, active/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Payment API/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear canvas search' }))
    expect(searchInput).toHaveValue('')
    expect(screen.getByRole('button', { name: /Payment API/i })).toBeInTheDocument()
  })

  it('renders grouped, expandable screen hierarchy and switches nested screens', () => {
    const config = structuredClone(testConfig)
    config.screens[0].group = 'Checkout'
    config.screens.push({ id: 'receipt', name: 'Receipt', parentId: 'home', order: 1, width: 390, height: 844 })
    const { container } = render(<App result={{ ok: true, data: config }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand view filters' }))
    const filters = within(screen.getByLabelText('View filters'))
    expect(filters.getByRole('button', { name: /Checkout/i })).toBeInTheDocument()
    fireEvent.click(filters.getByRole('button', { name: 'Expand Home' }))
    fireEvent.click(filters.getByRole('button', { name: /Receiptreceipt/i }))
    expect(container.querySelector('.screen-caption strong')).toHaveTextContent('Receipt')
  })

  it('combines selected protocol toggles with OR semantics', () => {
    const config = structuredClone(testConfig)
    config.systems.push({ id: 'analytics', name: 'Analytics API', type: 'Service', description: 'Receives events' })
    config.connections.push({
      id: 'analytics-call',
      name: 'Send analytics',
      source: { kind: 'component', id: 'button' },
      target: { kind: 'system', id: 'analytics' },
      protocol: 'GraphQL',
      endpoint: '/events',
      description: 'Sends an event.',
      cadence: { kind: 'user-event', label: 'On click' },
    })
    render(<App result={{ ok: true, data: config }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand view filters' }))
    const filters = within(screen.getByLabelText('View filters'))

    fireEvent.click(filters.getByRole('button', { name: 'HTTPS' }))
    expect(screen.getByRole('button', { name: /Payment API/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Analytics API/i })).not.toBeInTheDocument()

    fireEvent.click(filters.getByRole('button', { name: 'GraphQL' }))
    expect(screen.getByRole('button', { name: /Payment API/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Analytics API/i })).toBeInTheDocument()
  })

  it('renders readable configuration errors', () => {
    render(<App result={{ ok: false, errors: ['screens.0.id: Duplicate id'] }} />)
    expect(screen.getByRole('heading', { name: /could not start/i })).toBeInTheDocument()
    expect(screen.getByText(/screens.0.id/)).toBeInTheDocument()
  })

  it('renders scrollable screens and image layers on any component kind', () => {
    const config = structuredClone(testConfig)
    config.screens[0].contentHeight = 1200
    config.screens[0].backgroundImage = inlinePng
    config.components[0].visual.src = inlinePng
    config.components[0].visual.imageFit = 'contain'
    const { container } = render(<App result={{ ok: true, data: config }} />)
    expect(container.querySelector('.app-screen')).toHaveClass('scrollable')
    const image = container.querySelector('.visual-art')
    expect(image).toHaveAttribute('src', inlinePng)
    expect(image).toHaveStyle({ objectFit: 'contain' })
    expect(container.querySelector('.screen-canvas')).toHaveStyle({ backgroundImage: `url(${inlinePng})` })
    expect(container.querySelector('[aria-label="Reset zoom to fit"]')).toHaveTextContent('100%')
  })

  it('shows component image and schema previews in the catalog cards', () => {
    const config = structuredClone(testConfig)
    config.components[0].visual.src = inlinePng
    const { container } = render(<App result={{ ok: true, data: config }} />)
    fireEvent.click(screen.getByRole('button', { name: /components/i }))
    expect(screen.getByRole('img', { name: 'Pay button visual preview' })).toBeInTheDocument()
    expect(container.querySelector('.component-preview-image')).toHaveAttribute('src', inlinePng)
    expect(container.querySelector('.component-preview-label')).toHaveTextContent('Pay')
  })

  it('derives hotspot card previews from the parent screen screenshot', () => {
    const config = structuredClone(testConfig)
    config.screens[0].backgroundImage = inlinePng
    config.components[0].visual.kind = 'hotspot'
    const { container } = render(<App result={{ ok: true, data: config }} />)
    fireEvent.click(screen.getByRole('button', { name: /components/i }))
    expect(container.querySelector('.component-preview-crop')).toHaveAttribute('src', inlinePng)
    expect(container.querySelector('.hotspot-label')).not.toBeInTheDocument()
  })

  it('renders screen and app-wide tasks below the phone and exposes task details', () => {
    const config = structuredClone(testConfig)
    config.screens.push({ id: 'other', name: 'Other', width: 390, height: 844 })
    config.tasks = [
      {
        id: 'screen-sync',
        name: 'Screen sync',
        type: 'Data refresh',
        description: 'Refreshes this screen.',
        scope: { kind: 'screen', screenId: 'home' },
      },
      {
        id: 'global-sync',
        name: 'Global sync',
        type: 'App worker',
        description: 'Runs throughout the app.',
        scope: { kind: 'app' },
        trigger: { kind: 'scheduled', label: 'Every hour' },
      },
      {
        id: 'other-sync',
        name: 'Other sync',
        type: 'Data refresh',
        description: 'Refreshes the other screen.',
        scope: { kind: 'screen', screenId: 'other' },
      },
    ]
    config.scenarios[0].taskStates['global-sync'] = 'inactive'
    config.connections.push(
      {
        id: 'run-screen-sync',
        name: 'Run screen sync',
        source: { kind: 'task', id: 'screen-sync' },
        target: { kind: 'system', id: 'api' },
        protocol: 'HTTPS',
        description: 'Loads data.',
      },
      {
        id: 'run-global-sync',
        name: 'Run global sync',
        source: { kind: 'task', id: 'global-sync' },
        target: { kind: 'system', id: 'api' },
        protocol: 'HTTPS',
        description: 'Loads shared data.',
      },
    )
    const { container } = render(<App result={{ ok: true, data: config }} />)

    expect(screen.getByLabelText('App runtime tasks')).toBeInTheDocument()
    expect(container.querySelector('.device-frame .runtime-rail')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Screen sync, current screen, active/i })).toBeInTheDocument()
    const globalTask = screen.getByRole('button', { name: /Global sync, app-wide, inactive/i })
    expect(globalTask).toHaveClass('app-wide')
    expect(screen.queryByText('Other sync')).not.toBeInTheDocument()

    fireEvent.click(globalTask)
    expect(screen.getByLabelText('Global sync details')).toHaveTextContent('Every hour')
    expect(screen.getByLabelText('Global sync details')).toHaveTextContent('App-wide')

    fireEvent.click(screen.getByRole('button', { name: 'Expand view filters' }))
    fireEvent.click(within(screen.getByLabelText('View filters')).getByRole('button', { name: /Other/i }))
    expect(screen.getByRole('button', { name: /Other sync, current screen, active/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Global sync, app-wide, inactive/i })).toBeInTheDocument()
    expect(screen.queryByText('Screen sync')).not.toBeInTheDocument()
  })

  it('renders component Markdown without enabling raw HTML', () => {
    const config = structuredClone(testConfig)
    config.components[0].description = 'Uses **safe Markdown**.<script>unsafe()</script>'
    const { container } = render(<App result={{ ok: true, data: config }} />)
    fireEvent.click(screen.getByRole('button', { name: /components/i }))
    fireEvent.click(screen.getByRole('heading', { name: 'Pay button' }))
    expect(screen.getByText('safe Markdown')).toBeInTheDocument()
    expect(container.querySelector('.detail-description script')).not.toBeInTheDocument()
    expect(screen.queryByText('unsafe()')).not.toBeInTheDocument()
  })
})
