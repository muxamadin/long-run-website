import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { CaretDown } from "@phosphor-icons/react";

import { StructuredData } from "@/components/StructuredData";
import { Reveal } from "./reveal";

const FAQS = [
  {
    question: "Do I need experience to apply?",
    answer:
      "No. We welcome new drivers as well as experienced solo and team drivers. Tell us your experience level on the application and we will match you with the right route.",
  },
  {
    question: "How often do I get paid?",
    answer:
      "Every week, direct deposit straight to your account. No waiting on paper checks.",
  },
  {
    question: "What kind of trucks will I drive?",
    answer:
      "Modern, clean, well-maintained trucks kept in top condition, not older equipment nearing retirement.",
  },
  {
    question: "Is dispatch forced?",
    answer:
      "No. LongRun runs a no forced dispatch policy, so you have a say in the loads you run.",
  },
  {
    question: "Do you hire team drivers?",
    answer:
      "Yes. Team drivers earn $0.90 to $1.00 per mile combined, split between both drivers, in addition to solo positions at $0.70 to $0.75 per mile.",
  },
  {
    question: "How much home time will I get?",
    answer:
      "Home time is flexible and worked out with our dispatch team around your route, not a rigid forced schedule.",
  },
  {
    question: "Can I bring my pet or a rider?",
    answer:
      "Yes. LongRun is pet and rider friendly, so you do not have to choose between the road and your family.",
  },
];

const FAQ_SCHEMA = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
});

export function Faq() {
  return (
    <section id="faq" className="bg-lr-bg py-20 sm:py-28">
      <StructuredData json={FAQ_SCHEMA} />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl font-semibold uppercase tracking-tight text-lr-ink sm:text-4xl">
            Questions drivers ask us
          </h2>
          <p className="mt-3 font-body text-base text-lr-ink-dim">
            Straight answers, before you apply.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-10">
          <AccordionPrimitive.Root type="single" collapsible className="flex flex-col gap-3">
            {FAQS.map((faq) => (
              <AccordionPrimitive.Item
                key={faq.question}
                value={faq.question}
                className="overflow-hidden rounded-2xl border border-lr-border bg-lr-surface"
              >
                <AccordionPrimitive.Header>
                  <AccordionPrimitive.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left font-body text-base font-semibold text-lr-ink">
                    {faq.question}
                    <CaretDown
                      weight="bold"
                      className="size-4 shrink-0 text-lr-blue-light transition-transform duration-300 group-data-[state=open]:rotate-180"
                    />
                  </AccordionPrimitive.Trigger>
                </AccordionPrimitive.Header>
                <AccordionPrimitive.Content className="overflow-hidden px-6 font-body text-sm text-lr-ink-dim data-[state=open]:pb-5 data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                  {faq.answer}
                </AccordionPrimitive.Content>
              </AccordionPrimitive.Item>
            ))}
          </AccordionPrimitive.Root>
        </Reveal>
      </div>
    </section>
  );
}
