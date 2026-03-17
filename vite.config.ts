import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function serveStaticDir(prefix: string, dir: string) {
  return (req: any, res: any, next: () => void) => {
    if (!req.url?.startsWith(prefix)) return next()
    const subPath = req.url.slice(prefix.length).replace(/^\//, '') || 'index.html'
    const filePath = path.join(dir, decodeURIComponent(subPath))
    if (!filePath.startsWith(dir)) return next()
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) return next()
      const ext = path.extname(filePath)
      const types: Record<string, string> = {
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.json': 'application/json',
        '.pdf': 'application/pdf',
      }
      res.setHeader('Content-Type', types[ext] || 'application/octet-stream')
      fs.createReadStream(filePath).pipe(res)
    })
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-res-folders',
      configureServer(server) {
        const manifestPath = path.resolve(__dirname, 'public', 'assets-manifest.json')
        const fallbackDirs = [
          { name: 'ios res', dir: path.resolve(__dirname, 'ios res') },
          { name: 'android res', dir: path.resolve(__dirname, 'android res') },
        ]
        let dirs = fallbackDirs
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
            if (manifest.folders?.length) {
              dirs = manifest.folders.map((f: { name: string }) => ({
                name: f.name,
                dir: path.resolve(__dirname, f.name),
              }))
            }
          } catch (_) {}
        }
        for (const { name, dir } of dirs) {
          const prefix = '/' + encodeURIComponent(name) + '/'
          server.middlewares.use(serveStaticDir(prefix, dir))
        }
      },
    },
  ],
  root: '.',
  publicDir: 'public',
  server: {
    fs: {
      allow: ['.', '..'],
    },
  },
})
