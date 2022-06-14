/* eslint max-nested-callbacks: ["error", 8] */
import { pipe } from 'it-pipe'
import { duplexPair } from 'it-pair/duplex'
import { abortableSource } from 'abortable-iterator'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import drain from 'it-drain'
import { expect } from 'aegir/chai'
import delay from 'delay'
import type { TestSetup } from '@libp2p/interface-compliance-tests'
import type { StreamMuxerFactory } from '@libp2p/interface-stream-muxer'
import { Components } from '@libp2p/components'
import pDefer from 'p-defer'
import all from 'it-all'

function randomBuffer () {
  return uint8ArrayFromString(Math.random().toString())
}

const infiniteRandom = {
  [Symbol.asyncIterator]: async function * () {
    while (true) {
      yield randomBuffer()
      await delay(50)
    }
  }
}

export default (common: TestSetup<StreamMuxerFactory>) => {
  describe('close', () => {
    it('closing underlying socket closes streams', async () => {
      let openedStreams = 0
      const expectedStreams = 5
      const dialerFactory = await common.setup()
      const dialer = dialerFactory.createStreamMuxer(new Components())

      // Listener is echo server :)
      const listenerFactory = await common.setup()
      const listener = listenerFactory.createStreamMuxer(new Components(), {
        onIncomingStream: (stream) => {
          openedStreams++
          void pipe(stream, stream)
        }
      })

      const p = duplexPair<Uint8Array>()
      void pipe(p[0], dialer, p[0])
      void pipe(p[1], listener, p[1])

      const streams = Array(expectedStreams).fill(0).map(() => dialer.newStream())

      void Promise.all(
        streams.map(async stream => {
          return await pipe(
            infiniteRandom,
            stream,
            drain
          )
        })
      )

      expect(dialer.streams).to.have.lengthOf(expectedStreams)

      // Pause, and then send some data and close the dialer
      await delay(50)
      await pipe([randomBuffer()], dialer, drain)

      expect(openedStreams).to.have.equal(expectedStreams)
      expect(dialer.streams).to.have.lengthOf(0)
    })

    it('closing one of the muxed streams doesn\'t close others', async () => {
      const p = duplexPair<Uint8Array>()
      const dialerFactory = await common.setup()
      const dialer = dialerFactory.createStreamMuxer(new Components())

      // Listener is echo server :)
      const listenerFactory = await common.setup()
      const listener = listenerFactory.createStreamMuxer(new Components(), {
        onIncomingStream: (stream) => {
          void pipe(stream, stream)
        }
      })

      void pipe(p[0], dialer, p[0])
      void pipe(p[1], listener, p[1])

      const stream = dialer.newStream()
      const streams = Array.from(Array(5), () => dialer.newStream())
      let closed = false
      const controllers: AbortController[] = []

      const streamResults = streams.map(async stream => {
        const controller = new AbortController()
        controllers.push(controller)

        try {
          const abortableRand = abortableSource(infiniteRandom, controller.signal, { abortCode: 'ERR_TEST_ABORT' })
          await pipe(abortableRand, stream, drain)
        } catch (err: any) {
          if (err.code !== 'ERR_TEST_ABORT') throw err
        }

        if (!closed) throw new Error('stream should not have ended yet!')
      })

      // Pause, and then send some data and close the first stream
      await delay(50)
      await pipe([randomBuffer()], stream, drain)
      closed = true

      // Abort all the other streams later
      await delay(50)
      controllers.forEach(c => c.abort())

      // These should now all resolve without error
      await Promise.all(streamResults)
    })

    it('can close a stream for writing', async () => {
      const deferred = pDefer<any>()

      const p = duplexPair<Uint8Array>()
      const dialerFactory = await common.setup()
      const dialer = dialerFactory.createStreamMuxer(new Components())
      const data = [randomBuffer(), randomBuffer()]

      const listenerFactory = await common.setup()
      const listener = listenerFactory.createStreamMuxer(new Components(), {
        onIncomingStream: (stream) => {
          void Promise.resolve().then(async () => {
            // Immediate close for write
            await stream.closeWrite()

            const results = await pipe(stream, async (source) => {
              const data = []
              for await (const chunk of source) {
                data.push(chunk.slice())
              }
              return data
            })
            expect(results).to.eql(data)

            try {
              await stream.sink([randomBuffer()])
            } catch (err) {
              deferred.resolve(err)
            }

            deferred.reject(new Error('should not support writing to closed writer'))
          })
        }
      })

      void pipe(p[0], dialer, p[0])
      void pipe(p[1], listener, p[1])

      const stream = dialer.newStream()
      await stream.sink(data)

      const err = await deferred.promise
      expect(err).to.have.property('message').that.matches(/stream closed for writing/)
    })

    it('can close a stream for reading', async () => {
      const deferred = pDefer<any>()

      const p = duplexPair<Uint8Array>()
      const dialerFactory = await common.setup()
      const dialer = dialerFactory.createStreamMuxer(new Components())
      const data = [randomBuffer(), randomBuffer()]

      const listenerFactory = await common.setup()
      const listener = listenerFactory.createStreamMuxer(new Components(), {
        onIncomingStream: (stream) => {
          void all(stream.source).then(deferred.resolve, deferred.reject)
        }
      })

      void pipe(p[0], dialer, p[0])
      void pipe(p[1], listener, p[1])

      const stream = dialer.newStream()
      await stream.closeRead()

      // Source should be done
      void Promise.resolve().then(async () => {
        // @ts-expect-error next is part of the iterable protocol
        expect(await stream.source.next()).to.have.property('done', true)
        await stream.sink(data)
      })

      const results = await deferred.promise
      expect(results).to.eql(data)
    })

    it('calls onStreamEnd for closed streams not previously written', async () => {
      const deferred = pDefer()

      const onStreamEnd = () => deferred.resolve()
      const dialerFactory = await common.setup()
      const dialer = dialerFactory.createStreamMuxer(new Components(), {
        onStreamEnd
      })

      const stream = await dialer.newStream()

      await stream.close()
      await deferred.promise
    })

    it('calls onStreamEnd for read and write closed streams not previously written', async () => {
      const deferred = pDefer()

      const onStreamEnd = () => deferred.resolve()
      const dialerFactory = await common.setup()
      const dialer = dialerFactory.createStreamMuxer(new Components(), {
        onStreamEnd
      })

      const stream = await dialer.newStream()

      await stream.closeWrite()
      await stream.closeRead()
      await deferred.promise
    })
  })
}