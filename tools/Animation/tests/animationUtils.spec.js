import { test, expect } from '@playwright/test'
import {
    fpsToEverySeconds,
    validateBoundingBox,
    calculateTimeSteps,
    formatTimestampForDisplay,
} from '../animationUtils'

test.describe('Animation animationUtils', () => {
    test('fpsToEverySeconds formats sub-second rates with one decimal', () => {
        expect(fpsToEverySeconds(2)).toBe('Every 0.5s')
    })

    test('fpsToEverySeconds formats whole-second rates without decimals', () => {
        expect(fpsToEverySeconds(1)).toBe('Every 1s')
    })

    test('fpsToEverySeconds formats fractional multi-second rates with one decimal', () => {
        expect(fpsToEverySeconds(0.4)).toBe('Every 2.5s')
    })

    test('validateBoundingBox accepts a well-formed box', () => {
        expect(validateBoundingBox({ north: 10, south: -10, east: 20, west: -20 })).toBe(true)
    })

    test('validateBoundingBox rejects a box where north <= south', () => {
        expect(validateBoundingBox({ north: -10, south: 10, east: 20, west: -20 })).toBe(false)
    })

    test('validateBoundingBox rejects out-of-range latitude/longitude', () => {
        expect(validateBoundingBox({ north: 95, south: -10, east: 20, west: -20 })).toBe(false)
        expect(validateBoundingBox({ north: 10, south: -10, east: 200, west: -20 })).toBe(false)
    })

    test('calculateTimeSteps generates one step per day across a range', () => {
        const steps = calculateTimeSteps(new Date('2024-01-01T00:00:00Z'), new Date('2024-01-04T00:00:00Z'), 'day')
        expect(steps).toHaveLength(4)
        expect(steps[0].toISOString()).toBe('2024-01-01T00:00:00.000Z')
        expect(steps[3].toISOString()).toBe('2024-01-04T00:00:00.000Z')
    })

    test('calculateTimeSteps generates one step per hour across a range', () => {
        const steps = calculateTimeSteps(new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T03:00:00Z'), 'hour')
        expect(steps).toHaveLength(4)
    })

    test('formatTimestampForDisplay renders a fixed local format', () => {
        const formatted = formatTimestampForDisplay(new Date(2024, 0, 5, 6, 7, 8))
        expect(formatted).toBe('2024-01-05 06:07:08')
    })
})
