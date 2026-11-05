#!/usr/bin/env node

const WebSocket = require('ws')
const http = require('http')
const number = require('lib0/number')
const wss = new WebSocket.Server({ noServer: true })
const setupWSConnection = require('./bin/utils.cjs').setupWSConnection
const {
  assertYWebsocketSecretConfigured,
  authorizeUpgrade
} = require('./auth.cjs')

assertYWebsocketSecretConfigured()

const host = process.env.HOST || 'localhost'
const port = number.parseInt(process.env.PORT || '1234')

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('okay')
})

wss.on('connection', setupWSConnection)

server.on('upgrade', (request, socket, head) => {
  const authResult = authorizeUpgrade(request)
  if (!authResult.authorized) {
    const statusCode = authResult.statusCode || 401
    const statusText = statusCode === 400 ? 'Bad Request' : 'Unauthorized'
    socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\n\r\n`)
    socket.destroy()
    return
  }

  console.log(
    `authorized connection docId=${authResult.docId} sub=${authResult.sub}`
  )

  wss.handleUpgrade(request, socket, head, /** @param {any} ws */ ws => {
    wss.emit('connection', ws, request)
  })
})

server.listen(port, host, () => {
  console.log(`running at '${host}' on port ${port} with auth enabled`)
})
