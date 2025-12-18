# BitBoard Deployment Checklist

Use this checklist to ensure a smooth deployment process.

## Pre-Deployment

### Code Quality

- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] No TypeScript errors
- [ ] Code is formatted (`npm run format`)
- [ ] All critical features are implemented
- [ ] Error boundary is in place
- [ ] Error tracking is configured (optional)

### Build Verification

- [ ] Production build succeeds (`npm run build:prod`)
- [ ] Build output is tested locally (`npm run preview:prod`)
- [ ] Bundle size is reasonable (check with `npm run analyze`)
- [ ] No console errors in production build
- [ ] All assets load correctly (images, fonts, CSS)
- [ ] SPA routing works (test navigation)

### Environment Configuration

- [ ] Environment variables documented
- [ ] `.env.example` created (or documented in deployment.md)
- [ ] Production environment variables set in hosting platform
- [ ] Optional features configured (Gemini API key, Sentry DSN)

### Security

- [ ] No sensitive data in code or build output
- [ ] Environment variables are secure (not committed)
- [ ] HTTPS is enabled (most platforms do this automatically)
- [ ] Security headers configured (if using custom server)
- [ ] Content Security Policy reviewed (if applicable)

## Deployment Steps

### 1. Choose Hosting Platform

- [ ] Platform selected (Vercel/Netlify/Cloudflare Pages/etc.)
- [ ] Account created and configured
- [ ] Repository connected (if using Git-based deployment)

### 2. Configure Build Settings

- [ ] Build command: `npm run build:prod`
- [ ] Output directory: `dist`
- [ ] Node version: 20+
- [ ] Install command: `npm ci`

### 3. Set Environment Variables

- [ ] `VITE_GEMINI_API_KEY` (if using link scanning)
- [ ] `VITE_SENTRY_DSN` (if using error tracking)
- [ ] `VITE_BASE_PATH` (if hosting under subdirectory)

### 4. Deploy

- [ ] Initial deployment triggered
- [ ] Build completes successfully
- [ ] Deployment URL is accessible

## Post-Deployment Verification

### Functionality Tests

- [ ] Application loads at root URL
- [ ] Navigation works (SPA routing)
- [ ] Static assets load (CSS, JS, images)
- [ ] Fonts load correctly
- [ ] Theme switching works
- [ ] Identity creation/connection works
- [ ] Post creation works
- [ ] Comment creation works
- [ ] Voting works
- [ ] Board creation works
- [ ] Encrypted boards work (if applicable)
- [ ] Link scanning works (if Gemini API key is set)
- [ ] Bookmarks work
- [ ] Search works
- [ ] Profile viewing works

### Performance Checks

- [ ] Initial page load is fast (< 3 seconds)
- [ ] No console errors
- [ ] No network errors (check browser DevTools)
- [ ] Images load efficiently
- [ ] Fonts load without FOUT/FOIT
- [ ] Infinite scroll works smoothly

### Cross-Browser Testing

- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

### Error Handling

- [ ] Error boundary catches React errors
- [ ] Error messages are user-friendly
- [ ] Error tracking is working (if configured)
- [ ] Offline mode works (if applicable)

### SEO & Meta Tags

- [ ] Page title is correct
- [ ] Meta description is present
- [ ] Open Graph tags work (test with social media debugger)
- [ ] Twitter Card tags work
- [ ] Favicon loads
- [ ] Manifest.json is accessible

## Monitoring Setup

### Error Tracking (Optional)

- [ ] Sentry DSN configured
- [ ] Error tracking service initialized
- [ ] Test error is captured
- [ ] Alerts configured (if desired)

### Analytics (Optional)

- [ ] Analytics configured (if desired)
- [ ] Privacy policy updated (if using analytics)

## Documentation Updates

- [ ] README.md updated with deployment info
- [ ] Deployment guide is accurate
- [ ] Environment variables documented
- [ ] Troubleshooting section updated

## Rollback Plan

- [ ] Previous deployment version is accessible
- [ ] Rollback procedure is documented
- [ ] Team knows how to rollback if needed

## Post-Launch

### First 24 Hours

- [ ] Monitor error tracking (if configured)
- [ ] Check server logs for issues
- [ ] Monitor user feedback
- [ ] Verify all features work in production

### First Week

- [ ] Review performance metrics
- [ ] Check for any recurring errors
- [ ] Gather user feedback
- [ ] Plan any necessary fixes

## Troubleshooting

### Common Issues

**Build fails:**

- Check Node.js version (needs 20+)
- Clear `node_modules` and reinstall
- Check for TypeScript errors
- Verify all dependencies are installed

**404 errors on navigation:**

- Ensure SPA routing is configured
- Check `VITE_BASE_PATH` matches deployment path
- Verify hosting platform supports SPA routing

**Environment variables not working:**

- Ensure variables are prefixed with `VITE_`
- Restart build after adding variables
- Check hosting platform's env var documentation

**Performance issues:**

- Run `npm run analyze` to check bundle size
- Enable gzip/brotli compression
- Use CDN for static assets
- Check network tab for slow requests

## Success Criteria

Deployment is successful when:

- ✅ All functionality tests pass
- ✅ No critical errors in production
- ✅ Performance is acceptable
- ✅ Users can access and use the application
- ✅ Error tracking is working (if configured)

## Support

If you encounter issues:

1. Check [Deployment Guide](deployment.md)
2. Review [Architecture Documentation](architecture.md)
3. Check GitHub Issues
4. Open a new issue if needed
