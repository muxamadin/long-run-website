import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";

export const applicationSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name"),
  phone: z.string().trim().min(7, "Enter a valid phone number"),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  cdlClass: z.enum(["a", "b", "permit"]),
  experience: z.enum(["new", "1-2", "3-5", "5+"]),
  drivingType: z.enum(["solo", "team", "either"]),
  homeBase: z.string().trim().max(120).optional().or(z.literal("")),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

export const submitApplication = createServerFn({ method: "POST" })
  .inputValidator(applicationSchema)
  .handler(async ({ data }) => {
    const { DB } = bindings();
    if (!DB) {
      throw new Error("Application storage is not available right now.");
    }

    await DB.prepare(
      `INSERT INTO driver_applications
        (full_name, phone, email, cdl_class, experience, driving_type, home_base, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        data.fullName,
        data.phone,
        data.email || null,
        data.cdlClass,
        data.experience,
        data.drivingType,
        data.homeBase || null,
        data.message || null,
      )
      .run();

    return { ok: true as const };
  });
