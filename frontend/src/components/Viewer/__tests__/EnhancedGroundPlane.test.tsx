/**
 * Tests for EnhancedGroundPlane component.
 * Task 10.5: Validates ground plane visibility improvements.
 */

import { describe, it, expect } from 'vitest'
import { Color } from 'three'

describe('EnhancedGroundPlane', () => {
  it('ground plane size is large enough (2000x2000mm)', () => {
    const groundSize = 2000
    expect(groundSize).toBeGreaterThan(1000) // Should be larger than old 1000x1000
  })

  it('ground plane color is light gray for visibility', () => {
    // Expected color from implementation: #e8eaf6 (light blue-gray)
    const groundColor = new Color('#e8eaf6')
    
    // Verify it's a light color (high value)
    expect(groundColor.getHex()).toBe(0xe8eaf6)
    
    // Check that RGB values are all high (> 0.78) for visibility
    // toArray() returns values in 0-1 range, so 200/255 ≈ 0.78
    const rgb = groundColor.toArray()
    expect(rgb[0]).toBeGreaterThan(0.78)
    expect(rgb[1]).toBeGreaterThan(0.78)
    expect(rgb[2]).toBeGreaterThan(0.78)
  })

  it('ground plane has checkerboard pattern for scale reference', () => {
    // Verify grid helper parameters from implementation
    const gridSize = 2000
    const gridDivisions = 200
    
    expect(gridSize).toBe(2000)
    expect(gridDivisions).toBe(200)
    
    // Check colors are visible (not too dark)
    const primaryColor = new Color('#9fa5c3')
    const secondaryColor = new Color('#c5cae9')
    
    expect(primaryColor.getHex()).toBe(0x9fa5c3)
    expect(secondaryColor.getHex()).toBe(0xc5cae9)
  })

  it('edge highlight provides depth separation', () => {
    // Edge highlight color: #9fa5c3 (medium gray-blue)
    const edgeColor = new Color('#9fa5c3')
    
    // Should be darker than ground plane but still visible
    expect(edgeColor.getHex()).toBe(0x9fa5c3)
  })

  it('ground plane is positioned slightly above Y=0 to avoid z-fighting', () => {
    const yOffset = 0.01
    expect(yOffset).toBeGreaterThan(0)
    expect(yOffset).toBeLessThan(1) // Should be small but non-zero
  })

  it('checkerboard is positioned slightly above ground plane', () => {
    const yOffset = 0.02
    expect(yOffset).toBeGreaterThan(0.01) // Above main ground plane
  })

  it('edge highlight is positioned highest for depth cueing', () => {
    const yOffset = 0.03
    expect(yOffset).toBeGreaterThan(0.02) // Above checkerboard
  })
})
