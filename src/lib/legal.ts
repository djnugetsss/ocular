import * as WebBrowser from 'expo-web-browser';

/**
 * Canonical legal documents.
 *
 * App Review requires a reachable privacy policy URL both in App Store
 * Connect and inside the app, and Guideline 5.1.1(v) expects the account
 * deletion path to be findable next to it. These are the one place those URLs
 * live, so a change never has to be chased across screens.
 *
 * NOTE: both pages must be live and reachable *before* submission — a 404
 * here is a rejection, and it is the kind that costs a full review cycle.
 * Both were verified reachable (HTTP 200) on 2026-07-31.
 *
 * The `.html` extensions are load-bearing: the site is static, and the
 * extensionless paths these used to point at do not resolve.
 *
 * The privacy policy URL must additionally be entered in App Store Connect,
 * which reads its own metadata field rather than anything in this file.
 */
export const LEGAL_URLS = {
  privacyPolicy: 'https://ocular-website-beta.vercel.app/privacy.html',
  terms: 'https://ocular-website-beta.vercel.app/terms.html',
} as const;

/**
 * Opens a legal page in an in-app browser sheet.
 *
 * `openBrowserAsync` rather than `Linking.openURL`: bouncing the user out to
 * Safari mid-signup loses the form they were filling in, and the SFSafariView
 * sheet keeps the app in the background where they left it. Failures are
 * swallowed — a legal link that cannot open should never block account
 * creation, and the URL is also in App Store Connect.
 */
export async function openLegalPage(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
  } catch {
    // Intentionally silent; see above.
  }
}
