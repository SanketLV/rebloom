import { useEffect } from 'react';
import { FieldNotes } from '../components/FieldNotes';
import { Final } from '../components/Final';
import { Hero } from '../components/Hero';
import { HowItWorks } from '../components/HowItWorks';
import { OurPromise } from '../components/OurPromise';
import { startReveal } from '../lib/reveal';

export function LandingPage() {
  useEffect(() => startReveal(), []);

  return (
    <>
      <Hero />
      <main>
        <FieldNotes />
        <HowItWorks />
        <OurPromise />
      </main>
      <Final />
    </>
  );
}
