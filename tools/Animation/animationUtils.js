// Convert FPS to "Every X seconds" format for display
export function fpsToEverySeconds(fps) {
    const seconds = 1 / fps
    if (seconds < 1) {
        return `Every ${seconds.toFixed(1)}s`
    } else if (seconds === Math.floor(seconds)) {
        return `Every ${seconds}s`
    } else {
        return `Every ${seconds.toFixed(1)}s`
    }
}

export function validateBoundingBox(bbox) {
    return bbox.north > bbox.south &&
           bbox.east > bbox.west &&
           bbox.north <= 90 && bbox.south >= -90 &&
           bbox.east <= 180 && bbox.west >= -180
}

export function calculateTimeSteps(start, end, interval) {
    const steps = []
    const current = new Date(start)

    while (current <= end) {
        steps.push(new Date(current))

        switch (interval) {
            case 'hour':
                current.setHours(current.getHours() + 1)
                break
            case 'day':
                current.setDate(current.getDate() + 1)
                break
            case 'week':
                current.setDate(current.getDate() + 7)
                break
            case 'month':
                current.setMonth(current.getMonth() + 1)
                break
            case 'year':
                current.setFullYear(current.getFullYear() + 1)
                break
        }
    }

    return steps
}

export function formatTimestampForDisplay(timestamp) {
    const date = new Date(timestamp)

    // Format as: YYYY-MM-DD HH:MM:SS
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}
