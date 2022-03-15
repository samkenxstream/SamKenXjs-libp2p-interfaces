import baseTest from './base-test.js'
import closeTest from './close-test.js'
import stressTest from './stress-test.js'
import megaStressTest from './mega-stress-test.js'
import type { TestSetup } from '../index.js'
import type { StreamMuxerFactory } from '@libp2p/interfaces/stream-muxer'

export default (common: TestSetup<StreamMuxerFactory>) => {
  describe('interface-stream-muxer', () => {
    baseTest(common)
    closeTest(common)
    stressTest(common)
    megaStressTest(common)
  })
}
