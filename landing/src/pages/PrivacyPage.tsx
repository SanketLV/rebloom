const CONTACT = 'sanketlakhani80@gmail.com';
const Mail = () => <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

export function PrivacyPage() {
  return (
    <div className="privacy">
      <header className="bg-olive px-[clamp(16px,4vw,56px)] py-[22px]">
        <a href="/" aria-label="Rebloom home"><img src="/assets/rebloom-logo-bloom.svg" alt="Rebloom" width={104} height={28} className="block h-7 w-auto" /></a>
      </header>
      <main className="mx-auto max-w-[680px] px-[clamp(16px,4vw,32px)] pb-24 pt-[clamp(48px,8vw,96px)] [&_h2]:mb-2 [&_h2]:mt-10 [&_h2]:font-sans [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:leading-[1.3] [&_h2]:tracking-normal">
        <h1 className="mb-3 text-[clamp(2.6rem,7vw,4rem)] leading-none">Privacy</h1>
        <p className="text-[14px]">Last updated 31 October 2026</p>
        {/* TODO before launch: GDPR wants the controller's legal name and country under "Who we are", and the
            transfer sentence is only true once Supabase's DPA is signed (dashboard: Organization > Legal Documents). */}

        <h2>Who we are</h2>
        <p>Rebloom is an independent project. You can reach us at <Mail />. We decide what happens to the data described here.</p>

        <h2>What we collect</h2>
        <p>When you join the waitlist we store three things: your email address, which of the two sign-up forms you used, and the time you joined.</p>
        <p>Like any website, the services that deliver it also keep short-lived technical logs of each request: your IP address, approximate location (city and country, worked out from the IP) and browser type. Our database provider, Supabase, keeps these logs for a limited time set by its plan and then deletes them automatically. The host that serves these pages keeps similar access logs. We use them only to keep the service running and secure.</p>
        <p>This site sets no cookies and runs no analytics or ads.</p>

        <h2>Why, and on what basis</h2>
        <p>To send you one email when Rebloom launches. We do this because you asked us to by joining (your consent). We won't send anything else, and we won't sell your address. We'll only share it with the service we use to send that one email.</p>

        <h2>Where it's kept</h2>
        <p>The waitlist is stored with Supabase on servers in the United States. If you're in the UK or EU, this means your email leaves those regions; the transfer is covered by Supabase's data processing agreement, which includes the standard contractual clauses approved for such transfers. The page's fonts are loaded from Google Fonts, which means Google sees your IP address when the page loads.</p>

        <h2>How long</h2>
        <p>Until the launch email has been sent. After that we delete the list.</p>

        <h2>Your rights</h2>
        <p>You can ask to see what we hold about you, to correct it, or to be removed from the list at any time, which also withdraws your consent. Email <Mail /> from the address you signed up with; to protect the list, we only reply to that address. We'll act within 30 days and confirm by email.</p>
        <p>If you think we've handled your data badly, you can complain to your data protection authority, for example the Information Commissioner's Office in the UK or the authority in your EU country.</p>

        <p className="!mt-12"><a href="/">Back to Rebloom</a></p>
      </main>
    </div>
  );
}
