# BitBoard Deployment Guide

This guide covers deploying BitBoard to various hosting platforms.

## Prerequisites

- Node.js 20+ installed
- npm or yarn package manager
- Git repository access

## Environment Variables

BitBoard uses environment variables prefixed with `VITE_` for client-side configuration.

### Required Variables

None - BitBoard works out of the box without any required environment variables.

### Optional Variables

- `VITE_GEMINI_API_KEY`: API key for Gemini link scanning feature. If not provided, link scanning will be disabled.
- `VITE_BASE_PATH`: Base path for hosting under a subdirectory (e.g., `/bitboard/`). Defaults to `/` for root deployments.

### Setting Environment Variables

#### Local Development

Create a `.env.local` file in the project root:

```bash
VITE_GEMINI_API_KEY=your_key_here
VITE_BASE_PATH=/
```

#### Production

Set environment variables in your hosting platform's dashboard or CI/CD configuration.

## Build Process

### Local Build

```bash
# Install dependencies
npm ci

# Build for production
npm run build:prod

# Preview production build locally
npm run preview:prod
```

### Build Analysis

To analyze bundle size:

```bash
npm run analyze
```

This generates `dist/stats.html` with a visual breakdown of bundle sizes.

## Deployment Options

### Option 1: Vercel (Recommended)

Vercel provides the easiest deployment experience for React SPAs.

1. **Install Vercel CLI** (optional):
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```
   Or connect your GitHub repository in the Vercel dashboard.

3. **Configure Environment Variables**:
   - Go to Project Settings → Environment Variables
   - Add `VITE_GEMINI_API_KEY` if needed

4. **Build Settings**:
   - Build Command: `npm run build:prod`
   - Output Directory: `dist`
   - Install Command: `npm ci`

### Option 2: Netlify

1. **Connect Repository**:
   - Go to Netlify dashboard
   - Click "New site from Git"
   - Connect your repository

2. **Build Settings**:
   - Build command: `npm run build:prod`
   - Publish directory: `dist`
   - Base directory: (leave empty)

3. **Environment Variables**:
   - Go to Site Settings → Environment Variables
   - Add `VITE_GEMINI_API_KEY` if needed

4. **Deploy**:
   - Netlify will automatically deploy on push to main branch

### Option 3: Cloudflare Pages

1. **Connect Repository**:
   - Go to Cloudflare Dashboard → Pages
   - Click "Create a project" → "Connect to Git"

2. **Build Settings**:
   - Framework preset: Vite
   - Build command: `npm run build:prod`
   - Build output directory: `dist`
   - Root directory: (leave empty)

3. **Environment Variables**:
   - Go to Settings → Environment Variables
   - Add `VITE_GEMINI_API_KEY` if needed

### Option 4: GitHub Pages

1. **Update `vite.config.ts`**:
   Set `base` to your repository name:
   ```typescript
   base: '/your-repo-name/',
   ```

2. **Install GitHub Pages Action**:
   Create `.github/workflows/pages.yml`:
   ```yaml
   name: Deploy to GitHub Pages
   on:
     push:
       branches: [main]
   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: '20'
         - run: npm ci
         - run: npm run build:prod
           env:
             VITE_BASE_PATH: /your-repo-name/
         - uses: peaceiris/actions-gh-pages@v3
           with:
             github_token: ${{ secrets.GITHUB_TOKEN }}
             publish_dir: ./dist
   ```

### Option 5: Docker

1. **Build Docker Image**:
   ```bash
   docker build -t bitboard:latest .
   ```

2. **Run Container**:
   ```bash
   docker run -d -p 80:80 --name bitboard bitboard:latest
   ```

3. **With Environment Variables**:
   ```bash
   docker run -d -p 80:80 \
     -e VITE_GEMINI_API_KEY=your_key_here \
     --name bitboard bitboard:latest
   ```

4. **Health Check**:
   ```bash
   curl http://localhost/health
   ```

### Option 6: Traditional Web Server (Nginx/Apache)

1. **Build the application**:
   ```bash
   npm ci
   npm run build:prod
   ```

2. **Copy `dist/` contents** to your web server's document root

3. **Configure Nginx** (see `nginx.conf` for reference):
   - Enable gzip compression
   - Set up SPA routing (serve `index.html` for all routes)
   - Configure caching for static assets

4. **Configure Apache** (`.htaccess`):
   ```apache
   RewriteEngine On
   RewriteBase /
   RewriteRule ^index\.html$ - [L]
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule . /index.html [L]
   ```

## Post-Deployment Verification

After deployment, verify:

1. ✅ Application loads at the root URL
2. ✅ Navigation works (SPA routing)
3. ✅ Static assets load correctly (CSS, JS, images)
4. ✅ Nostr relay connections work
5. ✅ User can create posts/comments
6. ✅ Voting system functions
7. ✅ Encrypted boards work (if using)
8. ✅ Link scanning works (if `VITE_GEMINI_API_KEY` is set)

## Troubleshooting

### Build Fails

- Ensure Node.js 20+ is installed
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm ci`
- Check for TypeScript errors: `npm run lint`

### 404 Errors on Navigation

- Ensure SPA routing is configured (serve `index.html` for all routes)
- Check `VITE_BASE_PATH` matches your deployment path

### Environment Variables Not Working

- Ensure variables are prefixed with `VITE_`
- Restart the build/deployment after adding variables
- Check hosting platform's environment variable documentation

### Performance Issues

- Run `npm run analyze` to check bundle size
- Enable gzip/brotli compression on your server
- Use a CDN for static assets

## CI/CD Integration

BitBoard includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that:

1. Runs tests on every push/PR
2. Builds production bundle on push to main
3. Creates Docker image (optional)

To enable automatic deployment, configure your hosting platform to deploy on successful CI runs.

## Security Considerations

- Never commit `.env.local` or `.env` files
- Use hosting platform secrets for sensitive API keys
- Enable HTTPS (most platforms do this automatically)
- Review security headers in `nginx.conf` if using Docker

## Support

For deployment issues, check:
- [Architecture Documentation](architecture.md)
- [Services Documentation](services.md)
- GitHub Issues








