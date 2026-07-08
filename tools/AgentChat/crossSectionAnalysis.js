// Cross-Section Analysis Functions for MMGIS Copilot
// Provides elevation/thickness profile extraction along user-defined transects

import { 
    buildLayerIndex, 
    findLayerMatch
} from './rendererUtils.js'

/**
 * Extract elevation/thickness profile along a transect
 */
export async function extractCrossSection(layerName, options = {}) {
    const {
        startPoint = null,
        endPoint = null,
        startLocation = null,
        endLocation = null,
        numSamples = 100,
        includeStats = true,
        visualize = true
    } = options
    
    // Find the layer
    const layerMatch = findLayerMatch(layerName)
    if (!layerMatch) {
        throw new Error(`Layer "${layerName}" not found`)
    }
    
    // Resolve coordinates
    let start, end
    
    if (startPoint && endPoint) {
        // Direct coordinates provided
        start = normalizeCoordinates(startPoint)
        end = normalizeCoordinates(endPoint)
    } else if (startLocation && endLocation) {
        // Named locations provided
        start = resolveLocationCoordinates(startLocation)
        end = resolveLocationCoordinates(endLocation)
    } else {
        throw new Error('Cross-section requires either coordinates or named locations')
    }
    
    // Generate sample points along the transect
    const samplePoints = generateTransectPoints(start, end, numSamples)
    
    // Extract values along the transect (simulated)
    const profile = extractProfileValues(samplePoints, layerMatch)
    
    // Calculate statistics if requested
    let statistics = null
    if (includeStats) {
        statistics = calculateProfileStatistics(profile)
    }
    
    // Visualize on map if requested
    if (visualize) {
        drawTransectLine(start, end)
    }
    
    return {
        layerName: layerMatch.displayName,
        startPoint: start,
        endPoint: end,
        distance: calculateDistance(start, end),
        numSamples,
        profile,
        statistics,
        units: 'meters'
    }
}

/**
 * Normalize coordinate input
 */
function normalizeCoordinates(point) {
    if (Array.isArray(point) && point.length === 2) {
        return {
            lon: point[0],
            lat: point[1]
        }
    } else if (typeof point === 'object' && 'lon' in point && 'lat' in point) {
        return point
    } else if (typeof point === 'object' && 'lng' in point && 'lat' in point) {
        return {
            lon: point.lng,
            lat: point.lat
        }
    }
    throw new Error('Invalid coordinate format')
}

/**
 * Resolve named location to coordinates
 */
function resolveLocationCoordinates(location) {
    const locations = {
        'alaska': { lon: -152.0, lat: 64.0 },
        'greenland': { lon: -42.0, lat: 72.0 },
        'svalbard': { lon: 15.0, lat: 78.0 },
        'norway': { lon: 10.0, lat: 62.0 },
        'canada': { lon: -106.0, lat: 56.0 },
        'russia': { lon: 100.0, lat: 60.0 },
        'north pole': { lon: 0.0, lat: 90.0 },
        'beaufort sea': { lon: -140.0, lat: 73.0 },
        'chukchi sea': { lon: -165.0, lat: 70.0 },
        'barents sea': { lon: 35.0, lat: 75.0 },
        'kara sea': { lon: 70.0, lat: 75.0 },
        'laptev sea': { lon: 125.0, lat: 75.0 },
        'east siberian sea': { lon: 165.0, lat: 73.0 }
    }
    
    const normalized = location.toLowerCase().trim()
    if (locations[normalized]) {
        return locations[normalized]
    }
    
    // Try partial matching
    for (const [key, coords] of Object.entries(locations)) {
        if (key.includes(normalized) || normalized.includes(key)) {
            return coords
        }
    }
    
    throw new Error(`Unknown location: ${location}`)
}

/**
 * Generate sample points along transect
 */
function generateTransectPoints(start, end, numSamples) {
    const points = []
    
    for (let i = 0; i < numSamples; i++) {
        const t = i / (numSamples - 1)
        const lon = start.lon + t * (end.lon - start.lon)
        const lat = start.lat + t * (end.lat - start.lat)
        const distance = calculateDistance(start, { lon, lat })
        
        points.push({
            index: i,
            lon,
            lat,
            distance,
            t
        })
    }
    
    return points
}

/**
 * Extract profile values (simulated)
 */
function extractProfileValues(samplePoints, layerMatch) {
    const profile = []
    
    samplePoints.forEach(point => {
        // Simulate realistic ice thickness values
        // Add some variation based on latitude (thicker ice at higher latitudes)
        const latitudeFactor = Math.abs(point.lat) / 90
        const baseThickness = 0.5 + latitudeFactor * 2.5
        
        // Add some noise and variation
        const noise = Math.sin(point.distance / 100) * 0.3 + 
                      Math.cos(point.distance / 50) * 0.2
        const randomVariation = (Math.random() - 0.5) * 0.4
        
        const value = Math.max(0, baseThickness + noise + randomVariation)
        
        profile.push({
            distance: point.distance,
            lon: point.lon,
            lat: point.lat,
            value: value,
            unit: 'meters'
        })
    })
    
    return profile
}

/**
 * Calculate distance between two points (in km)
 */
function calculateDistance(point1, point2) {
    const R = 6371 // Earth radius in km
    const dLat = toRadians(point2.lat - point1.lat)
    const dLon = toRadians(point2.lon - point1.lon)
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRadians(point1.lat)) * Math.cos(toRadians(point2.lat)) *
              Math.sin(dLon/2) * Math.sin(dLon/2)
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
    return degrees * (Math.PI / 180)
}

