import { createFileRoute } from "@tanstack/react-router";

import { Nav } from "@/components/site/nav";
import { Hero } from "@/components/site/hero";
import { TrustStrip } from "@/components/site/trust-strip";
import { Benefits } from "@/components/site/benefits";
import { PayHighlight } from "@/components/site/pay-highlight";
import { CtaBanner } from "@/components/site/cta-banner";
import { ApplyForm } from "@/components/site/apply-form";
import { Footer } from "@/components/site/footer";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="bg-lr-bg font-body text-lr-ink">
      <Nav />
      <main>
        <Hero />
        <TrustStrip />
        <Benefits />
        <PayHighlight />
        <CtaBanner />
        <ApplyForm />
      </main>
      <Footer />
    </div>
  );
}
