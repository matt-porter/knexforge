export { spinnerTemplate } from './spinner'
export { crankSliderTemplate } from './crankSlider'
export { linkageLoopTemplate } from './linkageLoop'
export { motorChainTemplate } from './motorChain'
export { ferrisWheelTemplate } from './ferrisWheel'
export { vehicleChassisTemplate } from './vehicleChassis'
export { towerBridgeTemplate } from './towerBridge'
export { craneTemplate } from './crane'
export { windmillTemplate } from './windmill'

import { spinnerTemplate } from './spinner'
import { crankSliderTemplate } from './crankSlider'
import { linkageLoopTemplate } from './linkageLoop'
import { motorChainTemplate } from './motorChain'
import { ferrisWheelTemplate } from './ferrisWheel'
import { vehicleChassisTemplate } from './vehicleChassis'
import { towerBridgeTemplate } from './towerBridge'
import { craneTemplate } from './crane'
import { windmillTemplate } from './windmill'
import type { SynthesisTemplate } from '../templates'

export const templateCatalog: Record<string, SynthesisTemplate> = {
  [spinnerTemplate.id]: spinnerTemplate,
  [crankSliderTemplate.id]: crankSliderTemplate,
  [linkageLoopTemplate.id]: linkageLoopTemplate,
  [motorChainTemplate.id]: motorChainTemplate,
  [ferrisWheelTemplate.id]: ferrisWheelTemplate,
  [vehicleChassisTemplate.id]: vehicleChassisTemplate,
  [towerBridgeTemplate.id]: towerBridgeTemplate,
  [craneTemplate.id]: craneTemplate,
  [windmillTemplate.id]: windmillTemplate,
}
