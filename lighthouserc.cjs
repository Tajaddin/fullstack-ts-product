// Lighthouse CI against a running production server (npm run build && npm run start). Mobile is the
// default Lighthouse device and throttling, which is what the README's scores refer to.
const base = process.env.LHCI_BASE_URL ?? "http://localhost:3100";

module.exports = {
  ci: {
    collect: {
      url: [`${base}/`, `${base}/courses`, `${base}/privacy`],
      numberOfRuns: 3,
      settings: {
        chromeFlags: "--headless=new --no-sandbox --disable-gpu",
        skipAudits: ["uses-http2", "is-on-https", "redirects-http"],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.9 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