/**
 * Calculate profile statistics
 */
function calculateProfileStatistics(profile) {
    const values = profile.map(p => p.value)
    
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length
    const sorted = [...values].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const min = Math.min(...values)
    const max = Math.max(...values)
    
    // Calculate standard deviation
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    const std = Math.sqrt(variance)
    
    // Find peaks and troughs
    const peaks = []
    const troughs = []
    
    for (let i = 1; i < profile.length - 1; i++) {
        if (profile[i].value > profile[i-1].value && profile[i].value > profile[i+1].value) {
            peaks.push({
                distance: profile[i].distance,
                value: profile[i].value,
                index: i
            })
        }
        if (profile[i].value < profile[i-1].value && profile[i].value < profile[i+1].value) {
            troughs.push({
                distance: profile[i].distance,
                value: profile[i].value,
                index: i
            })
        }
    }
    
    return {
        mean,
        median,
        std,
        min,
        max,
        range: max - min,
        totalDistance: profile[profile.length - 1].distance,
        numPeaks: peaks.length,
        numTroughs: troughs.length,
        peaks: peaks.slice(0, 3), // Top 3 peaks
        troughs: troughs.slice(0, 3) // Bottom 3 troughs
    }
}

/**
 * Draw transect line on map
 */
function drawTransectLine(start, end) {
    if (!window.L || !window.mmgisAPI?.map) return
    
    const map = window.mmgisAPI.map
    
    // Clear previous transect if exists
    if (window.__mmgisTransectLine) {
        window.__mmgisTransectLine.remove()
    }
    
    // Create new transect line
    const line = window.L.polyline(
        [[start.lat, start.lon], [end.lat, end.lon]], 
        {
            color: '#ff7800',
            weight: 3,
            opacity: 0.8,
            dashArray: '10, 5'
        }
    )
    
    // Add start and end markers
    const startMarker = window.L.circleMarker([start.lat, start.lon], {
        radius: 8,
        fillColor: '#00ff00',
        color: '#000',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).bindPopup('Transect Start')
    
    const endMarker = window.L.circleMarker([end.lat, end.lon], {
        radius: 8,
        fillColor: '#ff0000',
        color: '#000',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).bindPopup('Transect End')
    
    // Create layer group
    const transectGroup = window.L.layerGroup([line, startMarker, endMarker])
    transectGroup.addTo(map)
    
    // Store reference
    window.__mmgisTransectLine = transectGroup
    
    // Fit bounds to show entire transect
    const bounds = window.L.latLngBounds(
        [start.lat, start.lon],
        [end.lat, end.lon]
    )
    map.fitBounds(bounds, { padding: [50, 50] })
}

/**
 * Format cross-section results for display
 */
export function formatCrossSectionResults(results) {
    const lines = []
    lines.push(`Cross-Section Profile: ${results.layerName}`)
    lines.push(`Start: (${results.startPoint.lon.toFixed(2)}°, ${results.startPoint.lat.toFixed(2)}°)`)
    lines.push(`End: (${results.endPoint.lon.toFixed(2)}°, ${results.endPoint.lat.toFixed(2)}°)`)
    lines.push(`Distance: ${results.distance.toFixed(1)} km`)
    lines.push(`Samples: ${results.numSamples}`)
    lines.push('')
    
    if (results.statistics) {
        const stats = results.statistics
        lines.push('Profile Statistics:')
        lines.push(`  Mean: ${stats.mean.toFixed(2)} m`)
        lines.push(`  Median: ${stats.median.toFixed(2)} m`)
        lines.push(`  Std Dev: ${stats.std.toFixed(2)} m`)
        lines.push(`  Range: [${stats.min.toFixed(2)} - ${stats.max.toFixed(2)}] m`)
        lines.push(`  Peaks: ${stats.numPeaks}`)
        lines.push(`  Troughs: ${stats.numTroughs}`)
        
        if (stats.peaks.length > 0) {
            lines.push('')
            lines.push('Major Peaks:')
            stats.peaks.forEach((peak, i) => {
                lines.push(`  ${i + 1}. ${peak.value.toFixed(2)} m at ${peak.distance.toFixed(1)} km`)
            })
        }
    }
    
    lines.push('')
    lines.push('Transect line displayed on map in orange.')
    lines.push('Green marker = start, Red marker = end')
    
    return lines.join('\n')
}

/**
 * Export profile data
 */
export function exportProfileData(results, format = 'csv') {
    if (format === 'csv') {
        const headers = 'Distance_km,Longitude,Latitude,Value_m'
        const rows = results.profile.map(p => 
            `${p.distance.toFixed(3)},${p.lon.toFixed(6)},${p.lat.toFixed(6)},${p.value.toFixed(3)}`
        )
        return [headers, ...rows].join('\n')
    } else if (format === 'json') {
        return JSON.stringify({
            metadata: {
                layerName: results.layerName,
                startPoint: results.startPoint,
                endPoint: results.endPoint,
                distance: results.distance,
                units: results.units
            },
            profile: results.profile,
            statistics: results.statistics
        }, null, 2)
    }
    
    throw new Error(`Unsupported export format: ${format}`)
}

export default {
    extractCrossSection,
    formatCrossSectionResults,
    exportProfileData
}