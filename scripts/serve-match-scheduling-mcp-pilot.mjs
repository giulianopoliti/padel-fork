import { createServer } from 'node:http'
import pilot from './match-scheduling-mcp-pilot.mjs'

const port = 8787
const baseUrl = `http://127.0.0.1:${port}`
const maxBodyBytes = 16 * 1024
const usePublicTools = process.argv.includes('--public')
const publicMcpUrl = 'http://127.0.0.1:3000/api/mcp'

const server = createServer({ requestTimeout: 10_000 }, async (incoming, outgoing) => {
  try {
    const chunks = []
    let bodyBytes = 0

    if (incoming.method === 'POST') {
      for await (const chunk of incoming.iterator({ destroyOnReturn: false })) {
        bodyBytes += chunk.length
        if (bodyBytes > maxBodyBytes) {
          outgoing.writeHead(413, { Connection: 'close' })
          outgoing.end()
          return
        }
        chunks.push(chunk)
      }
    }

    const target = new URL(baseUrl)
    target.pathname = incoming.url?.split('?')[0] || '/'
    const request = new Request(target, {
      method: incoming.method,
      headers: incoming.headers,
      body: incoming.method === 'POST' ? Buffer.concat(chunks) : undefined,
    })
    const response = usePublicTools && target.pathname === '/mcp' && incoming.method === 'POST'
      ? await fetch(publicMcpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.concat(chunks),
          signal: AbortSignal.timeout(15_000),
        })
      : await pilot.fetch(request)

    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch {
    outgoing.writeHead(503)
    outgoing.end('No se pudo consultar el servidor MCP. Si usás --public, iniciá Padel FV en el puerto 3000.')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`MCP de solo lectura (${usePublicTools ? 'consultas públicas de Padel FV' : 'demo'}) en ${baseUrl}/mcp`)
})
