import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DiskConfigEditor } from './DiskConfigEditor'
import { scaledContentHeight } from './editor-utils'
import { testConfig } from './test-fixture'

describe('visual config editor', () => {
  it('maps high-density screenshots into logical screen coordinates', () => {
    expect(scaledContentHeight(390, 1170, 3000)).toBe(1000)
  })

  it('edits app metadata through forms and supports undo', () => {
    render(<DiskConfigEditor initialText={JSON.stringify(testConfig)} />)

    expect(screen.queryByRole('textbox', { name: 'JSON configuration' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Test AppApp settings/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Edited App' } })
    expect(screen.getByRole('button', { name: /Edited AppApp settings/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: /Test AppApp settings/i })).toBeInTheDocument()
  })

  it('draws a new screenshot region on the device canvas', () => {
    const { container } = render(<DiskConfigEditor initialText={JSON.stringify(testConfig)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add component' }))

    const canvas = container.querySelector('.editor-screen-canvas') as HTMLDivElement
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844, toJSON: () => ({}) }),
    })
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 150, clientY: 220 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 280, clientY: 320 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 280, clientY: 320 })

    expect(screen.getAllByText('New component').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Mode')).toHaveValue('region')
    expect(screen.getByLabelText('X')).toHaveValue(150)
    expect(screen.getByLabelText('Width')).toHaveValue(130)
  })

  it('confirms and cascades deletion of referenced systems', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<DiskConfigEditor initialText={JSON.stringify(testConfig)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Payment APIapi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByRole('button', { name: 'Payment APIapi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create paymentpay' })).not.toBeInTheDocument()
  })

  it('disables saving when a form change makes the configuration invalid', () => {
    render(<DiskConfigEditor initialText={JSON.stringify(testConfig)} />)
    fireEvent.click(screen.getByRole('button', { name: /Test AppApp settings/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('app.name')
  })
})
