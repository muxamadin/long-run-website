import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, Phone, WarningCircle } from "@phosphor-icons/react";

import { applicationSchema, submitApplication, type ApplicationInput } from "@/lib/api/applications.functions";
import { Reveal } from "./reveal";
import { CALL_LABEL, PHONE_HREF } from "./site-content";

const fieldClass =
  "w-full rounded-lg border border-lr-border bg-lr-bg px-4 py-2.5 font-body text-sm text-lr-ink placeholder:text-lr-ink-dim/60 outline-none transition-colors focus:border-lr-blue focus:ring-2 focus:ring-lr-blue/30";
const labelClass = "font-body text-sm font-medium text-lr-ink";
const errorClass = "mt-1.5 flex items-center gap-1.5 font-body text-xs text-red-400";

export function ApplyForm() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationInput>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      cdlClass: "a",
      experience: "new",
      drivingType: "solo",
      homeBase: "",
      message: "",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    try {
      setStatus("idle");
      await submitApplication({ data });
      setStatus("success");
      reset();
    } catch {
      setStatus("error");
    }
  });

  return (
    <section id="apply" className="bg-lr-bg py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:px-8">
        <Reveal>
          <p className="font-body text-sm font-semibold uppercase tracking-[0.14em] text-lr-blue-light">
            Apply in two minutes
          </p>
          <h2 className="mt-4 font-display text-3xl font-semibold uppercase tracking-tight text-lr-ink sm:text-4xl">
            Ready to drive with us
          </h2>
          <p className="mt-4 max-w-md font-body text-base text-lr-ink-dim">
            Fill out the form and a member of our dispatch team will call you
            back, usually the same day.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <a
              href={PHONE_HREF}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-lr-border bg-lr-surface px-5 py-2.5 font-body text-sm font-semibold text-lr-ink transition-colors hover:border-lr-blue/50"
            >
              <Phone weight="fill" className="size-4 text-lr-blue-light" />
              Call or text {CALL_LABEL}
            </a>
            <p className="font-body text-sm text-lr-ink-dim">
              We speak English and Espanol. Tambien hablamos espanol.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-lr-border bg-lr-surface p-6 sm:p-8"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="fullName">
                  Full name
                </label>
                <input id="fullName" className={fieldClass} {...register("fullName")} />
                {errors.fullName ? (
                  <span className={errorClass}>
                    <WarningCircle weight="fill" className="size-3.5" />
                    {errors.fullName.message}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="phone">
                  Phone
                </label>
                <input id="phone" type="tel" className={fieldClass} {...register("phone")} />
                {errors.phone ? (
                  <span className={errorClass}>
                    <WarningCircle weight="fill" className="size-3.5" />
                    {errors.phone.message}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className={labelClass} htmlFor="email">
                  Email <span className="text-lr-ink-dim">(optional)</span>
                </label>
                <input id="email" type="email" className={fieldClass} {...register("email")} />
                {errors.email ? (
                  <span className={errorClass}>
                    <WarningCircle weight="fill" className="size-3.5" />
                    {errors.email.message}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="cdlClass">
                  CDL class
                </label>
                <select id="cdlClass" className={fieldClass} {...register("cdlClass")}>
                  <option value="a">Class A</option>
                  <option value="b">Class B</option>
                  <option value="permit">Permit</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="experience">
                  Experience
                </label>
                <select id="experience" className={fieldClass} {...register("experience")}>
                  <option value="new">New driver</option>
                  <option value="1-2">1 to 2 years</option>
                  <option value="3-5">3 to 5 years</option>
                  <option value="5+">5+ years</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="drivingType">
                  Driving preference
                </label>
                <select id="drivingType" className={fieldClass} {...register("drivingType")}>
                  <option value="solo">Solo</option>
                  <option value="team">Team</option>
                  <option value="either">Either</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="homeBase">
                  Home base <span className="text-lr-ink-dim">(city, state)</span>
                </label>
                <input id="homeBase" className={fieldClass} {...register("homeBase")} />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className={labelClass} htmlFor="message">
                  Anything else we should know?{" "}
                  <span className="text-lr-ink-dim">(optional)</span>
                </label>
                <textarea
                  id="message"
                  rows={3}
                  className={fieldClass}
                  {...register("message")}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 w-full rounded-full bg-lr-blue px-6 py-3.5 font-body text-base font-semibold text-white transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : "Submit application"}
            </button>

            {status === "success" ? (
              <p className="mt-4 flex items-center gap-2 font-body text-sm font-medium text-emerald-400">
                <CheckCircle weight="fill" className="size-4" />
                Application received. We will call you soon.
              </p>
            ) : null}
            {status === "error" ? (
              <p className="mt-4 flex items-center gap-2 font-body text-sm font-medium text-red-400">
                <WarningCircle weight="fill" className="size-4" />
                Something went wrong. Please call or text us instead.
              </p>
            ) : null}
          </form>
        </Reveal>
      </div>
    </section>
  );
}
