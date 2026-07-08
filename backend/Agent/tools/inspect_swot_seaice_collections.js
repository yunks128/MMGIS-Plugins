#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '../../../../')
const missionArg = process.argv[2] || process.env.FROZON_DEFAULT_MISSION || 'frozon'

function pickMissionConfigPath(mission) {
    const missionsDir = path.join(REPO_ROOT, 'Missions')
    const extractVersion = (filename) => {
        const match = String(filename || '').match(/_v(\d+)_config\.json$/i)
        if (!match) return -1
        const parsed = Number(match[1])
        return Number.isFinite(parsed) ? parsed : -1
    }
    const candidates = fs
        .readdirSync(missionsDir)
        .filter((file) => /_config\.json$/i.test(file))
        .filter((file) =>
            file.toLowerCase().includes(String(mission || '').toLowerCase())
        )
        .map((file) => {
            const fullPath = path.join(missionsDir, file)
            return {
                file,
                fullPath,
                version: extractVersion(file),
                mtimeMs: fs.statSync(fullPath).mtimeMs,
            }
        })
        .sort((a, b) => {
            if (b.version !== a.version) return b.version - a.version
            return b.mtimeMs - a.mtimeMs
        })

    if (!candidates.length) {
        throw new Error(`No mission config found for "${mission}" in ${missionsDir}`)
    }
    return candidates[0].fullPath
}

function flattenLayers(config) {
    const out = []
    const visit = (node, group = []) => {
        if (!node || typeof node !== 'object') return
        const name =
            typeof node.name === 'string' && node.name.trim()
                ? node.name.trim()
                : null
        if (name) {
            out.push({
                id: node.uuid || null,
                title: name,
                groupPath: group.join(' > '),
                assetHref:
                    (typeof node.url === 'string' && node.url.trim()) ||
                    (typeof node.path === 'string' && node.path.trim()) ||
                    (typeof node.cogUrl === 'string' && node.cogUrl.trim()) ||
                    null,
            })
        }
        const sublayers = Array.isArray(node.sublayers) ? node.sublayers : []
        const nextGroup = name ? [...group, name] : group
        sublayers.forEach((child) => visit(child, nextGroup))
    }

    const topLayers = Array.isArray(config.layers) ? config.layers : []
    topLayers.forEach((layer) => visit(layer, []))
    return out
}

function textForMatch(entry) {
    return `${entry.title} ${entry.groupPath} ${entry.assetHref || ''}`
        .toLowerCase()
        .replace(/\s+/g, ' ')
}

function printSection(header, entries) {
    console.log(`\n${header}`)
    if (!entries.length) {
        console.log('  (none)')
        return
    }
    entries.forEach((entry) => {
        console.log(`  - id: ${entry.id || '(missing)'}`)
        console.log(`    title: ${entry.title}`)
        console.log(`    group: ${entry.groupPath || '(root)'}`)
        console.log(`    asset: ${entry.assetHref || '(missing)'}`)
    })
}

function findDuplicates(entries, keyName) {
    const buckets = new Map()
    entries.forEach((entry) => {
        const key = entry[keyName]
        if (!key) return
        const list = buckets.get(key) || []
        list.push(entry)
        buckets.set(key, list)
    })
    return Array.from(buckets.entries())
        .filter(([, list]) => list.length > 1)
        .map(([key, list]) => ({ key, list }))
}

function main() {
    const configPath = pickMissionConfigPath(missionArg)
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    const layers = flattenLayers(config)

    const swot = layers.filter((entry) => textForMatch(entry).includes('swot'))
    const seaIce = layers.filter((entry) => {
        const text = textForMatch(entry)
        return text.includes('sea ice') || text.includes('seaice')
    })
    const duplicatesById = findDuplicates(layers, 'id')
    const duplicatesByTitle = findDuplicates(layers, 'title')

    console.log(`Mission config: ${configPath}`)
    printSection('Collections matching "swot":', swot)
    printSection('Collections matching "sea ice/seaice":', seaIce)

    console.log('\nDuplicate IDs:')
    if (!duplicatesById.length) {
        console.log('  none')
    } else {
        duplicatesById.forEach((entry) => {
            console.log(`  - ${entry.key}`)
        })
    }

    console.log('\nDuplicate titles:')
    if (!duplicatesByTitle.length) {
        console.log('  none')
    } else {
        duplicatesByTitle.forEach((entry) => {
            console.log(`  - ${entry.key}`)
        })
    }
}

main()
