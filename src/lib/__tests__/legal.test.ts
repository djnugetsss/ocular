import { LEGAL_URLS } from '../legal';

/**
 * A dead legal URL is an App Review rejection (Guideline 5.1.1), and it is the
 * kind that costs a full review cycle. These assertions are cheap insurance
 * against the two ways that has nearly happened already: a placeholder host
 * shipping unnoticed, and the extensionless paths that the static site does
 * not actually serve.
 *
 * Reachability itself is not asserted here — a test suite that fails when the
 * network is down is a test suite people learn to ignore. Both URLs were
 * verified 200 by hand on 2026-07-31.
 */
describe('legal URLs', () => {
  const urls = Object.entries(LEGAL_URLS);

  it.each(urls)('%s is an absolute https URL', (_name, url) => {
    expect(url).toMatch(/^https:\/\//);
    expect(() => new URL(url)).not.toThrow();
  });

  it.each(urls)('%s points at the live site, not a placeholder', (_name, url) => {
    const { hostname } = new URL(url);

    expect(hostname).toBe('ocular-website-beta.vercel.app');
    // The hosts these have previously pointed at, none of which resolve.
    expect(hostname).not.toBe('ocular.app');
    expect(hostname).not.toMatch(/localhost|example\.com|127\.0\.0\.1/);
  });

  it.each(urls)('%s keeps the .html extension the static site requires', (_name, url) => {
    // The site serves `privacy.html`, not `privacy`. Dropping the extension
    // is a 404, and it is the specific mistake this file replaced.
    expect(new URL(url).pathname).toMatch(/\.html$/);
  });

  it('points the two documents at different pages', () => {
    expect(LEGAL_URLS.privacyPolicy).not.toBe(LEGAL_URLS.terms);
    expect(LEGAL_URLS.privacyPolicy).toContain('privacy');
    expect(LEGAL_URLS.terms).toContain('terms');
  });
});
