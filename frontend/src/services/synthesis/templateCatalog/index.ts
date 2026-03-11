export { spinnerTemplate } from './spinner'
export { crankSliderTemplate } from './crankSlider'
export { linkageLoopTemplate } from './linkageLoop'
export { motorChainTemplate } from './motorChain'

import { spinnerTemplate } from './spinner'
import { crankSliderTemplate } from './crankSlider'
import { linkageLoopTemplate } from './linkageLoop'
import { motorChainTemplate } from './motorChain'
import type { SynthesisTemplate } from '../templates'

export const templateCatalog: Record<string, SynthesisTemplate> = {
  [spinnerTemplate.id]: spinnerTemplate,
  [crankSliderTemplate.id]: crankSliderTemplate,
  [linkageLoopTemplate.id]: linkageLoopTemplate,
  [motorChainTemplate.id]: motorChainTemplate,
}
