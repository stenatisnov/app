import { Hero } from "./Hero";
import { AboutSection } from "./AboutSection";
import { PricingTeaser } from "./PricingTeaser";
import { ContactSection } from "./ContactSection";

/** Public landing page shown to signed-out visitors at `/`. */
export function MarketingLanding() {
  return (
    <div className="flex flex-col">
      <Hero />
      <AboutSection />
      <PricingTeaser />
      <ContactSection />
    </div>
  );
}
