import { fireEvent, render, screen } from '@testing-library/react'
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

  it('renders readable configuration errors', () => {
    render(<App result={{ ok: false, errors: ['screens.0.id: Duplicate id'] }} />)
    expect(screen.getByRole('heading', { name: /could not start/i })).toBeInTheDocument()
    expect(screen.getByText(/screens.0.id/)).toBeInTheDocument()
  })

  it('applies a pasted JSON configuration to the live preview', () => {
    const updated = structuredClone(testConfig)
    updated.app.name = 'Edited preview'
    render(<App result={{ ok: true, data: testConfig }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit JSON configuration' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON configuration' }), { target: { value: JSON.stringify(updated) } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply configuration' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByText('Edited preview').length).toBeGreaterThan(0)
  })

  it('keeps invalid pasted JSON in the editor and reports the error', () => {
    render(<App result={{ ok: true, data: testConfig }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit JSON configuration' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON configuration' }), { target: { value: '{invalid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply configuration' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON')
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
})
