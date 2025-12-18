# CI/CD Troubleshooting Guide

This guide helps diagnose and fix common GitHub Actions workflow failures.

## Common Issues

### 1. Test Failures

**Symptoms:**
- `npm test` step fails
- Tests timeout or crash

**Solutions:**

1. **Missing test dependencies:**
   ```bash
   npm install --save-dev @testing-library/react @testing-library/jest-dom jsdom
   ```

2. **Test setup issues:**
   - Verify `tests/setup.ts` exists and is configured correctly
   - Check `vite.config.ts` has `setupFiles: ['./tests/setup.ts']`

3. **Mock issues:**
   - Ensure all mocked services are properly set up
   - Check that `vi.mock()` calls are correct

4. **Run tests locally:**
   ```bash
   npm ci
   npm test
   ```

### 2. Build Failures

**Symptoms:**
- `npm run build:prod` fails
- TypeScript errors
- Missing dependencies

**Solutions:**

1. **TypeScript errors:**
   ```bash
   npm run lint
   # Fix any TypeScript errors
   ```

2. **Missing dependencies:**
   ```bash
   npm ci
   # Verify package.json is committed
   ```

3. **Environment variables:**
   - Build should work without optional env vars (Gemini, Sentry)
   - If build requires them, set in GitHub Secrets

### 3. Linter Failures

**Symptoms:**
- `npm run lint` fails
- ESLint errors

**Solutions:**

1. **Fix linting errors:**
   ```bash
   npm run lint
   # Fix reported errors
   npm run format  # Auto-fix formatting
   ```

2. **Check ESLint config:**
   - Verify `eslint.config.js` is valid
   - Ensure all plugins are installed

### 4. Docker Build Failures

**Symptoms:**
- Docker build step fails
- Image build errors

**Solutions:**

1. **Test Docker build locally:**
   ```bash
   docker build -t bitboard:test .
   ```

2. **Check Dockerfile:**
   - Verify all paths are correct
   - Ensure `nginx.conf` exists
   - Check that `dist/` is created by build step

3. **Build context:**
   - Ensure `.dockerignore` is correct
   - Verify all required files are included

### 5. Missing Dependencies

**Symptoms:**
- `npm ci` fails
- Package not found errors

**Solutions:**

1. **Verify package.json:**
   - Ensure all dependencies are listed
   - Check `package-lock.json` is committed

2. **Clear cache:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

## Debugging Workflow

### View Workflow Logs

1. Go to GitHub repository
2. Click "Actions" tab
3. Click on failed workflow run
4. Click on failed job
5. Expand failed step to see error details

### Run Locally

To debug issues locally, simulate CI environment:

```bash
# Install dependencies (like CI does)
npm ci

# Run linter
npm run lint

# Run tests
npm test

# Build
npm run build:prod
```

### Common Error Messages

**"Missing script: build:prod"**
- Solution: Verify `package.json` has the script
- Check: `npm run` to list all scripts

**"Cannot find module '@testing-library/react'"**
- Solution: Add to `devDependencies` in `package.json`
- Run: `npm install --save-dev @testing-library/react`

**"Test suite failed to run"**
- Solution: Check `tests/setup.ts` exists and is correct
- Verify: `vite.config.ts` test configuration

**"Docker build failed"**
- Solution: Test Dockerfile locally first
- Check: All required files exist (nginx.conf, etc.)

## Workflow Structure

The workflow has three jobs:

1. **test** - Runs linter and tests (required)
2. **build** - Builds production bundle (runs on push)
3. **docker-build** - Builds Docker image (runs on main/master push)

If `test` fails, `build` won't run. If `build` fails, `docker-build` won't run.

## Quick Fixes

### Skip Tests Temporarily (Not Recommended)

If you need to deploy urgently, you can temporarily skip tests:

```yaml
- name: Run tests
  run: npm test
  continue-on-error: true  # Don't do this in production!
```

### Skip Docker Build

Docker build is optional. If it fails, you can still deploy using other methods (Vercel, Netlify, etc.).

## Getting Help

If issues persist:

1. Check workflow logs for specific error messages
2. Run commands locally to reproduce
3. Check GitHub Issues for similar problems
4. Review [Deployment Guide](deployment.md) for alternatives

## Prevention

To prevent CI failures:

1. **Run tests before pushing:**
   ```bash
   npm test
   ```

2. **Check linting:**
   ```bash
   npm run lint
   ```

3. **Test build locally:**
   ```bash
   npm run build:prod
   npm run preview:prod
   ```

4. **Keep dependencies updated:**
   ```bash
   npm audit
   npm update
   ```



