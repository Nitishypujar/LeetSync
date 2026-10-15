import type { ReactNode } from 'react';

export type LegalKind = 'privacy' | 'terms';

const CONTACT_EMAIL = '[CONTACT EMAIL]';
const LAST_UPDATED = '[DATE]';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="legal-draft">
        DRAFT — this text describes how LeetSync works today. It must be
        reviewed by a qualified professional and completed (bracketed items)
        before it is published.
      </p>
      <p>Last updated: {LAST_UPDATED}</p>

      <Section title="What LeetSync stores">
        <ul>
          <li>
            Your GitHub account identity: login, numeric GitHub user ID and
            noreply email address, used to attribute commits to you.
          </li>
          <li>
            A GitHub OAuth authorization token, encrypted at rest. It is used
            only to create the destination repository and write commits.
          </li>
          <li>
            Your LeetCode username and the link status between your accounts.
          </li>
          <li>
            Accepted submissions that LeetSync captured: problem number and
            title, language, source code, runtime, memory, submission time and
            the commit SHA written to GitHub.
          </li>
          <li>
            Session and browser-extension credentials, stored only as one-way
            hashes.
          </li>
        </ul>
      </Section>

      <Section title="What LeetSync does not receive">
        <p>
          LeetSync never receives your LeetCode password, LeetCode cookies or
          LeetCode session tokens. The browser extension reads your signed-in
          LeetCode username and submission data from LeetCode while you use it
          in your own browser.
        </p>
      </Section>

      <Section title="Public GitHub repository">
        <p>
          Solutions are committed to a repository in your GitHub account named{' '}
          <code>leetcode-solutions</code>. The current GitHub authorization
          covers public repositories, so those commits and files are public to
          anyone. Do not use LeetSync for code you need to keep private.
        </p>
      </Section>

      <Section title="How data is used">
        <p>
          Data is used only to link your accounts, capture accepted submissions,
          write them to GitHub, show your sync history and operate and secure
          the service. LeetSync does not sell personal data and does not show
          advertising.
        </p>
      </Section>

      <Section title="Service providers">
        <p>
          LeetSync relies on GitHub (authentication and repository hosting) and
          on [HOSTING PROVIDER] and [DATABASE PROVIDER] for application and
          database hosting in [REGION]. [Add any other processors, such as error
          monitoring, if used.]
        </p>
      </Section>

      <Section title="Disconnecting and deleting data">
        <p>
          Disconnect LeetCode to stop future captures and revoke the browser
          extension. Disconnect GitHub to revoke the GitHub authorization.
          Existing synced history and commits already in your GitHub repository
          are kept. Delete my data removes LeetSync's stored records. Removing
          commits from GitHub is done in GitHub itself. [State how long backups
          are retained after deletion.]
        </p>
      </Section>

      <Section title="Retention">
        <p>
          [Describe how long submissions and logs are kept while your account
          exists.]
        </p>
      </Section>

      <Section title="Security">
        <p>
          Credentials are hashed or encrypted at rest, API responses are not
          cached, and the service uses HTTPS in production. No system is
          perfectly secure, so please keep your devices and accounts protected.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions or deletion requests:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </>
  );
}

function TermsOfService() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="legal-draft">
        DRAFT — this text must be reviewed by a qualified professional and
        completed (bracketed items) before it is published.
      </p>
      <p>Last updated: {LAST_UPDATED}</p>

      <Section title="The service">
        <p>
          LeetSync is a tool that copies your own accepted LeetCode submissions
          into a GitHub repository in your account. It is an independent project
          and is not affiliated with or endorsed by LeetCode or GitHub.
        </p>
      </Section>

      <Section title="Your responsibilities">
        <ul>
          <li>Use LeetSync only with accounts that you own and control.</li>
          <li>
            Comply with the terms of LeetCode and GitHub. LeetSync uses LeetCode
            pages and endpoints that are not an official public API, so they may
            change or stop working.
          </li>
          <li>
            Keep your browser, extension and GitHub authorization secure, and
            disconnect the extension on any device you lose access to.
          </li>
        </ul>
      </Section>

      <Section title="Accuracy and availability">
        <p>
          LeetSync is provided as is, without warranties of any kind. Sync may
          be delayed, incomplete or fail, and GitHub contribution graphs depend
          on GitHub's own rules. Historical backfill of earlier submissions is
          not included.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, [OPERATOR] is not liable for
          indirect or consequential losses arising from use of LeetSync.
        </p>
      </Section>

      <Section title="Termination">
        <p>
          You may stop using LeetSync at any time by disconnecting your accounts
          or deleting your data. [OPERATOR] may suspend accounts that abuse the
          service.
        </p>
      </Section>

      <Section title="Changes and governing law">
        <p>
          [OPERATOR] may update these terms and will change the date above.
          These terms are governed by the laws of [JURISDICTION].
        </p>
      </Section>

      <Section title="Contact">
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </>
  );
}

export function LegalPage({ kind }: { kind: LegalKind }) {
  return (
    <main className="app-shell legal-page">
      <div className="legal-card">
        <nav className="legal-nav">
          <a href="/">← Back to LeetSync</a>
        </nav>
        {kind === 'privacy' ? <PrivacyPolicy /> : <TermsOfService />}
      </div>
    </main>
  );
}
