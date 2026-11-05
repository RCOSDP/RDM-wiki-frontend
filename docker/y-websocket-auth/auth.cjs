const url = require('url')
const jwt = require('jsonwebtoken')

const Y_WEBSOCKET_SECRET = process.env.Y_WEBSOCKET_SECRET || ''
const Y_WEBSOCKET_ALLOWED_ORIGINS = (process.env.Y_WEBSOCKET_ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

function assertYWebsocketSecretConfigured () {
  if (!Y_WEBSOCKET_SECRET) {
    console.error('Y_WEBSOCKET_SECRET is required; refusing to start without authentication')
    process.exit(1)
  }
}

function verifyJwt (token, secret) {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256']
    })
    // Require exp so tokens without expiry are rejected.
    if (!payload || typeof payload !== 'object' || !payload.exp) {
      return null
    }
    return payload
  } catch (error) {
    return null
  }
}

function isOriginAllowed (origin) {
  if (Y_WEBSOCKET_ALLOWED_ORIGINS.length === 0) {
    return true
  }
  if (!origin) {
    return false
  }
  return Y_WEBSOCKET_ALLOWED_ORIGINS.includes(origin)
}

function getDocIdFromRequest (request) {
  const parsedUrl = url.parse(request.url || '', true)
  const pathname = parsedUrl.pathname || ''
  const docId = pathname.replace(/^\/+/, '').split('/')[0]
  return docId || null
}

/**
 * Read the token query parameter.
 * Accepts only a single non-empty string.
 * Multiple values (?token=a&token=b) become an array and are rejected.
 */
function getTokenFromRequest (request) {
  const parsedUrl = url.parse(request.url || '', true)
  const token = parsedUrl.query.token

  if (token === undefined || token === null || token === '') {
    return { token: null }
  }

  if (typeof token !== 'string') {
    return {
      token: null,
      error: 'invalid token parameter',
      statusCode: 400
    }
  }

  return { token }
}

function authorizeUpgrade (request) {
  const origin = request.headers.origin
  if (!isOriginAllowed(origin)) {
    return { authorized: false, reason: 'origin not allowed', statusCode: 401 }
  }

  const docId = getDocIdFromRequest(request)
  const tokenResult = getTokenFromRequest(request)
  if (tokenResult.error) {
    return {
      authorized: false,
      reason: tokenResult.error,
      statusCode: tokenResult.statusCode || 400
    }
  }

  const token = tokenResult.token
  if (!docId || !token) {
    return { authorized: false, reason: 'missing doc id or token', statusCode: 401 }
  }

  const payload = verifyJwt(token, Y_WEBSOCKET_SECRET)
  if (!payload) {
    return { authorized: false, reason: 'invalid token', statusCode: 401 }
  }

  if (payload.doc_id !== docId) {
    return { authorized: false, reason: 'doc id mismatch', statusCode: 401 }
  }

  // Require signed subject (OSF user GUID) for connection traceability.
  if (typeof payload.sub !== 'string' || !payload.sub) {
    return { authorized: false, reason: 'missing subject', statusCode: 401 }
  }

  return { authorized: true, docId, sub: payload.sub }
}

module.exports = {
  assertYWebsocketSecretConfigured,
  authorizeUpgrade,
  verifyJwt,
  isOriginAllowed,
  getDocIdFromRequest,
  getTokenFromRequest
}
