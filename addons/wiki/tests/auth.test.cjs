'use strict'

process.env.Y_WEBSOCKET_SECRET = process.env.Y_WEBSOCKET_SECRET || 'test-y-websocket-secret'
process.env.Y_WEBSOCKET_ALLOWED_ORIGINS = process.env.Y_WEBSOCKET_ALLOWED_ORIGINS || ''

const path = require('path')
const Module = require('module')
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const http = require('http')
const { spawnSync } = require('child_process')
const jwt = require('jsonwebtoken')

const AUTH_DIR = path.resolve(__dirname, '../../../docker/y-websocket-auth')
const TESTS_NODE_MODULES = path.join(__dirname, 'node_modules')
// auth.cjs resolves dependencies from its own directory; point Node at this
// folder's node_modules so tests can load it without installing next to auth.cjs.
process.env.NODE_PATH = [TESTS_NODE_MODULES, process.env.NODE_PATH]
  .filter(Boolean)
  .join(path.delimiter)
Module._initPaths()

const { authorizeUpgrade } = require(path.join(AUTH_DIR, 'auth.cjs'))

const SECRET = process.env.Y_WEBSOCKET_SECRET
const DOC_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const SUB = 'abcde'

function signToken (payload, secret = SECRET) {
  return jwt.sign(payload, secret, { algorithm: 'HS256' })
}

function validClaims (overrides = {}) {
  return {
    doc_id: DOC_ID,
    sub: SUB,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides
  }
}

function validToken (overrides = {}) {
  return signToken(validClaims(overrides))
}

function tokenPath (token, docId = DOC_ID) {
  if (token === undefined) {
    return `/${docId}`
  }
  return `/${docId}?token=${encodeURIComponent(token)}`
}

/**
 * Same upgrade gate as server-wrapper.cjs, without y-websocket utils.cjs.
 * Auth success is reported as HTTP 101; failure uses the wrapper status codes.
 */
function createAuthGateServer () {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' })
    response.end('okay')
  })

  server.on('upgrade', (request, socket, _head) => {
    const authResult = authorizeUpgrade(request)
    if (!authResult.authorized) {
      const statusCode = authResult.statusCode || 401
      const statusText = statusCode === 400 ? 'Bad Request' : 'Unauthorized'
      socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\n\r\n`)
      socket.destroy()
      return
    }

    // RFC 6455 example accept value for Sec-WebSocket-Key dGhlIHNhbXBsZSBub25jZQ==
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n' +
      '\r\n'
    )
    socket.destroy()
  })

  return server
}

function requestUpgrade (port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        Origin: 'http://localhost:5200'
      }
    })
    req.on('upgrade', (res, socket) => {
      socket.destroy()
      resolve(res.statusCode)
    })
    req.on('response', (res) => {
      res.resume()
      resolve(res.statusCode)
    })
    req.on('error', reject)
    req.end()
  })
}

describe('y-websocket auth upgrade', () => {
  let server
  let port

  before(async () => {
    server = createAuthGateServer()
    await new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', resolve)
      server.on('error', reject)
    })
    port = server.address().port
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  })

  it('allows a valid token for the requested document', async () => {
    const status = await requestUpgrade(port, tokenPath(validToken()))
    assert.equal(status, 101)
  })

  it('rejects a token with an invalid signature', async () => {
    const token = signToken(validClaims(), 'wrong-secret')
    const status = await requestUpgrade(port, tokenPath(token))
    assert.equal(status, 401)
  })

  it('rejects an expired token', async () => {
    const token = signToken(validClaims({
      exp: Math.floor(Date.now() / 1000) - 60
    }))
    const status = await requestUpgrade(port, tokenPath(token))
    assert.equal(status, 401)
  })

  it('rejects a token without exp', async () => {
    const token = signToken({
      doc_id: DOC_ID,
      sub: SUB
    })
    const status = await requestUpgrade(port, tokenPath(token))
    assert.equal(status, 401)
  })

  it('rejects a token whose doc_id does not match the URL', async () => {
    const token = validToken({ doc_id: 'other-document-id' })
    const status = await requestUpgrade(port, tokenPath(token))
    assert.equal(status, 401)
  })

  it('rejects a request with no token', async () => {
    const status = await requestUpgrade(port, tokenPath(undefined))
    assert.equal(status, 401)
  })

  it('rejects duplicate token query parameters with 400', async () => {
    const token = validToken()
    const status = await requestUpgrade(
      port,
      `/${DOC_ID}?token=${encodeURIComponent(token)}&token=second`
    )
    assert.equal(status, 400)
  })
})

describe('Y_WEBSOCKET_SECRET fail-fast', () => {
  it('exits when the secret is missing', () => {
    const result = spawnSync(
      process.execPath,
      ['-e', "require('./auth.cjs').assertYWebsocketSecretConfigured()"],
      {
        cwd: AUTH_DIR,
        env: {
          ...process.env,
          NODE_PATH: TESTS_NODE_MODULES,
          Y_WEBSOCKET_SECRET: ''
        },
        encoding: 'utf8'
      }
    )

    assert.equal(result.status, 1)
    assert.match(
      result.stderr,
      /Y_WEBSOCKET_SECRET is required; refusing to start without authentication/
    )
  })
})
