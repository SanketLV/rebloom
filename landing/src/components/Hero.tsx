import { WaitlistForm } from './WaitlistForm';

export function Hero() {
  return (
    <header className="hero relative isolate flex min-h-[100svh] flex-col overflow-hidden text-surface">
      <div className="hero-media" aria-hidden="true" />
      <nav className="wrap flex w-full items-center justify-between py-[22px] [&_a]:px-1 [&_a]:py-3 [&_a]:text-[15px] [&_a]:font-semibold [&_a]:no-underline" aria-label="Main">
        <a href="/" aria-label="Rebloom home"><img src="/assets/rebloom-logo-bloom.svg" alt="Rebloom" width={111} height={30} className="h-[30px] w-auto" /></a>
        <a href="#how" className="hover:underline hover:underline-offset-4">How it works</a>
      </nav>
      <div className="wrap mt-auto w-full pb-[clamp(32px,7vh,72px)]">
        <h1 className="max-w-[11ch] text-[clamp(3.6rem,12.5vw,11.5rem)] leading-[.88] tracking-[-0.03em]">Bring your plant back to life.</h1>
        <p className="mt-7 max-w-[34ch] text-[clamp(17px,1.6vw,20px)] text-surface/[.82]">Photograph a struggling plant, learn what's wrong, and follow a plan until it recovers.</p>
        <div className="mt-9 flex flex-wrap items-end justify-between gap-x-16 gap-y-7">
          <WaitlistForm source="hero" />
          <p className="max-w-[30ch] text-[14px] leading-[1.45] text-surface/70">Free first diagnosis. One email when Rebloom launches, nothing else. <a className="tap-link" href="privacy.html">Privacy</a></p>
        </div>
      </div>
    </header>
  );
}
