import { Quaternion, Vector3, MathUtils } from 'three'
import fs from 'fs'

const redStr = fs.readFileSync('../parts/connector-3way-red-v1.json', 'utf8')
const rodStr = fs.readFileSync('../parts/rod-54-blue-v1.json', 'utf8')
const red = JSON.parse(redStr)
const rod = JSON.parse(rodStr)

function computeGhostTransform(
    placingPort: any,
    targetWorldPos: Vector3,
    targetWorldDir: Vector3,
    angleDeg: number = 0
): { position: Vector3; rotation: Quaternion } {
    const desiredDir = targetWorldDir.clone().negate()
    const placingLocalDir = new Vector3(
        placingPort.direction[0],
        placingPort.direction[1],
        placingPort.direction[2],
    )
    const baseQuat = new Quaternion().setFromUnitVectors(placingLocalDir, desiredDir)

    const twistQuat = new Quaternion().setFromAxisAngle(targetWorldDir, MathUtils.degToRad(angleDeg))
    const ghostQuat = twistQuat.clone().multiply(baseQuat)

    const placingLocalPos = new Vector3(
        placingPort.position[0],
        placingPort.position[1],
        placingPort.position[2],
    )
    const rotatedLocalPos = placingLocalPos.clone().applyQuaternion(ghostQuat)
    const ghostPos = targetWorldPos.clone().sub(rotatedLocalPos)

    return { position: ghostPos, rotation: ghostQuat }
}

const targetInstance = { position: [0,0,0], rotation: [0,0,0,1] }
const targetPort = rod.ports[0] // end1
const targetWorldPos = new Vector3(...targetPort.position)
const targetWorldDir = new Vector3(...targetPort.direction)

let variants = []

for (const placingPort of red.ports) {
    const angles = targetPort.allowed_angles_deg?.length > 0 ? targetPort.allowed_angles_deg : [0]
    
    for (const angle of angles) {
        const { position: ghostPos, rotation: ghostQuat } = computeGhostTransform(
            placingPort,
            targetWorldPos,
            targetWorldDir,
            angle
        )
        
        const rodWorldMainAxis = new Vector3(1, 0, 0)
        const isPlacingRod = false
        const connectorWorldZ = new Vector3(0, 0, 1).applyQuaternion(ghostQuat)
        
        let isValid = true
        // 3. End-on snapping (end1, end2)
        if (placingPort.id !== 'center') {
            const isFlatConnectorEdge = Math.abs(placingPort.direction[2]) < 0.1
            if (isFlatConnectorEdge) {
                if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) > 0.1) isValid = false
            }
        } else {
            if (Math.abs(rodWorldMainAxis.dot(connectorWorldZ)) < 0.99) isValid = false
        }
        
        variants.push({
            id: placingPort.id,
            angle,
            ghostPos: [ghostPos.x, ghostPos.y, ghostPos.z],
            isValid
        })
    }
}

console.dir(variants, { depth: null })
